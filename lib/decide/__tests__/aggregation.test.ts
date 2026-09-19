import { describe, expect, it } from "vitest";
import { aggregateConfidence } from "../aggregate.js";
import { analyzeGaps } from "../../signals/gap.js";
import { decide } from "../decide.js";
import { fixtureInput, fixtureRequirement, fixtureSignal, NOW } from "./fixtures.js";

/**
 * DECISION 4 — aggregation is `min`, and the limiting signal is recorded
 * explicitly (not left for a caller to re-derive).
 */
describe("aggregateConfidence — min, with the limiting signal named", () => {
  it("aggregate confidence is the minimum across all satisfying signals, not an average", () => {
    const strong = fixtureRequirement({ signalKind: "a", minConfidence: 0.1 });
    const weak = fixtureRequirement({ signalKind: "b", minConfidence: 0.1 });
    const signals = [
      fixtureSignal({ kind: "a", confidence: 0.95 }),
      fixtureSignal({ kind: "b", confidence: 0.4 }),
    ];

    const aggregate = aggregateConfidence([strong, weak], signals, NOW);

    expect(aggregate).not.toBeNull();
    expect(aggregate?.confidence).toBe(0.4); // NOT (0.95+0.4)/2 = 0.675
    expect(aggregate?.limiting.requirement.signalKind).toBe("b");
    expect(aggregate?.limiting.confidence).toBe(0.4);
  });

  it("the limiting signal is concrete and inspectable, not just a number", () => {
    const requirement = fixtureRequirement({ signalKind: "the-weak-one", minConfidence: 0.1 });
    const signal = fixtureSignal({ id: "sig-weak", kind: "the-weak-one", confidence: 0.33 });

    const aggregate = aggregateConfidence([requirement], [signal], NOW);

    expect(aggregate?.limiting.signal.id).toBe("sig-weak");
    expect(aggregate?.limiting.requirement.signalKind).toBe("the-weak-one");
  });

  it("with a single requirement, aggregate confidence equals that requirement's own satisfying confidence exactly", () => {
    const requirement = fixtureRequirement({ minConfidence: 0.1 });
    const signal = fixtureSignal({ confidence: 0.777 });
    const aggregate = aggregateConfidence([requirement], [signal], NOW);
    expect(aggregate?.confidence).toBe(0.777);
  });

  it("when multiple candidates could satisfy one requirement, the strongest one is used", () => {
    const requirement = fixtureRequirement({ signalKind: "k", minConfidence: 0.1 });
    const signals = [
      fixtureSignal({ id: "weaker", kind: "k", confidence: 0.5 }),
      fixtureSignal({ id: "stronger", kind: "k", confidence: 0.9 }),
    ];
    const aggregate = aggregateConfidence([requirement], signals, NOW);
    expect(aggregate?.limiting.signal.id).toBe("stronger");
    expect(aggregate?.confidence).toBe(0.9);
  });

  it("returns null (not a fabricated confidence) when a requirement has no satisfying signal", () => {
    const requirement = fixtureRequirement({ signalKind: "unmet" });
    expect(aggregateConfidence([requirement], [], NOW)).toBeNull();
  });

  it("returns null (not confidence 1.0) for an empty requirement set — decide.ts handles this as its own named case", () => {
    expect(aggregateConfidence([], [fixtureSignal()], NOW)).toBeNull();
  });

  /**
   * FIX 3 (M4 independent verification): mutation testing found that
   * flipping `min` to `max` in the `reduce` above breaks exactly ONE of
   * this project's 223 tests — the single test above. Both the min and
   * the max version produce a fully-formed, textually normal-looking
   * `Aggregate`, so deleting or weakening that one test would let a
   * materially wrong engine ship silently. The tests below add
   * independent coverage: more requirements, different orderings, and
   * (further down) an end-to-end proof through `decide()` itself.
   */
  it("with three requirements, the minimum is picked regardless of position in the array (first)", () => {
    const weakest = fixtureRequirement({ signalKind: "weakest", minConfidence: 0.1 });
    const middle = fixtureRequirement({ signalKind: "middle", minConfidence: 0.1 });
    const strongest = fixtureRequirement({ signalKind: "strongest", minConfidence: 0.1 });
    const signals = [
      fixtureSignal({ kind: "weakest", confidence: 0.2 }),
      fixtureSignal({ kind: "middle", confidence: 0.6 }),
      fixtureSignal({ kind: "strongest", confidence: 0.99 }),
    ];

    const aggregate = aggregateConfidence([weakest, middle, strongest], signals, NOW);

    expect(aggregate?.confidence).toBe(0.2);
    expect(aggregate?.limiting.requirement.signalKind).toBe("weakest");
  });

  it("with three requirements, the minimum is picked regardless of position in the array (last)", () => {
    const strongest = fixtureRequirement({ signalKind: "strongest", minConfidence: 0.1 });
    const middle = fixtureRequirement({ signalKind: "middle", minConfidence: 0.1 });
    const weakest = fixtureRequirement({ signalKind: "weakest", minConfidence: 0.1 });
    const signals = [
      fixtureSignal({ kind: "strongest", confidence: 0.99 }),
      fixtureSignal({ kind: "middle", confidence: 0.6 }),
      fixtureSignal({ kind: "weakest", confidence: 0.2 }),
    ];

    const aggregate = aggregateConfidence([strongest, middle, weakest], signals, NOW);

    expect(aggregate?.confidence).toBe(0.2);
    expect(aggregate?.limiting.requirement.signalKind).toBe("weakest");
  });

  it("adding one more very strong requirement never raises the aggregate above the existing weakest one", () => {
    const weak = fixtureRequirement({ signalKind: "weak", minConfidence: 0.1 });
    const alsoWeak = fixtureRequirement({ signalKind: "also-weak", minConfidence: 0.1 });
    const withoutNewStrongOne = aggregateConfidence(
      [weak, alsoWeak],
      [fixtureSignal({ kind: "weak", confidence: 0.3 }), fixtureSignal({ kind: "also-weak", confidence: 0.35 })],
      NOW,
    );
    const strong = fixtureRequirement({ signalKind: "very-strong", minConfidence: 0.1 });
    const withNewStrongOne = aggregateConfidence(
      [weak, alsoWeak, strong],
      [
        fixtureSignal({ kind: "weak", confidence: 0.3 }),
        fixtureSignal({ kind: "also-weak", confidence: 0.35 }),
        fixtureSignal({ kind: "very-strong", confidence: 0.999 }),
      ],
      NOW,
    );

    // Adding stronger evidence can only ever hold the aggregate steady or
    // lower it (a new weaker requirement could lower it further) — it can
    // NEVER raise it. Under `max`, adding the 0.999 signal would raise the
    // aggregate from 0.3 to 0.999, which this assertion catches directly.
    expect(withoutNewStrongOne?.confidence).toBe(0.3);
    expect(withNewStrongOne?.confidence).toBe(0.3);
    expect(withNewStrongOne!.confidence).toBeLessThanOrEqual(withoutNewStrongOne!.confidence);
  });

  it("FIX 4: a genuine tie in confidence names the FIRST-occurring requirement as limiting, documented in aggregate.ts's own comment", () => {
    const first = fixtureRequirement({ signalKind: "first", minConfidence: 0.1 });
    const second = fixtureRequirement({ signalKind: "second", minConfidence: 0.1 });
    const signals = [
      fixtureSignal({ kind: "first", confidence: 0.5 }),
      fixtureSignal({ kind: "second", confidence: 0.5 }), // exact tie with "first"
    ];

    const aggregate = aggregateConfidence([first, second], signals, NOW);
    expect(aggregate?.limiting.requirement.signalKind).toBe("first");

    // Reversing declaration order flips which one is "first" — proving
    // this is genuinely about array order, not something intrinsic to
    // the signal kind's name.
    const reversed = aggregateConfidence([second, first], signals, NOW);
    expect(reversed?.limiting.requirement.signalKind).toBe("second");
  });
});

