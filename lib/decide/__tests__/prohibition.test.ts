import { describe, expect, it } from "vitest";
import { decide } from "../decide.js";
import { findProhibition, type Prohibition } from "../prohibition.js";
import { sampleAction, fixtureInput, fixtureRequirement, fixtureSignal } from "./fixtures.js";

/**
 * DECISION 2 — a prohibited action is refused BEFORE evidence is examined.
 * These tests prove the ordering mechanically, not just by inspecting
 * decide.ts's source order.
 */
describe("prohibition — checked before evidence, DECISION 2", () => {
  it("a matching prohibition produces `refuse` with the prohibition's own reason", () => {
    const action = sampleAction({ domain: "refund", type: "issue-refund" });
    const prohibition: Prohibition = {
      id: "no-refunds-on-frozen-account",
      reason: "this account is frozen; no refund may be issued regardless of evidence",
      matches: (a) => a.domain === "refund",
    };

    const decision = decide(
      fixtureInput({ action, prohibitions: [prohibition] }),
    );

    expect(decision.outcome).toBe("refuse");
    if (decision.outcome === "refuse") {
      expect(decision.reason).toBe(prohibition.reason);
    }
  });

  it("PROOF: a prohibited action never reads the signals array at all — a signal collection whose access throws is never touched", () => {
    const action = sampleAction({ domain: "refund" });
    const prohibition: Prohibition = {
      id: "no-refunds-ever",
      reason: "refunds are prohibited outright for this test",
      matches: (a) => a.domain === "refund",
    };

    // Any attempt to read ANY property of this array — `.length`,
    // indexing, iteration, everything — throws. If decide() so much as
    // glances at `signals` after the prohibition matches, this test fails
    // with that thrown error instead of asserting on the decision.
    const radioactiveSignals = new Proxy([], {
      get() {
        throw new Error("signals were read after a prohibition should have short-circuited");
      },
    }) as never;

    const radioactiveRequirements = new Proxy([], {
      get() {
        throw new Error("requirements were read after a prohibition should have short-circuited");
      },
    }) as never;

    let decision;
    expect(() => {
      decision = decide(
        fixtureInput({
          action,
          prohibitions: [prohibition],
          signals: radioactiveSignals,
          requirements: radioactiveRequirements,
        }),
      );
    }).not.toThrow();

    expect(decision).toBeDefined();
    expect(decision!.outcome).toBe("refuse");
    // The evidence carried on the refusal is the empty array decide()
    // never populated from the (radioactive) input — not omitted, not
    // synthesized from a signal it never read.
    expect(decision!.evidence).toEqual([]);
  });

  /**
   * FIX 3 (M4 second independent verification). The PROOF test above uses
   * a `Proxy` that THROWS on any access — but decide()'s outermost
   * try/catch (FAIL CLOSED, decide.ts) catches any exception and turns it
   * into an `escalate`. That means moving the prohibition check to AFTER
   * gap analysis still only breaks that one test, and only incidentally:
   * `analyzeGaps` throws when handed the radioactive Proxy, decide()'s
   * fail-closed guard converts that throw into `escalate`, and the test
   * fails because it expected `refuse` — a side effect of the crash
   * being caught, not a direct check that requirements/signals were
   * literally never touched. With ORDINARY (non-throwing) requirements
   * and signals, the two orderings produce byte-identical output in
   * every other test, because `analyzeGaps`'s result is simply never
   * looked at once a prohibition already matched — so nothing else in
   * this suite would notice the reorder at all.
   *
   * This test closes that gap directly: a Proxy that behaves completely
   * normally (delegates every operation via `Reflect`, never throws) but
   * COUNTS every property access. With today's correct ordering
   * (prohibition checked first, decide.ts DECISION 2), a matching
   * prohibition returns `refuse` without `analyzeGaps` ever running, so
   * neither array is touched at all — both counters must be exactly
   * `0`. If the prohibition check were moved after
   * `analyzeGaps(requirements, signals, now)`, that call alone iterates
   * `requirements` (a `for...of` loop) and filters `signals`
   * (`candidatesFor`'s `.filter`), which reads `Symbol.iterator`,
   * indices, and `.length` on both — driving both counters well above
   * `0` even though the returned Decision would still, incidentally,
   * end up `refuse` (nothing throws, so no crash to hide behind). This
   * is `ordinary inputs` in the literal sense: the requirement and
   * signal fixtures below are completely normal, valid values — the
   * counting is purely observational instrumentation on the Proxy
   * wrapping them, not a hostile payload.
   */
  it("ORDERING PROOF (no crash involved): a prohibition match touches requirements/signals exactly zero times, counted directly rather than inferred from a thrown error", () => {
    const action = sampleAction({ domain: "refund" });
    const prohibition: Prohibition = {
      id: "no-refunds-ever",
      reason: "refunds are prohibited outright for this ordering test",
      matches: (a) => a.domain === "refund",
    };

    let requirementsAccessCount = 0;
    let signalsAccessCount = 0;

    const countingProxy = <T extends object>(target: T, onAccess: () => void): T =>
      new Proxy(target, {
        get(t, prop, receiver) {
          onAccess();
          return Reflect.get(t, prop, receiver);
        },
      });

    const countedRequirements = countingProxy([fixtureRequirement()], () => requirementsAccessCount++);
    const countedSignals = countingProxy([fixtureSignal()], () => signalsAccessCount++);

    const decision = decide(
      fixtureInput({
        action,
        prohibitions: [prohibition],
        requirements: countedRequirements,
        signals: countedSignals,
      }),
    );

    expect(decision.outcome).toBe("refuse");
    expect(requirementsAccessCount).toBe(0);
    expect(signalsAccessCount).toBe(0);
  });

  it("a non-matching prohibition does not block a normal decision", () => {
    const prohibition: Prohibition = {
      id: "irrelevant-rule",
      reason: "does not apply to this action",
      matches: (a) => a.domain === "something-else",
    };
    const requirement = fixtureRequirement({ minConfidence: 0.5 });
    const signal = fixtureSignal({ confidence: 0.95 });

    const decision = decide(
      fixtureInput({ prohibitions: [prohibition], requirements: [requirement], signals: [signal] }),
    );

    expect(decision.outcome).not.toBe("refuse");
  });

  it("multiple prohibitions: the first matching one wins, in array order", () => {
    const action = sampleAction({ domain: "refund" });
    const first: Prohibition = { id: "first", reason: "first rule fired", matches: () => true };
    const second: Prohibition = { id: "second", reason: "second rule fired", matches: () => true };

    const decision = decide(fixtureInput({ action, prohibitions: [first, second] }));
    expect(decision.outcome).toBe("refuse");
    if (decision.outcome === "refuse") expect(decision.reason).toBe(first.reason);
  });

  describe("findProhibition — fail-closed on a hostile predicate", () => {
    it("a `matches` predicate that throws is treated as a match, never as 'does not apply'", () => {
      const action = sampleAction();
      const hostile: Prohibition = {
        id: "buggy-rule",
        reason: "this rule's own check is broken",
        matches: () => {
          throw new Error("hostile matcher");
        },
      };

      expect(() => findProhibition(action, [hostile])).not.toThrow();
      expect(findProhibition(action, [hostile])).toBe(hostile);
    });

    it("no prohibitions at all never matches (an empty, explicit list, not an absent one)", () => {
      expect(findProhibition(sampleAction(), [])).toBeNull();
    });
  });
});
