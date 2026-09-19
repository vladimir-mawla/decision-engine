import { describe, expect, it } from "vitest";
import { checkValueConstraint, evaluateConstraint, type ValueConstraint } from "../constraint.js";
import { fixtureSignal, capturedAt, confidence, millis, NOW } from "./fixtures.js";

/**
 * Unit-level coverage of `evaluateConstraint`/`checkValueConstraint`
 * (lib/signals/constraint.ts) — the generic, data-driven evaluator every
 * constraint operator runs through. `analyzeGaps` (gap-analysis.test.ts)
 * and `decide()` (lib/decide/__tests__/value-constraint.test.ts) cover the
 * end-to-end wiring; this file is where every operator's three shapes
 * (satisfied / violated / type-mismatched) and every fail-closed path
 * (malformed constraint, unknown op, throwing getter/Proxy) get a direct,
 * minimal test — no signal, no requirement, no decide() involved.
 */

describe("evaluateConstraint — equals", () => {
  it("satisfied: the value matches exactly", () => {
    expect(evaluateConstraint({ op: "equals", value: "clear" }, "clear")).toEqual({ satisfied: true });
  });

  it("violated: the value is the right shape but a different value", () => {
    expect(evaluateConstraint({ op: "equals", value: "clear" }, "fraudulent")).toEqual({
      satisfied: false,
      reason: "violated",
    });
  });

  it("type-mismatched: the value is an object, not a primitive — fails closed, never throws", () => {
    expect(evaluateConstraint({ op: "equals", value: "clear" }, { nested: true })).toEqual({
      satisfied: false,
      reason: "type-mismatch",
    });
  });

  it("type-mismatched: the value is undefined", () => {
    expect(evaluateConstraint({ op: "equals", value: "clear" }, undefined)).toEqual({
      satisfied: false,
      reason: "type-mismatch",
    });
  });

  it("distinguishes booleans and numbers from their string look-alikes", () => {
    expect(evaluateConstraint({ op: "equals", value: true }, "true")).toEqual({
      satisfied: false,
      reason: "violated",
    });
    expect(evaluateConstraint({ op: "equals", value: 3 }, "3")).toEqual({ satisfied: false, reason: "violated" });
  });
});

describe("evaluateConstraint — lte", () => {
  const constraint: ValueConstraint = { op: "lte", value: 3 };

  it("satisfied: strictly under the bound", () => {
    expect(evaluateConstraint(constraint, 1)).toEqual({ satisfied: true });
  });

  it("satisfied: exactly at the bound (inclusive)", () => {
    expect(evaluateConstraint(constraint, 3)).toEqual({ satisfied: true });
  });

  it("violated: over the bound", () => {
    expect(evaluateConstraint(constraint, 3.01)).toEqual({ satisfied: false, reason: "violated" });
  });

  it("type-mismatched: a string value against a numeric constraint", () => {
    expect(evaluateConstraint(constraint, "2")).toEqual({ satisfied: false, reason: "type-mismatch" });
  });

  it("type-mismatched: NaN and Infinity are never treated as satisfying, never thrown on", () => {
    expect(evaluateConstraint(constraint, Number.NaN)).toEqual({ satisfied: false, reason: "type-mismatch" });
    expect(evaluateConstraint(constraint, Number.POSITIVE_INFINITY)).toEqual({
      satisfied: false,
      reason: "type-mismatch",
    });
  });
});

describe("evaluateConstraint — gte", () => {
  const constraint: ValueConstraint = { op: "gte", value: 2 };

  it("satisfied: strictly over the bound", () => {
    expect(evaluateConstraint(constraint, 5)).toEqual({ satisfied: true });
  });

  it("satisfied: exactly at the bound (inclusive)", () => {
    expect(evaluateConstraint(constraint, 2)).toEqual({ satisfied: true });
  });

  it("violated: under the bound", () => {
    expect(evaluateConstraint(constraint, 1)).toEqual({ satisfied: false, reason: "violated" });
  });

  it("type-mismatched: a boolean value against a numeric constraint", () => {
    expect(evaluateConstraint(constraint, true)).toEqual({ satisfied: false, reason: "type-mismatch" });
  });
});

describe("evaluateConstraint — in", () => {
  const constraint: ValueConstraint = { op: "in", values: ["safe", "low-risk"] };

  it("satisfied: the value is one of the allowed set", () => {
    expect(evaluateConstraint(constraint, "low-risk")).toEqual({ satisfied: true });
  });

  it("violated: the value is a primitive of the right kind but not in the set", () => {
    expect(evaluateConstraint(constraint, "high-risk")).toEqual({ satisfied: false, reason: "violated" });
  });

  it("type-mismatched: the value is an array, not a primitive", () => {
    expect(evaluateConstraint(constraint, ["safe"])).toEqual({ satisfied: false, reason: "type-mismatch" });
  });

  it("type-mismatched: the value is null", () => {
    expect(evaluateConstraint(constraint, null)).toEqual({ satisfied: false, reason: "type-mismatch" });
  });
});