/**
 * FIX 3 (M4 independent verification) — end-to-end proof through
 * `decide()` itself, with multiple requirements, which the verification
 * noted did not previously exist for aggregation. A `min` vs `max` bug
 * here is not an abstract unit-test concern: with `max`, `decide()` would
 * `execute` an action that should have `escalate`d, because the one weak
 * signal among several strong ones would be silently ignored.
 */
describe("decide() end-to-end — aggregation's min, not max, determines execute vs escalate", () => {
  it("several strong signals plus one weak one escalate, naming the weak one — max would wrongly execute", () => {
    const strongA = fixtureRequirement({ signalKind: "strong-a", minConfidence: 0.1 });
    const strongB = fixtureRequirement({ signalKind: "strong-b", minConfidence: 0.1 });
    const weak = fixtureRequirement({ signalKind: "the-weak-link", minConfidence: 0.1 });

    const decision = decide(
      fixtureInput({
        requirements: [strongA, strongB, weak],
        signals: [
          fixtureSignal({ kind: "strong-a", confidence: 0.98 }),
          fixtureSignal({ kind: "strong-b", confidence: 0.97 }),
          // Well under the default action's ~0.60 bar (reversible-with-cost, cost 500).
          fixtureSignal({ kind: "the-weak-link", confidence: 0.2 }),
        ],
      }),
    );

    // Under `min` (correct): aggregate confidence is 0.2, well under the
    // bar -> escalate, naming "the-weak-link". Under `max` (mutated):
    // aggregate confidence would be 0.98, comfortably clearing the bar ->
    // execute. This assertion fails under that mutation.
    expect(decision.outcome).toBe("escalate");
    if (decision.outcome === "escalate") {
      expect(decision.missing.reason).toContain("the-weak-link");
      expect(decision.missing.reason).toContain("0.2000");
    }
  });

  it("all signals strong enough (including the weakest) execute, with confidence equal to the weakest — max would report a higher, wrong confidence", () => {
    const a = fixtureRequirement({ signalKind: "req-a", minConfidence: 0.1 });
    const b = fixtureRequirement({ signalKind: "req-b", minConfidence: 0.1 });
    const c = fixtureRequirement({ signalKind: "req-c", minConfidence: 0.1 });

    const decision = decide(
      fixtureInput({
        requirements: [a, b, c],
        signals: [
          fixtureSignal({ kind: "req-a", confidence: 0.99 }),
          fixtureSignal({ kind: "req-b", confidence: 0.95 }),
          fixtureSignal({ kind: "req-c", confidence: 0.7 }), // still clears the default ~0.60 bar
        ],
      }),
    );

    expect(decision.outcome).toBe("execute");
    if (decision.outcome === "execute") {
      // The reported confidence is the weakest (0.7), never the strongest
      // (0.99) a `max` mutation would report.
      expect(decision.confidence).toBe(0.7);
    }
  });
});

