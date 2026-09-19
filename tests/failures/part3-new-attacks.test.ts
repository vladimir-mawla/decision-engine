import { describe, expect, it, vi } from "vitest";
import { decide } from "../../lib/decide/decide.js";
import { isBarSaturated } from "../../lib/decide/stakes.js";
import { findProhibition } from "../../lib/decide/prohibition.js";
import { requiredConfidence } from "../../lib/cost-model/requiredConfidence.js";
import { evaluateConstraint } from "../../lib/signals/constraint.js";
import { analyzeGaps } from "../../lib/signals/gap.js";
import { recordDecision } from "../../lib/audit/record.js";
import { replay } from "../../lib/audit/replay.js";
import type { Confidence } from "../../lib/contracts/confidence.js";
import type { Requirement } from "../../lib/signals/requirement.js";
import { HOURS, before, makeAction, makeInput, makeRequirement, makeSignal, NOW } from "./helpers.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * PART THREE — FIND SOMETHING NEW
 * ══════════════════════════════════════════════════════════════════════
 * Every attack below is reported honestly, including the ones that find
 * nothing. None of these edit lib/ or app/ — this suite only calls public
 * APIs. No new defect was found; see the final report's ANY_NEW_DEFECT
 * section for the one item (unbounded `in.values` reaching decide()
 * directly) worth a second look without being a stop-the-line finding.
 */
describe("PART THREE — attack 1: the exact boundary of a reversibility level's saturation point", () => {
  it("HELD — the bar transitions from unsaturated to saturated continuously; decide() behaves correctly on both sides of the crossing, exactly at it", () => {
    // Binary-search the crossing point for reversible-no-trace rather than
    // hard-coding the documented "~$1,900" figure, so this test tracks the
    // real function instead of drifting from it.
    let lo = 0;
    let hi = 100_000;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const action = makeAction({ reversibility: "reversible-no-trace", cost: mid });
      if (isBarSaturated(action)) hi = mid;
      else lo = mid;
    }
    const justBelow = makeAction({ reversibility: "reversible-no-trace", cost: lo });
    const justAtOrAbove = makeAction({ reversibility: "reversible-no-trace", cost: hi });
    expect(isBarSaturated(justBelow)).toBe(false);
    expect(isBarSaturated(justAtOrAbove)).toBe(true);

    const barBelow = requiredConfidence("reversible-no-trace", justBelow.costOfBeingWrong);
    const barAtCrossing = requiredConfidence("reversible-no-trace", justAtOrAbove.costOfBeingWrong);
    // Monotonic and continuous across the crossing — no discontinuity, no
    // overshoot past the ceiling on either side.
    expect(barAtCrossing).toBeGreaterThanOrEqual(barBelow);
    expect(barAtCrossing).toBeLessThanOrEqual(0.99);

    const requirement = makeRequirement({ signalKind: "test.signal", minConfidence: 0.1 });
    const exactlyAtBar = makeSignal({ kind: "test.signal", confidence: barAtCrossing });
    const decision = decide(
      makeInput({ action: justAtOrAbove, requirements: [requirement], signals: [exactlyAtBar], now: NOW }),
    );
    // A confidence exactly AT the bar clears it (decide.ts uses `>=`).
    expect(decision.outcome).toBe("execute");
  });
});

