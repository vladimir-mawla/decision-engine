import { describe, expect, it } from "vitest";
import { decide, type DecideInput } from "../decide.js";
import type { Action } from "../../contracts/action.js";
import type { Requirement } from "../../signals/requirement.js";
import type { Signal } from "../../signals/signal.js";
import { sampleAction, fixtureInput, fixtureRequirement, fixtureSignal, NOW } from "./fixtures.js";

/**
 * "Fail closed everywhere. Nothing may throw for any input, however
 * hostile — M1 shipped a parser that threw on a hostile accessor and had
 * to be fixed." decide() defends the same class of hazard at its own
 * boundary (see decide.ts's outer try/catch), even though the inputs here
 * are hand-built objects that only structurally satisfy Action/
 * Requirement/Signal rather than JSON passed through the (already-hardened)
 * lib/contracts/lib/signals validators.
 */
describe("fail-closed — decide() never throws, for any hostile input", () => {
  it("a throwing getter on action.costOfBeingWrong does not escape decide()", () => {
    const action = sampleAction();
    const hostileAction: Action = Object.defineProperty({ ...action }, "costOfBeingWrong", {
      enumerable: true,
      get() {
        throw new Error("hostile getter on costOfBeingWrong");
      },
    });

    let decision;
    expect(() => {
      decision = decide(fixtureInput({ action: hostileAction }));
    }).not.toThrow();
    expect(decision!.outcome).toBe("escalate");
  });

  it("a throwing getter on action.reversibility does not escape decide()", () => {
    const action = sampleAction();
    const hostileAction: Action = Object.defineProperty({ ...action }, "reversibility", {
      enumerable: true,
      get() {
        throw new Error("hostile getter on reversibility");
      },
    });

    let decision;
    expect(() => {
      decision = decide(fixtureInput({ action: hostileAction }));
    }).not.toThrow();
    expect(decision!.outcome).toBe("escalate");
  });

  it("a throwing getter on action.domain does not escape decide() even when a prohibition would otherwise check it", () => {
    const action = sampleAction();
    const hostileAction: Action = Object.defineProperty({ ...action }, "domain", {
      enumerable: true,
      get() {
        throw new Error("hostile getter on domain");
      },
    });

    let decision;
    expect(() => {
      decision = decide(
        fixtureInput({
          action: hostileAction,
          prohibitions: [{ id: "p", reason: "r", matches: (a) => a.domain === "refund" }],
        }),
      );
    }).not.toThrow();
    // Fail closed: the matcher itself throws (via the hostile getter),
    // findProhibition treats a throwing matcher as a match (see
    // prohibition.ts) — so this refuses rather than silently proceeding.
    expect(decision!.outcome).toBe("refuse");
  });

  it("a throwing getter on a Requirement's maxAge does not escape decide()", () => {
    const requirement = fixtureRequirement();
    const hostileRequirement: Requirement = Object.defineProperty({ ...requirement }, "maxAge", {
      enumerable: true,
      get() {
        throw new Error("hostile getter on maxAge");
      },
    });

    let decision;
    expect(() => {
      decision = decide(fixtureInput({ requirements: [hostileRequirement] }));
    }).not.toThrow();
    expect(decision!.outcome).toBe("escalate");
  });

  it("a throwing getter on a Signal's confidence does not escape decide()", () => {
    const signal = fixtureSignal();
    const hostileSignal: Signal = Object.defineProperty({ ...signal }, "confidence", {
      enumerable: true,
      get() {
        throw new Error("hostile getter on confidence");
      },
    });

    let decision;
    expect(() => {
      decision = decide(fixtureInput({ signals: [hostileSignal] }));
    }).not.toThrow();
    expect(decision!.outcome).toBe("escalate");
  });

  it("a throwing getter on a Signal's capturedAt does not escape decide()", () => {
    const signal = fixtureSignal();
    const hostileSignal: Signal = Object.defineProperty({ ...signal }, "capturedAt", {
      enumerable: true,
      get() {
        throw new Error("hostile getter on capturedAt");
      },
    });

    let decision;
    expect(() => {
      decision = decide(fixtureInput({ signals: [hostileSignal] }));
    }).not.toThrow();
    expect(decision!.outcome).toBe("escalate");
  });

  it("a requirement whose valueConstraint itself has a throwing getter does not escape decide() (value constraints)", () => {
    const requirement = fixtureRequirement({ valueConstraint: { op: "equals", value: "clear" } });
    const hostile: Requirement = Object.defineProperty({ ...requirement }, "valueConstraint", {
      enumerable: true,
      get() {
        throw new Error("hostile getter on valueConstraint");
      },
    });

    let decision;
    expect(() => {
      decision = decide(fixtureInput({ requirements: [hostile], signals: [fixtureSignal({ kind: requirement.signalKind })] }));
    }).not.toThrow();
    expect(decision).toBeDefined();
  });

  it("a signal whose value is a Proxy that throws on every property access does not escape decide() when a valueConstraint is declared", () => {
    const requirement = fixtureRequirement({ valueConstraint: { op: "equals", value: "clear" } });
    const hostileValue = new Proxy({}, { get() { throw new Error("hostile value proxy"); } });
    const signal = fixtureSignal({ kind: requirement.signalKind, value: hostileValue });

    let decision;
    expect(() => {
      decision = decide(fixtureInput({ requirements: [requirement], signals: [signal] }));
    }).not.toThrow();
    expect(decision).toBeDefined();
  });

  it("an unknown constraint op never fabricates a satisfied requirement, and does not throw", () => {
    const requirement = fixtureRequirement({ valueConstraint: { op: "regex-match", value: ".*" } as never });
    const signal = fixtureSignal({ kind: requirement.signalKind, value: "anything" });

    let decision;
    expect(() => {
      decision = decide(fixtureInput({ requirements: [requirement], signals: [signal] }));
    }).not.toThrow();
    expect(decision!.outcome).not.toBe("execute");
  });

  it("a signal claiming NaN confidence is never treated as satisfying evidence, and does not throw", () => {
    // NaN fails EVERY comparison (`NaN >= x` and `NaN < x` are both
    // false), so lib/signals/gap.ts's own `>= minConfidence` check
    // already, correctly, treats it as NOT satisfying — analyzeGaps
    // produces an ordinary `below-confidence` Gap for it, same as any
    // other too-weak signal, and this requirement's counterparty-supplier
    // (the fixture default) makes that an `ask`, not an `execute`. That is
    // the safe, fail-closed behavior this test actually proves: a NaN
    // confidence can never cause an execute. (Contrast `+Infinity`, which
    // DOES pass `>=` and is exercised separately in
    // escalate.test.ts's "internal inconsistency" case — that is the
    // value satisfaction.ts's isUsableConfidence guard specifically
    // exists for.)
    const requirement = fixtureRequirement({ minConfidence: 0.1 });
    const base = fixtureSignal({ confidence: 0.5 });
    const nanSignal: Signal = { ...base, confidence: Number.NaN as never };

    let decision;
    expect(() => {
      decision = decide(fixtureInput({ requirements: [requirement], signals: [nanSignal] }));
    }).not.toThrow();
    expect(decision!.outcome).not.toBe("execute");
  });

  it("a garbage (null) entry inside the signals array does not throw", () => {
    const requirement = fixtureRequirement({ minConfidence: 0.1 });
    const signals = [fixtureSignal({ confidence: 0.95 }), null] as unknown as readonly Signal[];

    let decision;
    expect(() => {
      decision = decide(fixtureInput({ requirements: [requirement], signals }));
    }).not.toThrow();
    expect(decision).toBeDefined();
  });

  it("a garbage (undefined) entry inside the requirements array does not throw", () => {
    const requirements = [fixtureRequirement(), undefined] as unknown as readonly Requirement[];

    let decision;
    expect(() => {
      decision = decide(fixtureInput({ requirements }));
    }).not.toThrow();
    expect(decision).toBeDefined();
  });

  it("completely garbage top-level inputs (wrong types entirely) do not throw", () => {
    let decision;
    expect(() => {
      decision = decide({
        action: "not an action" as unknown as Action,
        requirements: "not an array" as unknown as readonly Requirement[],
        signals: 42 as unknown as readonly Signal[],
        prohibitions: [],
        now: sampleAction() as unknown as never,
      });
    }).not.toThrow();
    expect(decision).toBeDefined();
    expect(decision!.outcome).toBe("escalate");
  });
});

