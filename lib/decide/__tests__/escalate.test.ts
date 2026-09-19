import { describe, expect, it } from "vitest";
import { decide } from "../decide.js";
import { requiredConfidence } from "../../cost-model/requiredConfidence.js";
import { isBarSaturated } from "../stakes.js";
import { aggregateConfidence } from "../aggregate.js";
import { costCeilingReason, insufficientNowReason } from "../reasons.js";
import { confidence, sampleAction, fixtureInput, fixtureRequirement, fixtureSignal, NOW } from "./fixtures.js";
import type { Confidence } from "../../contracts/confidence.js";
import type { Signal } from "../../signals/signal.js";

/**
 * Milestone success criterion: "every `escalate` states why no confidence
 * number would have been enough, and distinguishes unreachable-bar from
 * complete-but-insufficient." FIX 2 (M4 independent verification)
 * corrected what that distinction actually IS: the "unreachable" framing
 * (and its "ownership moves to a human permanently" wording) overclaimed
 * — it fired from as little as ~$1,800 on the most forgiving
 * reversibility tier, and it was never literally true that no evidence
 * could clear the bar (Confidence 1.0 always would — see
 * reasons.ts's costCeilingReason doc comment and ADR 0002 decision 3's
 * correction). The distinction that IS real and is tested below: whether
 * the bar has hit this reversibility level's cost ceiling (more stated
 * cost cannot raise it further) versus whether the bar still has headroom
 * (it can). Both remain `escalate`, and the two reasons must still read
 * differently from each other — that half of the original test intent is
 * unchanged. Plus the human-gap and no-requirements escalate causes,
 * which are also `escalate` but for entirely different reasons
 * (DECISION 1 / an explicit edge case), and must read differently.
 */