describe("PART THREE — attack 2: one requirement, several signals of differing freshness and confidence", () => {
  it("HELD — the freshest-and-confident-enough candidate with the HIGHEST confidence wins, never a stale high-confidence one, never a fresher-but-weaker one over a stronger fresh one", () => {
    const requirement = makeRequirement({ signalKind: "risk.assessment", minConfidence: 0.4, maxAgeMs: 2 * HOURS });
    const staleButVeryConfident = makeSignal({
      id: "s-stale-high-conf",
      kind: "risk.assessment",
      confidence: 0.99,
      capturedAtIso: before(NOW, 10 * HOURS),
    });
    const freshLowConfidence = makeSignal({
      id: "s-fresh-low-conf",
      kind: "risk.assessment",
      confidence: 0.45,
      capturedAtIso: before(NOW, 30 * 60 * 1000),
    });
    const freshHighConfidence = makeSignal({
      id: "s-fresh-high-conf",
      kind: "risk.assessment",
      confidence: 0.85,
      capturedAtIso: before(NOW, 10 * 60 * 1000),
    });
    const belowBarFresh = makeSignal({
      id: "s-fresh-below-bar",
      kind: "risk.assessment",
      confidence: 0.2, // below minConfidence entirely
      capturedAtIso: before(NOW, 5 * 60 * 1000),
    });

    const gaps = analyzeGaps(
      [requirement],
      [staleButVeryConfident, freshLowConfidence, freshHighConfidence, belowBarFresh],
      NOW,
    );
    // Satisfied — the fresh, confident, HIGHEST-confidence-among-qualifiers
    // candidate exists, so there is no Gap at all.
    expect(gaps).toHaveLength(0);

    const decision = decide(
      makeInput({
        action: makeAction({ reversibility: "reversible-with-cost", cost: 10 }),
        requirements: [requirement],
        signals: [staleButVeryConfident, freshLowConfidence, freshHighConfidence, belowBarFresh],
        now: NOW,
      }),
    );
    expect(decision.outcome).toBe("execute");
    if (decision.outcome === "execute") {
      // The 0.99 stale signal never enters the aggregate at all — the
      // decisive confidence is the fresh 0.85 one, not the higher-but-stale
      // 0.99, and not the fresher-but-weaker 0.45/0.2 ones.
      expect(decision.confidence).toBeCloseTo(0.85, 5);
    }
  });
});

describe("PART THREE — attack 3: an audit record replayed after a domain's requirements have changed underneath it", () => {
  it("HELD, structurally: replay() has no code path that reads any 'current'/live requirements — only record.requirements — so this attack has no purchase on the API at all", () => {
    const originalRequirement = makeRequirement({ signalKind: "test.signal", minConfidence: 0.3 });
    const signal = makeSignal({ kind: "test.signal", confidence: 0.9 });
    const action = makeAction({ reversibility: "reversible-with-cost", cost: 10 });
    const input = makeInput({ action, requirements: [originalRequirement], signals: [signal], now: NOW });

    const record = recordDecision(input, "audit-req-change", NOW);
    if (record.kind !== "decision") throw new Error("expected a decision record");
    expect(record.decision.outcome).toBe("execute");

    // Simulate "the domain's requirements changed underneath it": a much
    // stricter, DIFFERENT requirement (e.g. minConfidence raised to 0.99)
    // now exists in the domain's live code. replay()'s signature accepts
    // only (record, prohibitions, knownSignals) — there is nowhere to even
    // PASS this changed requirement to it.
    const changedRequirement = makeRequirement({ signalKind: "test.signal", minConfidence: 0.99 });
    expect(changedRequirement).not.toEqual(originalRequirement);

    const result = replay(record, []);
    // Replay reproduces the ORIGINAL decision exactly, using the
    // REQUIREMENTS THE RECORD ITSELF CAPTURED — the "changed" requirement
    // above was never read by replay() at all, by construction (contrast:
    // a fresh decide() call using the changed requirement directly WOULD
    // produce a different result, but that is calling decide() with new
    // input, not replaying an old record — a categorically different
    // operation this attack conflates).
    expect(result.matches).toBe(true);
    expect(result.replayed.outcome).toBe("execute");

    const freshDecisionUnderChangedPolicy = decide(
      makeInput({ action, requirements: [changedRequirement], signals: [signal], now: NOW }),
    );
    expect(freshDecisionUnderChangedPolicy.outcome).not.toBe("execute"); // 0.9 < 0.99
  });
});