/**
 * FIX 1 (M4 independent verification). The suite above covers a hostile
 * FIELD on an otherwise-real `Action`/`Requirement`/`Signal`/`Prohibition`.
 * None of it covered `input` ITSELF being the hostile thing — and that
 * was exactly the gap: `decide()`'s catch handler used to rebuild its
 * escalate fallback by re-reading `input.action`, so when `input` itself
 * was `null`, `undefined`, or a `Proxy` that throws on every access, that
 * second read threw INSIDE the catch and escaped `decide()` entirely
 * (reproduced live: `decide(null)` and `decide(undefined)` both threw
 * `TypeError: Cannot read properties of null/undefined (reading
 * 'action')`, and the all-throwing Proxy threw its own "boom" error
 * straight out of the function).
 *
 * There is no `Action` in any of these cases — nothing was ever actually
 * evaluated — so the fix does not force these into a fabricated
 * `escalate`. It returns `InputRejected`: `outcome: "input-rejected"`,
 * never one of the five real Decision outcomes, and carrying no `action`
 * field, so it cannot be mistaken for one.
 */
describe("fail-closed — decide() rejects an unusable INPUT rather than fabricating a Decision for it", () => {
  it("decide(null) does not throw and returns a structured input-rejected result, not a fabricated Decision", () => {
    let decision;
    expect(() => {
      decision = decide(null as unknown as DecideInput);
    }).not.toThrow();
    expect(decision).toBeDefined();
    expect(decision!.outcome).toBe("input-rejected");
    if (decision!.outcome === "input-rejected") {
      expect(decision!.reason.length).toBeGreaterThan(0);
      expect(decision!.evidence).toEqual([]);
    }
    expect("action" in decision!).toBe(false);
  });

  it("decide(undefined) does not throw and returns a structured input-rejected result", () => {
    let decision;
    expect(() => {
      decision = decide(undefined as unknown as DecideInput);
    }).not.toThrow();
    expect(decision).toBeDefined();
    expect(decision!.outcome).toBe("input-rejected");
  });

  it("a Proxy that throws on every `get` (including `action`) does not throw and returns input-rejected", () => {
    const hostileInput = new Proxy(
      {},
      {
        get() {
          throw new Error("boom");
        },
      },
    ) as unknown as DecideInput;

    let decision;
    expect(() => {
      decision = decide(hostileInput);
    }).not.toThrow();
    expect(decision).toBeDefined();
    expect(decision!.outcome).toBe("input-rejected");
  });

  it("an object missing `action` entirely (not merely wrongly typed) returns input-rejected", () => {
    const missingAction = {
      requirements: [fixtureRequirement()],
      signals: [fixtureSignal()],
      prohibitions: [],
      now: NOW,
      // no `action` key at all
    } as unknown as DecideInput;

    let decision;
    expect(() => {
      decision = decide(missingAction);
    }).not.toThrow();
    expect(decision).toBeDefined();
    expect(decision!.outcome).toBe("input-rejected");
  });

  it("an input whose `action` getter throws returns input-rejected, not an escaped exception", () => {
    const hostileInput = Object.defineProperty(
      { requirements: [fixtureRequirement()], signals: [fixtureSignal()], prohibitions: [], now: NOW },
      "action",
      {
        enumerable: true,
        get() {
          throw new Error("hostile getter on input.action itself");
        },
      },
    ) as unknown as DecideInput;

    let decision;
    expect(() => {
      decision = decide(hostileInput);
    }).not.toThrow();
    expect(decision).toBeDefined();
    expect(decision!.outcome).toBe("input-rejected");
  });

  it("contrast: an action present but of the wrong TYPE (a string) is not input-rejected — decideInner still handles it, unchanged from before FIX 1", () => {
    // This is the pre-existing "completely garbage top-level inputs" case
    // above, restated to make the boundary explicit: FIX 1 only rejects
    // input up front when there is NOTHING usable at all (null/undefined
    // input, or action itself absent/unreadable) — it does not change
    // behavior for a present-but-wrong-shaped action, which continues to
    // fail closed to `escalate` via the ordinary inner try/catch.
    const decision = decide({
      action: "not an action" as unknown as Action,
      requirements: [],
      signals: [],
      prohibitions: [],
      now: NOW,
    });
    expect(decision.outcome).not.toBe("input-rejected");
  });
});
