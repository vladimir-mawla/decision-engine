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