describe("escalate — DECISION 3: cost-ceiling reached vs complete-but-insufficient", () => {
  it("bar saturated at this reversibility's ceiling ('reversible-no-trace' at cost=5000) names the ceiling, without claiming permanent unreachability", () => {
    const action = sampleAction({ reversibility: "reversible-no-trace", cost: 5000 });
    expect(isBarSaturated(action)).toBe(true); // sanity: this action genuinely is saturated

    const requirement = fixtureRequirement({ minConfidence: 0.3 });
    const signal = fixtureSignal({ confidence: 0.4 }); // satisfies min 0.3, but well under the ~0.58 bar

    const decision = decide(fixtureInput({ action, requirements: [requirement], signals: [signal] }));

    expect(decision.outcome).toBe("escalate");
    if (decision.outcome === "escalate") {
      expect(decision.missing.reason).toContain("ceiling");
      // The corrected text explicitly disclaims the false "unreachable by
      // any evidence, permanently" reading FIX 2 removed.
      expect(decision.missing.reason).not.toContain("permanently");
      expect(decision.missing.reason).not.toMatch(/\bunreachable\b/);

      // FIX 3 (M4 verification): the two checks above are substring
      // checks that, it turns out, don't actually pin down WHICH branch
      // fired — insufficientNowReason's own text also contains "ceiling"
      // ("has not reached this reversibility level's ceiling"). An exact
      // equality against the real bar/limiting values, computed
      // independently here, is what actually catches a mutation that
      // swaps the two branches (e.g. `isBarSaturated(action)` flipped to
      // `!isBarSaturated(action)`).
      const bar = requiredConfidence(action.reversibility, action.costOfBeingWrong);
      const aggregate = aggregateConfidence([requirement], [signal], NOW);
      expect(aggregate).not.toBeNull();
      expect(decision.missing.reason).toBe(costCeilingReason(aggregate!.limiting, confidence(bar)));
      expect(decision.missing.reason).not.toBe(insufficientNowReason(aggregate!.limiting, confidence(bar)));
    }
  });

  it("bar with real headroom left ('reversible-with-cost' at cost=10) reads as complete-but-insufficient — 'a human decides today'", () => {
    const action = sampleAction({ reversibility: "reversible-with-cost", cost: 10 });
    expect(isBarSaturated(action)).toBe(false); // sanity: plenty of headroom left

    const requirement = fixtureRequirement({ minConfidence: 0.3 });
    const signal = fixtureSignal({ confidence: 0.5 }); // satisfies min 0.3, but under the ~0.60 bar

    const decision = decide(fixtureInput({ action, requirements: [requirement], signals: [signal] }));

    expect(decision.outcome).toBe("escalate");
    if (decision.outcome === "escalate") {
      expect(decision.missing.reason).toContain("A human decides today");
      expect(decision.missing.reason).not.toContain("permanently");

      // Same FIX 3 exact-equality strengthening as the ceiling test above,
      // from the other direction.
      const bar = requiredConfidence(action.reversibility, action.costOfBeingWrong);
      const aggregate = aggregateConfidence([requirement], [signal], NOW);
      expect(aggregate).not.toBeNull();
      expect(decision.missing.reason).toBe(insufficientNowReason(aggregate!.limiting, confidence(bar)));
      expect(decision.missing.reason).not.toBe(costCeilingReason(aggregate!.limiting, confidence(bar)));
    }
  });

  it("the two escalate reasons are textually distinguishable from each other, not just conceptually", () => {
    const unreachableAction = sampleAction({ reversibility: "reversible-no-trace", cost: 5000 });
    const insufficientAction = sampleAction({ reversibility: "reversible-with-cost", cost: 10 });
    const requirement = fixtureRequirement({ minConfidence: 0.3 });

    const unreachable = decide(
      fixtureInput({ action: unreachableAction, requirements: [requirement], signals: [fixtureSignal({ confidence: 0.4 })] }),
    );
    const insufficient = decide(
      fixtureInput({ action: insufficientAction, requirements: [requirement], signals: [fixtureSignal({ confidence: 0.5 })] }),
    );

    expect(unreachable.outcome).toBe("escalate");
    expect(insufficient.outcome).toBe("escalate");
    if (unreachable.outcome === "escalate" && insufficient.outcome === "escalate") {
      expect(unreachable.missing.reason).not.toBe(insufficient.missing.reason);
    }
  });

  /**
   * FIX 3 (M4 independent verification): a fourth, independent proof —
   * table-driven across all four reversibility levels, each checked at
   * both a saturated and a headroom-remaining cost, asserting the EXACT
   * reason text expected for that branch. Mutation testing found that
   * forcing decide.ts's `isBarSaturated(action) ? ... : ...` ternary to
   * always take one branch broke exactly one of the (pre-FIX-3) 223
   * tests; this table, plus the two exact-equality checks added above,
   * gives several independent tests that each fail under that mutation.
   */
  it.each([
    { level: "reversible-no-trace" as const, saturatedCost: 5000, headroomCost: 5 },
    { level: "reversible-with-cost" as const, saturatedCost: 50_000, headroomCost: 10 },
    { level: "reversible-with-delay" as const, saturatedCost: 500_000, headroomCost: 10 },
    { level: "irreversible" as const, saturatedCost: 5_000_000, headroomCost: 10 },
  ])("$level: saturated cost -> costCeilingReason exactly; headroom cost -> insufficientNowReason exactly", ({ level, saturatedCost, headroomCost }) => {
    const requirement = fixtureRequirement({ minConfidence: 0.05 });
    const signal = fixtureSignal({ confidence: 0.1 }); // deliberately far under every level's bar

    const saturatedAction = sampleAction({ reversibility: level, cost: saturatedCost });
    expect(isBarSaturated(saturatedAction)).toBe(true);
    const saturatedDecision = decide(fixtureInput({ action: saturatedAction, requirements: [requirement], signals: [signal] }));
    expect(saturatedDecision.outcome).toBe("escalate");
    if (saturatedDecision.outcome === "escalate") {
      const bar = requiredConfidence(saturatedAction.reversibility, saturatedAction.costOfBeingWrong);
      const aggregate = aggregateConfidence([requirement], [signal], NOW);
      expect(saturatedDecision.missing.reason).toBe(costCeilingReason(aggregate!.limiting, confidence(bar)));
    }

    const headroomAction = sampleAction({ reversibility: level, cost: headroomCost });
    expect(isBarSaturated(headroomAction)).toBe(false);
    const headroomDecision = decide(fixtureInput({ action: headroomAction, requirements: [requirement], signals: [signal] }));
    expect(headroomDecision.outcome).toBe("escalate");
    if (headroomDecision.outcome === "escalate") {
      const bar = requiredConfidence(headroomAction.reversibility, headroomAction.costOfBeingWrong);
      const aggregate = aggregateConfidence([requirement], [signal], NOW);
      expect(headroomDecision.missing.reason).toBe(insufficientNowReason(aggregate!.limiting, confidence(bar)));
    }
  });

  it("names the limiting requirement and both the aggregate and the bar, in both cases", () => {
    const action = sampleAction({ reversibility: "reversible-with-cost", cost: 10 });
    const requirement = fixtureRequirement({ signalKind: "the-limiting-one", minConfidence: 0.3 });
    const bar = requiredConfidence(action.reversibility, action.costOfBeingWrong);

    const decision = decide(
      fixtureInput({
        action,
        requirements: [requirement],
        signals: [fixtureSignal({ kind: "the-limiting-one", confidence: 0.5 })],
      }),
    );

    expect(decision.outcome).toBe("escalate");
    if (decision.outcome === "escalate") {
      expect(decision.missing.reason).toContain("the-limiting-one");
      expect(decision.missing.reason).toContain("0.5000");
      expect(decision.missing.reason).toContain(bar.toFixed(4));
    }
  });
});