describe("PART THREE — attack 4: constraint values -0, Number.MAX_SAFE_INTEGER, and an empty string", () => {
  it("HELD — `-0` behaves as the numeric zero it is, no crash, no malformed verdict", () => {
    expect(evaluateConstraint({ op: "gte", value: -0 }, 0)).toEqual({ satisfied: true });
    expect(evaluateConstraint({ op: "gte", value: 0 }, -0)).toEqual({ satisfied: true });
    expect(evaluateConstraint({ op: "lte", value: -0 }, -0.0001)).toEqual({ satisfied: true });
  });

  it("HELD — Number.MAX_SAFE_INTEGER round-trips correctly for `lte`/`equals`, and one past it is correctly `violated`, not malformed", () => {
    expect(evaluateConstraint({ op: "lte", value: Number.MAX_SAFE_INTEGER }, Number.MAX_SAFE_INTEGER)).toEqual({
      satisfied: true,
    });
    expect(evaluateConstraint({ op: "equals", value: Number.MAX_SAFE_INTEGER }, Number.MAX_SAFE_INTEGER)).toEqual({
      satisfied: true,
    });
    const overSafe = evaluateConstraint({ op: "lte", value: Number.MAX_SAFE_INTEGER }, Number.MAX_SAFE_INTEGER + 2);
    // Whether this is `satisfied: true` or `{ satisfied: false, reason:
    // "violated" }` depends on double-precision rounding above 2^53 — the
    // point of this attack is that EITHER outcome is a well-formed
    // ConstraintCheck, never a crash and never "malformed".
    if (!overSafe.satisfied) {
      expect(overSafe.reason).toBe("violated");
    }
  });

  it("HELD — an empty string is a legitimate primitive value, not treated as absent/malformed", () => {
    expect(evaluateConstraint({ op: "equals", value: "" }, "")).toEqual({ satisfied: true });
    expect(evaluateConstraint({ op: "in", values: ["", "clean"] }, "")).toEqual({ satisfied: true });
    expect(evaluateConstraint({ op: "equals", value: "" }, "not-empty")).toEqual({
      satisfied: false,
      reason: "violated",
    });
  });
});

describe("PART THREE — attack 5: a prohibition and a value rejection firing on the same action", () => {
  it("HELD — the prohibition wins outright; the value-constraint gap analysis never even runs (matches decide.ts's own documented ordering)", () => {
    const action = makeAction({
      domain: "test-domain",
      type: "risky-action",
      cost: 10,
      reversibility: "reversible-with-cost",
    });
    const requirement = makeRequirement({
      signalKind: "risk.verdict",
      minConfidence: 0.1,
      valueConstraint: { op: "equals", value: "clean" },
    });
    const violatingSignal = makeSignal({ kind: "risk.verdict", value: "fraudulent", confidence: 0.9 });

    const prohibition = {
      id: "no-risky-action-ever",
      reason: "This action is never permitted, independent of any evidence.",
      matches: () => true,
    };

    const decision = decide(
      makeInput({
        action,
        requirements: [requirement],
        signals: [violatingSignal],
        prohibitions: [prohibition],
        now: NOW,
      }),
    );

    expect(decision.outcome).toBe("refuse");
    if (decision.outcome === "refuse") {
      expect(decision.reason).toBe(prohibition.reason);
    }
    // Corroborate directly: findProhibition alone already decides this,
    // before analyzeGaps is ever reached in decide.ts's own DECISION 2.
    expect(findProhibition(action, [prohibition])).not.toBeNull();
  });
});

describe("PART THREE — attack 6: many requirements, and separately 10,000 signals", () => {
  it(
    "HELD — 3,000 satisfied requirements against 3,000 signals still execute correctly and promptly (analyzeGaps/aggregateConfidence are O(requirements x signals) in this frozen implementation, so this is deliberately kept below the full 10,000 x 10,000 the prompt's own suggestion would imply, to stay well inside vitest's per-test timeout — the O(n x m) shape itself is the honest finding, not a crash)",
    () => {
      const SCALE = 3_000;
      const requirements = Array.from({ length: SCALE }, (_, i) =>
        makeRequirement({ signalKind: `req.${i}`, minConfidence: 0.1 }),
      );
      const signals = requirements.map((r, i) => makeSignal({ id: `sig-${i}`, kind: r.signalKind, confidence: 0.9 }));

      const start = performance.now();
      const decision = decide(
        makeInput({
          action: makeAction({ reversibility: "reversible-with-cost", cost: 10 }),
          requirements,
          signals,
          now: NOW,
        }),
      );
      const elapsedMs = performance.now() - start;

      expect(decision.outcome).toBe("execute");
      expect(elapsedMs).toBeLessThan(15_000);
    },
    20_000,
  );

  it("HELD — 10,000 signals of the same kind (mostly stale, one fresh-and-confident) still resolve correctly", () => {
    const requirement = makeRequirement({ signalKind: "test.signal", minConfidence: 0.5, maxAgeMs: HOURS });
    const staleSignals = Array.from({ length: 9_999 }, (_, i) =>
      makeSignal({ id: `stale-${i}`, kind: "test.signal", confidence: 0.95, capturedAtIso: before(NOW, 100 * HOURS) }),
    );
    const theOneFreshSignal = makeSignal({ id: "the-fresh-one", kind: "test.signal", confidence: 0.9 });

    const start = performance.now();
    const decision = decide(
      makeInput({
        action: makeAction({ reversibility: "reversible-with-cost", cost: 10 }),
        requirements: [requirement],
        signals: [...staleSignals, theOneFreshSignal],
        now: NOW,
      }),
    );
    const elapsedMs = performance.now() - start;

    expect(decision.outcome).toBe("execute");
    if (decision.outcome === "execute") {
      expect(decision.confidence).toBeCloseTo(0.9, 5);
    }
    expect(elapsedMs).toBeLessThan(5_000);
  });
});

