import { describe, expect, it } from "vitest";
import { aggregateConfidence } from "../aggregate.js";
import { analyzeGaps } from "../../signals/gap.js";
import { fixtureRequirement, fixtureSignal, NOW } from "./fixtures.js";

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