/**
 * `findSatisfaction` (via `aggregateConfidence`) must agree with
 * `analyzeGaps` about what "satisfied" means — otherwise DECISION 4's
 * aggregation could silently diverge from DECISION 1-3's gap handling.
 * This checks the equivalence directly across a spread of fixtures rather
 * than trusting that the two independently-written filters happen to
 * match.
 */
describe("aggregateConfidence agrees with analyzeGaps about what counts as satisfied", () => {
  const cases: ReadonlyArray<{ readonly label: string; readonly confidence: number; readonly minConfidence: number; readonly capturedAtIso: string; readonly maxAgeMs: number }> = [
    { label: "clearly satisfied", confidence: 0.95, minConfidence: 0.8, capturedAtIso: "2026-09-19T11:00:00Z", maxAgeMs: 24 * 60 * 60 * 1000 },
    { label: "exactly at minConfidence", confidence: 0.8, minConfidence: 0.8, capturedAtIso: "2026-09-19T11:00:00Z", maxAgeMs: 24 * 60 * 60 * 1000 },
    { label: "just below minConfidence", confidence: 0.79, minConfidence: 0.8, capturedAtIso: "2026-09-19T11:00:00Z", maxAgeMs: 24 * 60 * 60 * 1000 },
    { label: "fresh but too old", confidence: 0.95, minConfidence: 0.8, capturedAtIso: "2026-09-17T11:00:00Z", maxAgeMs: 60 * 60 * 1000 },
    { label: "exactly at maxAge boundary", confidence: 0.95, minConfidence: 0.8, capturedAtIso: "2026-09-19T11:00:00Z", maxAgeMs: 60 * 60 * 1000 },
  ];

  for (const c of cases) {
    it(`${c.label}: analyzeGaps reports no Gap iff findSatisfaction (via aggregateConfidence) finds a satisfier`, () => {
      const requirement = fixtureRequirement({
        signalKind: "k",
        minConfidence: c.minConfidence,
        maxAgeMs: c.maxAgeMs,
      });
      const signal = fixtureSignal({ kind: "k", confidence: c.confidence, capturedAtIso: c.capturedAtIso });

      const gaps = analyzeGaps([requirement], [signal], NOW);
      const aggregate = aggregateConfidence([requirement], [signal], NOW);

      expect(gaps.length === 0).toBe(aggregate !== null);
    });
  }
});
