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

/**
 * Real `JSON.parse` output can never contain a getter or a Proxy — but the
 * module comment at the top of validation.ts promises something narrower
 * and stronger than "handles JSON": it promises that reading a hostile
 * accessor never escapes as an exception, only ever as a structured
 * Result. These tests are the reproductions that promise is checked
 * against, covering the whole family: an own throwing getter, a throwing
 * getter inherited from the prototype chain, a Proxy whose `get` trap
 * throws, a Proxy whose `has`/`ownKeys`/`getOwnPropertyDescriptor` traps
 * throw (never invoked by these parsers at all, so they must not matter),
 * and a value whose `valueOf`/`toString` throws when coerced (never
 * coerced by these parsers, since every check is `typeof`).
 */
describe("hostile accessors never escape parseAction/parseDecision as exceptions", () => {
  const validAction = {
    domain: "refund-approval",
    type: "issue-refund",
    parameters: { amount: 5 },
    costOfBeingWrong: 5,
    reversibility: "reversible-with-cost",
  };

  it("an own getter that throws on `domain` becomes a structured failure, not a throw", () => {
    const hostile = Object.defineProperty({}, "domain", {
      get() {
        throw new Error("x");
      },
      enumerable: true,
    });
    expect(() => parseAction(hostile)).not.toThrow();
    const result = parseAction(hostile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "missing-field", field: "domain" });
  });

  it("a Proxy whose `get` trap throws for one property becomes a structured failure, not a throw", () => {
    const hostile = new Proxy(
      { ...validAction },
      {
        get(t, p) {
          if (p === "type") throw new Error("x");
          return (t as Record<string, unknown>)[p as string];
        },
      },
    );
    expect(() => parseAction(hostile)).not.toThrow();
    const result = parseAction(hostile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "missing-field", field: "type" });
  });

  it("a getter inherited from the prototype chain that throws becomes a structured failure, not a throw", () => {
    const proto = Object.defineProperty({}, "reversibility", {
      get() {
        throw new Error("x");
      },
      enumerable: true,
    });
    const hostile = Object.assign(Object.create(proto), {
      domain: validAction.domain,
      type: validAction.type,
      parameters: validAction.parameters,
      costOfBeingWrong: validAction.costOfBeingWrong,
    });
    expect(() => parseAction(hostile)).not.toThrow();
    const result = parseAction(hostile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown-reversibility");
  });

  it("a Proxy whose `has` trap throws does not affect parseAction — the trap is never invoked", () => {
    const hostile = new Proxy(
      { ...validAction },
      {
        has() {
          throw new Error("`in` should never be used by parseAction");
        },
      },
    );
    expect(() => parseAction(hostile)).not.toThrow();
    expect(parseAction(hostile).ok).toBe(true);
  });

  it("a Proxy whose `ownKeys` trap throws does not affect parseAction — the trap is never invoked", () => {
    const hostile = new Proxy(
      { ...validAction },
      {
        ownKeys() {
          throw new Error("Object.keys/getOwnPropertyNames should never be used by parseAction");
        },
      },
    );
    expect(() => parseAction(hostile)).not.toThrow();
    expect(parseAction(hostile).ok).toBe(true);
  });

  it("a Proxy whose `getOwnPropertyDescriptor` trap throws does not affect parseAction — the trap is never invoked", () => {
    const hostile = new Proxy(
      { ...validAction },
      {
        getOwnPropertyDescriptor() {
          throw new Error("Object.getOwnPropertyDescriptor should never be used by parseAction");
        },
      },
    );
    expect(() => parseAction(hostile)).not.toThrow();
    expect(parseAction(hostile).ok).toBe(true);
  });

  it("a value whose valueOf/toString throws is never coerced — it just fails the typeof check", () => {
    const hostileValue = {
      valueOf() {
        throw new Error("should never be coerced");
      },
      toString() {
        throw new Error("should never be coerced");
      },
    };
    const raw = { ...validAction, domain: hostileValue };
    expect(() => parseAction(raw)).not.toThrow();
    const result = parseAction(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "missing-field", field: "domain" });
  });

  it("parseDecision propagates the same guarantee through `action`, `missing`, and outcome-specific fields", () => {
    const hostileAction = new Proxy(
      { ...validAction },
      {
        get(t, p) {
          if (p === "domain") throw new Error("x");
          return (t as Record<string, unknown>)[p as string];
        },
      },
    );
    const result1 = parseDecision({ outcome: "refuse", action: hostileAction, reason: "no" });
    expect(result1.ok).toBe(false);
    if (!result1.ok) expect(result1.error.kind).toBe("invalid-action");

    const hostileMissing = Object.defineProperty({}, "fact", {
      get() {
        throw new Error("x");
      },
      enumerable: true,
    });
    const result2 = parseDecision({ outcome: "ask", action: validAction, missing: hostileMissing });
    expect(result2.ok).toBe(false);
    if (!result2.ok) expect(result2.error).toEqual({ kind: "missing-field", field: "missing.fact" });

    const hostileOutcomeHolder = new Proxy(
      { outcome: "refuse", action: validAction, reason: "no" },
      {
        get(t, p) {
          if (p === "action") throw new Error("x");
          return (t as Record<string, unknown>)[p as string];
        },
      },
    );
    expect(() => parseDecision(hostileOutcomeHolder)).not.toThrow();
    const result3 = parseDecision(hostileOutcomeHolder);
    expect(result3.ok).toBe(false);
    if (!result3.ok) expect(result3.error.kind).toBe("invalid-action");
  });
});