describe("evaluateConstraint — fails closed on a malformed constraint or an unknown op, never throws", () => {
  it("unknown op", () => {
    expect(evaluateConstraint({ op: "matches-regex", value: ".*" }, "anything")).toEqual({
      satisfied: false,
      reason: "malformed",
    });
  });

  it("missing op", () => {
    expect(evaluateConstraint({ value: "clear" }, "clear")).toEqual({ satisfied: false, reason: "malformed" });
  });

  it("op is a number, not a string", () => {
    expect(evaluateConstraint({ op: 1, value: "clear" }, "clear")).toEqual({ satisfied: false, reason: "malformed" });
  });

  it("equals with a non-primitive declared value", () => {
    expect(evaluateConstraint({ op: "equals", value: { nested: true } }, "clear")).toEqual({
      satisfied: false,
      reason: "malformed",
    });
  });

  it("lte with a non-numeric declared bound", () => {
    expect(evaluateConstraint({ op: "lte", value: "3" }, 1)).toEqual({ satisfied: false, reason: "malformed" });
  });

  it("in with an empty allowed set", () => {
    expect(evaluateConstraint({ op: "in", values: [] }, "safe")).toEqual({ satisfied: false, reason: "malformed" });
  });

  it("in with a non-array values field", () => {
    expect(evaluateConstraint({ op: "in", values: "safe" }, "safe")).toEqual({
      satisfied: false,
      reason: "malformed",
    });
  });

  it("in with a non-primitive entry in the allowed set", () => {
    expect(evaluateConstraint({ op: "in", values: ["safe", { bad: true }] }, "safe")).toEqual({
      satisfied: false,
      reason: "malformed",
    });
  });

  it("the constraint itself is not an object", () => {
    expect(evaluateConstraint("equals", "clear")).toEqual({ satisfied: false, reason: "malformed" });
    expect(evaluateConstraint(null, "clear")).toEqual({ satisfied: false, reason: "malformed" });
    expect(evaluateConstraint(undefined, "clear")).toEqual({ satisfied: false, reason: "malformed" });
  });

  it("a constraint whose `op` getter throws", () => {
    const hostile = {
      get op(): string {
        throw new Error("radioactive op");
      },
    };
    expect(evaluateConstraint(hostile, "clear")).toEqual({ satisfied: false, reason: "malformed" });
  });

  it("a constraint whose `value` getter throws", () => {
    const hostile = {
      op: "equals",
      get value(): string {
        throw new Error("radioactive value");
      },
    };
    expect(evaluateConstraint(hostile, "clear")).toEqual({ satisfied: false, reason: "malformed" });
  });

  it("a constraint that is a Proxy throwing on every property access", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("radioactive proxy");
        },
      },
    );
    expect(evaluateConstraint(hostile, "clear")).toEqual({ satisfied: false, reason: "malformed" });
  });

  it("a constraint whose `values` array contains a throwing getter as an entry accessor is still handled — Array.isArray/every never invoke a getter on the array itself", () => {
    // The hostile shape here is the CONSTRAINT's own `values` property
    // being a throwing getter, not an array entry (entries are read via
    // ordinary array iteration, which cannot itself throw for a plain
    // array of primitives) — already covered by the `op`/`value` getter
    // cases above via the same code path (readProp). This test exists so
    // the "values-is-a-throwing-getter" shape is exercised by name too.
    const hostile = {
      op: "in",
      get values(): string[] {
        throw new Error("radioactive values");
      },
    };
    expect(evaluateConstraint(hostile, "safe")).toEqual({ satisfied: false, reason: "malformed" });
  });
});

describe("checkValueConstraint — the real Signal.read() caller", () => {
  it("evaluates the constraint against a fresh signal's value", () => {
    const signal = fixtureSignal({ value: "clear", capturedAtIso: "2026-09-19T11:59:00Z" });
    const result = checkValueConstraint(signal, { op: "equals", value: "clear" }, millis(10 * 60 * 1000), NOW);
    expect(result).toEqual({ satisfied: true });
  });

  it("a stale signal (per the SAME maxAge/now) is reported as unreadable, not violated — the constraint never runs against evidence that wasn't fresh enough", () => {
    const signal = fixtureSignal({ value: "clear", capturedAtIso: "2026-09-19T10:00:00Z" }); // 2h before NOW
    const result = checkValueConstraint(signal, { op: "equals", value: "clear" }, millis(5 * 60 * 1000), NOW);
    expect(result).toEqual({ satisfied: false, reason: "unreadable" });
  });

  it("a clock-inconsistent signal is reported as unreadable, never fabricated as satisfied or violated", () => {
    const signal = fixtureSignal({ value: "clear", capturedAtIso: "2026-09-19T11:59:00Z" });
    const earlierNow = capturedAt("2026-09-19T11:30:00Z");
    const result = checkValueConstraint(signal, { op: "equals", value: "clear" }, millis(30 * 60 * 1000), earlierNow);
    expect(result).toEqual({ satisfied: false, reason: "unreadable" });
  });

  it("fails closed, never throws, when `signal.read` itself throws", () => {
    const hostileSignal = {
      id: "hostile",
      kind: "k",
      source: { kind: "system" as const, system: "s" },
      capturedAt: NOW,
      confidence: confidence(0.9),
      read(): never {
        throw new Error("radioactive read");
      },
    };
    expect(() => checkValueConstraint(hostileSignal, { op: "equals", value: "clear" }, millis(1000), NOW)).not.toThrow();
    expect(checkValueConstraint(hostileSignal, { op: "equals", value: "clear" }, millis(1000), NOW)).toEqual({
      satisfied: false,
      reason: "unreadable",
    });
  });
});