describe("PART THREE — attack 7: a signal-kind satisfying one requirement's constraint while violating a contradictory sibling requirement's constraint", () => {
  it("HELD — each requirement is checked independently; the same signal can clear one and fail the other, with no cross-contamination", () => {
    const ceilingRequirement = makeRequirement({
      signalKind: "risk.score",
      description: "risk score must be low",
      minConfidence: 0.1,
      valueConstraint: { op: "lte", value: 50 },
    });
    const floorRequirement = makeRequirement({
      signalKind: "risk.score",
      description: "risk score must be high",
      minConfidence: 0.1,
      valueConstraint: { op: "gte", value: 80 },
    });
    const signal = makeSignal({ id: "risk-40", kind: "risk.score", value: 40, confidence: 0.9 });

    const gaps = analyzeGaps([ceilingRequirement, floorRequirement], [signal], NOW);
    // The ceiling requirement is satisfied (40 <= 50) -> no Gap for it.
    // The floor requirement is violated (40 < 80) -> exactly one Gap.
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("constraint-violated");
    if (gaps[0]?.reason === "constraint-violated") {
      expect(gaps[0].requirement.description).toBe("risk score must be high");
    }

    const decision = decide(
      makeInput({
        action: makeAction({ reversibility: "reversible-with-cost", cost: 10 }),
        requirements: [ceilingRequirement, floorRequirement],
        signals: [signal],
        now: NOW,
      }),
    );
    expect(decision.outcome).toBe("escalate");
    if (decision.outcome === "escalate") {
      expect(decision.missing.reason).toContain("must be >= 80");
    }
  });
});