describe("escalate — human-supplier gap (DECISION 1's dominant case)", () => {
  it("reason is the Supplier's own text, unchanged (requirement.ts: 'ready to hand to MissingJudgment.reason unchanged')", () => {
    const requirement = fixtureRequirement({
      signalKind: "compliance.sign-off",
      supplier: { kind: "human", reason: "a licensed compliance officer must review cross-border transfers" },
    });

    const decision = decide(fixtureInput({ requirements: [requirement], signals: [] }));

    expect(decision.outcome).toBe("escalate");
    if (decision.outcome === "escalate") {
      expect(decision.missing.reason).toBe(
        "a licensed compliance officer must review cross-border transfers",
      );
    }
  });
});

describe("escalate — no requirements declared at all", () => {
  it("fails closed to escalate rather than executing on zero evidence", () => {
    const decision = decide(fixtureInput({ requirements: [], signals: [] }));
    expect(decision.outcome).toBe("escalate");
    if (decision.outcome === "escalate") {
      expect(decision.missing.reason).toContain("no evidence requirements");
    }
    expect(decision.evidence).toEqual([]);
  });
});

describe("escalate — internal inconsistency between analyzeGaps and this module's own satisfaction check", () => {
  it("a signal claiming Infinity confidence satisfies analyzeGaps's bare `>=` check but not this module's finite-confidence guard, and decide() fails closed rather than trusting either side blindly", () => {
    const requirement = fixtureRequirement({ signalKind: "hostile.kind", minConfidence: 0.3 });
    const base = fixtureSignal({ kind: "hostile.kind", confidence: 0.5 });
    // Hand-built object satisfying the Signal shape without going through
    // createSignal/parseConfidence — confidence: Infinity clears any
    // `>= minConfidence` comparison (analyzeGaps sees it as satisfying)
    // but fails Number.isFinite (satisfaction.ts's isUsableConfidence
    // rejects it). Casting is fine here — this is a *.test.ts file, the
    // one place lib/contracts's brand-cast scan explicitly allows it.
    const hostileSignal: Signal = {
      ...base,
      confidence: Number.POSITIVE_INFINITY as unknown as Confidence,
    };

    const decision = decide(fixtureInput({ requirements: [requirement], signals: [hostileSignal] }));

    expect(decision.outcome).toBe("escalate");
    if (decision.outcome === "escalate") {
      expect(decision.missing.reason.toLowerCase()).toContain("inconsistency");
    }
  });
});
