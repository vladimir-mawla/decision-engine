import { describe, expect, it } from "vitest";
import { parseAction, parseDecision } from "../validation.js";
import { parseConfidence } from "../confidence.js";

/**
 * Real input arrives as JSON. Every one of these constructs genuinely
 * malformed input (the kind `JSON.parse` would happily hand back) and
 * asserts a typed error comes back — never a thrown exception, never a
 * silently-accepted best-case guess.
 */
describe("parseAction — runtime validation, never an unhandled throw", () => {
  const validRaw = {
    domain: "refund-approval",
    type: "issue-refund",
    parameters: { amount: 5 },
    costOfBeingWrong: 5,
    reversibility: "reversible-with-cost",
  };

  it("accepts a well-formed action", () => {
    const result = parseAction(validRaw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.domain).toBe("refund-approval");
      expect(result.value.reversibility).toBe("reversible-with-cost");
    }
  });

  it.each([
    ["null", null],
    ["a string", "not an action"],
    ["a number", 42],
    ["an array", []],
    ["undefined", undefined],
  ])("rejects a malformed action that is %s, without throwing", (_label, raw) => {
    expect(() => parseAction(raw)).not.toThrow();
    const result = parseAction(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("not-an-object");
  });

  it("rejects a missing domain, without throwing", () => {
    const { domain, ...rest } = validRaw;
    void domain;
    const result = parseAction(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "missing-field", field: "domain" });
  });

  it("rejects a negative cost, without throwing", () => {
    const result = parseAction({ ...validRaw, costOfBeingWrong: -5 });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "invalid-cost") {
      expect(result.error.detail.kind).toBe("negative-cost");
    } else {
      throw new Error("expected invalid-cost/negative-cost");
    }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects a non-finite cost (%s), without throwing",
    (badCost) => {
      const result = parseAction({ ...validRaw, costOfBeingWrong: badCost });
      expect(result.ok).toBe(false);
      if (!result.ok && result.error.kind === "invalid-cost") {
        expect(result.error.detail.kind).toBe("non-finite-cost");
      } else {
        throw new Error("expected invalid-cost/non-finite-cost");
      }
    },
  );

  it("rejects an unknown reversibility level, without throwing", () => {
    const result = parseAction({ ...validRaw, reversibility: "sort-of-reversible-i-guess" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown-reversibility");
  });

  it("rejects non-object parameters, without throwing", () => {
    const result = parseAction({ ...validRaw, parameters: "not an object" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid-field");
  });
});

describe("parseConfidence — runtime validation", () => {
  it.each([-0.01, 1.01, -5, 5])("rejects confidence %s outside 0..1, without throwing", (bad) => {
    expect(() => parseConfidence(bad)).not.toThrow();
    const result = parseConfidence(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("confidence-out-of-range");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])("rejects non-finite confidence %s, without throwing", (bad) => {
    const result = parseConfidence(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("confidence-not-finite");
  });

  it.each([0, 1, 0.5, 0.0001, 0.9999])("accepts confidence %s at and inside the 0..1 boundary", (good) => {
    const result = parseConfidence(good);
    expect(result.ok).toBe(true);
  });
});

describe("parseDecision — runtime validation of the five outcomes from raw JSON", () => {
  const action = {
    domain: "code-deploy",
    type: "deploy",
    parameters: {},
    costOfBeingWrong: 50_000,
    reversibility: "irreversible",
  };

  it("accepts a well-formed execute decision", () => {
    const result = parseDecision({ outcome: "execute", action, confidence: 0.99, confidenceBar: 0.978 });
    expect(result.ok).toBe(true);
  });

  it("rejects an execute decision with confidence outside 0..1, without throwing", () => {
    const result = parseDecision({ outcome: "execute", action, confidence: 1.5, confidenceBar: 0.9 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid-confidence");
  });

  it("rejects an ask decision whose missing fact has no `fact`, without throwing", () => {
    const result = parseDecision({
      outcome: "ask",
      action,
      missing: { kind: "fact", counterparty: "requester" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "missing-field", field: "missing.fact" });
  });

  it("rejects a defer decision missing `reconsiderAt`, without throwing", () => {
    const result = parseDecision({
      outcome: "defer",
      action,
      missing: { kind: "time", waitingOn: "cooldown" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "missing-field", field: "missing.reconsiderAt" });
  });

  it("rejects an escalate decision with no `reason`, without throwing", () => {
    const result = parseDecision({ outcome: "escalate", action, missing: { kind: "human-judgment" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "missing-field", field: "missing.reason" });
  });

  it("rejects a refuse decision with no `reason`, without throwing", () => {
    const result = parseDecision({ outcome: "refuse", action });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "missing-field", field: "reason" });
  });

  it("rejects an unknown outcome string, without throwing", () => {
    const result = parseDecision({ outcome: "maybe", action });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown-outcome");
  });

  it("rejects a decision whose action is itself malformed, without throwing", () => {
    const result = parseDecision({ outcome: "refuse", action: { domain: "x" }, reason: "no" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid-action");
  });

  it.each([null, "nope", 42, undefined])("never throws on completely non-object input (%p)", (raw) => {
    expect(() => parseDecision(raw)).not.toThrow();
    expect(parseDecision(raw).ok).toBe(false);
  });
});
