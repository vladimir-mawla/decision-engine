import { describe, expect, it } from "vitest";
import { MAX_IN_VALUES, parseValueConstraint } from "../validation.js";

/**
 * Boundary-parser coverage for `parseValueConstraint` (validation.ts).
 * Until FIX 4 (independent verification follow-up), this parser had NO
 * direct test file at all — only indirect coverage through
 * `lib/audit/__tests__/validation.test.ts`'s `parseRequirement` tests,
 * none of which exercised `in.values`' length at all. This file is that
 * missing direct coverage, focused on the new cap this fix adds:
 * `evaluateConstraint` (constraint.ts) checks `in` membership with
 * `Array.prototype.includes`, O(n) in the allow-list's length, run once
 * per candidate signal per requirement — nothing capped `n` before this
 * fix, so a requirement whose `valueConstraint` arrived from an untrusted
 * source (a tampered audit record — see `lib/audit/replay.ts`'s own
 * `requirementsFromRecord`) could carry an unboundedly large `values`
 * array.
 */
describe("parseValueConstraint — 'in' allow-list length is capped (FIX 4)", () => {
  it("accepts exactly MAX_IN_VALUES entries", () => {
    const values = Array.from({ length: MAX_IN_VALUES }, (_, i) => `v${i}`);
    const result = parseValueConstraint({ op: "in", values });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.op === "in") {
      expect(result.value.values).toHaveLength(MAX_IN_VALUES);
    }
  });

  it("rejects MAX_IN_VALUES + 1 entries with a typed, specific error — never truncates and never throws", () => {
    const values = Array.from({ length: MAX_IN_VALUES + 1 }, (_, i) => `v${i}`);
    let result: ReturnType<typeof parseValueConstraint> | undefined;
    expect(() => {
      result = parseValueConstraint({ op: "in", values });
    }).not.toThrow();
    expect(result!.ok).toBe(false);
    if (!result!.ok) {
      expect(result!.error).toEqual({
        kind: "invalid-field",
        field: "values",
        reason: `must not exceed ${MAX_IN_VALUES} values`,
      });
    }
  });

  it("rejects a wildly oversized 'in.values' array (the tampered-record shape FIX 4 targets) just as cleanly as a merely-too-long one, without ever evaluating it", () => {
    // Representative of what an attacker or a corrupted record could
    // otherwise smuggle through `record.requirements` before this fix —
    // large enough that evaluating it even once per candidate signal
    // would be real, unbounded work if this parser let it through.
    const hostileValues = Array.from({ length: 50_000 }, (_, i) => `v${i}`);
    const result = parseValueConstraint({ op: "in", values: hostileValues });
    expect(result.ok).toBe(false);
  });
});

describe("parseValueConstraint — every operator, sanity-checked directly (no prior direct coverage existed)", () => {
  it("equals: accepts a well-formed constraint", () => {
    const result = parseValueConstraint({ op: "equals", value: "clear" });
    expect(result).toEqual({ ok: true, value: { op: "equals", value: "clear" } });
  });

  it("lte/gte: accepts a well-formed numeric constraint", () => {
    expect(parseValueConstraint({ op: "lte", value: 3 })).toEqual({ ok: true, value: { op: "lte", value: 3 } });
    expect(parseValueConstraint({ op: "gte", value: 2 })).toEqual({ ok: true, value: { op: "gte", value: 2 } });
  });

  it("in: accepts a well-formed allow-list", () => {
    const result = parseValueConstraint({ op: "in", values: ["safe", "low-risk"] });
    expect(result).toEqual({ ok: true, value: { op: "in", values: ["safe", "low-risk"] } });
  });

  it("rejects a non-object input", () => {
    expect(parseValueConstraint("not-an-object")).toEqual({ ok: false, error: { kind: "not-an-object", received: "not-an-object" } });
  });

  it("rejects an unknown op", () => {
    expect(parseValueConstraint({ op: "regex-match", value: ".*" })).toEqual({
      ok: false,
      error: { kind: "unknown-op", received: "regex-match" },
    });
  });

  it("rejects 'in' with an empty values array", () => {
    const result = parseValueConstraint({ op: "in", values: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects 'in' with a non-primitive entry", () => {
    const result = parseValueConstraint({ op: "in", values: ["safe", { nested: true }] });
    expect(result.ok).toBe(false);
  });

  it("never throws for a throwing getter on the raw input", () => {
    const hostile = {
      get op(): never {
        throw new Error("radioactive op getter");
      },
    };
    expect(() => parseValueConstraint(hostile)).not.toThrow();
    expect(parseValueConstraint(hostile).ok).toBe(false);
  });
});