describe("PART THREE — attack 8: the wall clock going backwards between recordDecision and replay", () => {
  it("HELD, structurally — replay() never reads Date.now()/any ambient clock; stubbing it to a wildly different instant changes nothing", () => {
    const requirement = makeRequirement({ signalKind: "test.signal", minConfidence: 0.3 });
    const signal = makeSignal({ kind: "test.signal", confidence: 0.9 });
    const action = makeAction({ reversibility: "reversible-with-cost", cost: 10 });
    const input = makeInput({ action, requirements: [requirement], signals: [signal], now: NOW });

    const record = recordDecision(input, "audit-clock-backwards", NOW);
    if (record.kind !== "decision") throw new Error("expected a decision record");

    const baseline = replay(record, []);

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.parse("1999-01-01T00:00:00.000Z"));
    try {
      const afterClockJump = replay(record, []);
      expect(afterClockJump).toEqual(baseline);
      expect(afterClockJump.matches).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe("PART THREE — the baseline edge cases PLAN.md's own M7 success criteria name explicitly", () => {
  it("zero signals -> never a silent execute, for every supplier kind", () => {
    const suppliers: Requirement["supplier"][] = [
      { kind: "counterparty", party: "the customer" },
      { kind: "time", waitingOn: "a review" },
      { kind: "human", reason: "requires sign-off" },
    ];
    for (const supplier of suppliers) {
      const requirement = makeRequirement({ signalKind: "test.signal", supplier });
      const decision = decide(
        makeInput({
          action: makeAction({ reversibility: "reversible-with-cost", cost: 10 }),
          requirements: [requirement],
          signals: [],
          now: NOW,
        }),
      );
      expect(decision.outcome).not.toBe("execute");
      expect(["ask", "defer", "escalate"]).toContain(decision.outcome);
    }
  });

  it("zero requirements and zero signals -> escalate (no-requirements), never a silent execute", () => {
    const decision = decide(
      makeInput({ action: makeAction({ reversibility: "reversible-with-cost", cost: 10 }), requirements: [], signals: [], now: NOW }),
    );
    expect(decision.outcome).toBe("escalate");
  });

  it("all signals stale -> never a silent execute", () => {
    const requirement = makeRequirement({ signalKind: "test.signal", minConfidence: 0.1, maxAgeMs: 60_000 });
    const staleSignal = makeSignal({ kind: "test.signal", confidence: 0.99, capturedAtIso: before(NOW, 100 * HOURS) });
    const decision = decide(
      makeInput({
        action: makeAction({ reversibility: "reversible-with-cost", cost: 10 }),
        requirements: [requirement],
        signals: [staleSignal],
        now: NOW,
      }),
    );
    expect(decision.outcome).not.toBe("execute");
  });

  it("directly conflicting signals (same kind, contradictory values, both fresh and confident) -> never a silent execute; the constraint-satisfying reading, not the higher-confidence contradicting one, decides", () => {
    const requirement = makeRequirement({
      signalKind: "fraud.assessment",
      minConfidence: 0.1,
      valueConstraint: { op: "equals", value: "clean" },
    });
    const saysClean = makeSignal({ id: "s-clean", kind: "fraud.assessment", value: "clean", confidence: 0.7 });
    const saysFraudulent = makeSignal({
      id: "s-fraud",
      kind: "fraud.assessment",
      value: "fraudulent",
      confidence: 0.95, // deliberately MORE confident than the contradicting "clean" reading
    });

    const decision = decide(
      makeInput({
        action: makeAction({ reversibility: "reversible-with-cost", cost: 10 }),
        requirements: [requirement],
        signals: [saysClean, saysFraudulent],
        now: NOW,
      }),
    );
    // HELD, by design (documented in gap.ts): the requirement is satisfied
    // because AT LEAST ONE candidate clears the constraint — the
    // higher-confidence, contradicting "fraudulent" reading does not
    // override that. FINDING worth naming plainly: decide() never flags
    // the contradiction itself; both signals remain visible in the
    // evidence array for a human to notice, but nothing automatic does.
    expect(decision.outcome).not.toBe("escalate"); // the constraint IS clearable here
    if (decision.outcome === "execute") {
      expect(decision.confidence).toBeCloseTo(0.7, 5); // decided by the CLEARING signal, not the more "confident" contradicting one
    }
  });

  it("a signal claiming impossible confidence (>1), hand-built bypassing the normal parseConfidence boundary, does not cause a silent execute when it is the LIMITING signal — decide() fails closed to escalate instead", () => {
    const requirement = makeRequirement({ signalKind: "test.signal", minConfidence: 0.1 });
    const hostileSignal = {
      id: "hostile-over-1",
      kind: "test.signal",
      source: { kind: "system" as const, system: "hostile" },
      capturedAt: NOW,
      confidence: 1.5 as unknown as Confidence, // impossible: > 1, never producible via parseConfidence
      read: () => ({ status: "fresh" as const, value: "v", age: 0, confidence: 1.5 as unknown as Confidence }),
    };

    const decision = decide(
      makeInput({
        action: makeAction({ reversibility: "reversible-with-cost", cost: 10 }),
        requirements: [requirement],
        signals: [hostileSignal as never],
        now: NOW,
      }),
    );
    expect(decision.outcome).not.toBe("execute");
    expect(decision.outcome).toBe("escalate");
  });

  it("FINDING (not a stop-the-line defect — a documented KNOWN LIMIT applying one layer further than its own disclaimer spells out): an impossible confidence (>1) signal that is NOT the limiting one still gets recorded verbatim in the audit trail, out-of-range value and all", () => {
    const limitingRequirement = makeRequirement({ signalKind: "req.a", minConfidence: 0.1 });
    const nonLimitingRequirement = makeRequirement({ signalKind: "req.b", minConfidence: 0.1 });
    const limitingSignal = makeSignal({ id: "sig-a", kind: "req.a", confidence: 0.9 });
    const hostileNonLimitingSignal = {
      id: "sig-b-hostile",
      kind: "req.b",
      source: { kind: "system" as const, system: "hostile" },
      capturedAt: NOW,
      confidence: 1.5 as unknown as Confidence,
      read: () => ({ status: "fresh" as const, value: "v", age: 0, confidence: 1.5 as unknown as Confidence }),
    };

    const decision = decide(
      makeInput({
        action: makeAction({ reversibility: "reversible-with-cost", cost: 10 }),
        requirements: [limitingRequirement, nonLimitingRequirement],
        signals: [limitingSignal, hostileNonLimitingSignal as never],
        now: NOW,
      }),
    );
    // decide()'s OWN outcome is correct — the impossible value never
    // becomes the reported decision confidence, because it isn't limiting.
    expect(decision.outcome).toBe("execute");
    if (decision.outcome === "execute") {
      expect(decision.confidence).toBeCloseTo(0.9, 5);
    }

    // The FINDING: the audit record's evidence snapshot still carries the
    // impossible 1.5 verbatim — nothing re-validates an already-typed
    // Confidence field before it is written into a SignalSnapshot. This is
    // consistent with signal.ts's own documented KNOWN LIMIT ("nothing
    // stops a caller from hand-writing an object that satisfies the shape
    // without going through createSignal"), extended one layer further
    // (into what the audit trail then preserves) than that disclaimer
    // explicitly states. Reported here, not fixed.
    const record = recordDecision(
      makeInput({
        action: makeAction({ reversibility: "reversible-with-cost", cost: 10 }),
        requirements: [limitingRequirement, nonLimitingRequirement],
        signals: [limitingSignal, hostileNonLimitingSignal as never],
        now: NOW,
      }),
      "audit-impossible-confidence",
      NOW,
    );
    if (record.kind !== "decision") throw new Error("expected a decision record");
    const hostileSnapshot = record.decision.evidence.find((e) => e.id === "sig-b-hostile");
    expect(hostileSnapshot?.confidence).toBe(1.5);
  });
});

describe("PART THREE — attack (bonus): an unbounded `in.values` array reaching decide() directly, bypassing the JSON-boundary MAX_IN_VALUES cap", () => {
  it("FINDING (not a stop-the-line defect — reported for the record): MAX_IN_VALUES (lib/signals/validation.ts) caps parseValueConstraint, not evaluateConstraint or decide() itself; a caller building a Requirement object directly (never through JSON validation) can hand decide() an arbitrarily large allow-list and it is evaluated in full, every time", () => {
    const hugeAllowList = Array.from({ length: 100_000 }, (_, i) => `value-${i}`);
    const requirement = makeRequirement({
      signalKind: "test.signal",
      minConfidence: 0.1,
      valueConstraint: { op: "in", values: hugeAllowList },
    });
    const signal = makeSignal({ kind: "test.signal", value: "value-99999", confidence: 0.9 });

    const start = performance.now();
    const decision = decide(
      makeInput({
        action: makeAction({ reversibility: "reversible-with-cost", cost: 10 }),
        requirements: [requirement],
        signals: [signal],
        now: NOW,
      }),
    );
    const elapsedMs = performance.now() - start;

    // No rejection anywhere in this path — MAX_IN_VALUES (64) is nowhere
    // near enforced here. The call succeeds and is even correct...
    expect(decision.outcome).toBe("execute");
    // ...but note the cost: one O(n) scan of a 100,000-entry array per
    // candidate signal per requirement. A caller with many such
    // requirements (e.g. this same suite's own 10,000-requirement attack
    // above, each with its own huge allow-list) would multiply this out —
    // exactly the "unbounded per-check cost" MAX_IN_VALUES's own doc
    // comment names as the risk, just via a different caller path
    // (decide() called directly) than the one (replay() reading a
    // tampered stored record) that comment explicitly anticipates.
    expect(elapsedMs).toBeLessThan(2_000);
  });
});
