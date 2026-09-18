import { describe, expect, it } from "vitest";
import { requiredConfidence, REQUIRED_CONFIDENCE_TEST_ONLY } from "../../cost-model/requiredConfidence.js";
import { REVERSIBILITY_LEVELS, type Reversibility } from "../../cost-model/reversibility.js";
import { parseCostOfBeingWrong, type CostOfBeingWrong } from "../../cost-model/cost.js";

function cost(amount: number): CostOfBeingWrong {
  const parsed = parseCostOfBeingWrong(amount);
  if (!parsed.ok) throw new Error(`fixture cost ${amount} should be valid`);
  return parsed.value;
}

/**
 * This is the project's central, hardest-to-fake claim: the *same*
 * confidence value must be able to land on either side of "clears the bar"
 * depending purely on what's at stake. decide() itself is M4's job, not
 * M1's — but the comparison it will make (confidence >= requiredConfidence)
 * is trivial and reproduced locally here so the claim is checked now rather
 * than deferred to a milestone that doesn't exist yet.
 */
function clearsBar(confidence: number, reversibility: Reversibility, theCost: CostOfBeingWrong): boolean {
  return confidence >= requiredConfidence(reversibility, theCost);
}

describe("requiredConfidence — the reversibility x cost asymmetry", () => {
  it("the brief's own worked examples", () => {
    // A reversible $5 action at 60% confidence executes.
    const cheapReversibleBar = requiredConfidence("reversible-no-trace", cost(5));
    expect(cheapReversibleBar).toBeLessThanOrEqual(0.6);
    expect(clearsBar(0.6, "reversible-no-trace", cost(5))).toBe(true);

    // An irreversible $50,000 action at 95% confidence escalates (does not clear the bar).
    const expensiveIrreversibleBar = requiredConfidence("irreversible", cost(50_000));
    expect(expensiveIrreversibleBar).toBeGreaterThan(0.95);
    expect(clearsBar(0.95, "irreversible", cost(50_000))).toBe(false);
  });

  it("the identical confidence produces different outcomes at different stakes (table-driven)", () => {
    const confidence = 0.9;

    const table: ReadonlyArray<{
      readonly reversibility: Reversibility;
      readonly cost: number;
      readonly expectClears: boolean;
      readonly why: string;
    }> = [
      { reversibility: "reversible-no-trace", cost: 5, expectClears: true, why: "cheap and free to undo" },
      { reversibility: "reversible-no-trace", cost: 50_000, expectClears: true, why: "costly but still free to undo — the ceiling for this level stays low" },
      { reversibility: "reversible-with-cost", cost: 500, expectClears: true, why: "moderate stakes, reversible at a cost" },
      { reversibility: "reversible-with-delay", cost: 5_000, expectClears: true, why: "recoverable, but the bar is climbing" },
      { reversibility: "irreversible", cost: 5, expectClears: true, why: "irreversible but nearly costless if wrong" },
      { reversibility: "irreversible", cost: 50_000, expectClears: false, why: "irreversible AND expensive — this is the escalate case" },
    ];

    for (const { reversibility, cost: amount, expectClears, why } of table) {
      const result = clearsBar(confidence, reversibility, cost(amount));
      expect(result, `${reversibility} @ $${amount} (${why})`).toBe(expectClears);
    }

    // The central asymmetry, stated directly: fixing confidence at 0.9 and
    // varying only the stakes produces both outcomes.
    const outcomes = new Set(
      table.map(({ reversibility, cost: amount }) => clearsBar(confidence, reversibility, cost(amount))),
    );
    expect(outcomes.size).toBe(2);
  });

  it("rises monotonically as reversibility gets worse, cost held fixed", () => {
    const amount = cost(1_000);
    const bars = REVERSIBILITY_LEVELS.map((level) => requiredConfidence(level, amount));
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i]).toBeGreaterThan(bars[i - 1]!);
    }
  });

  it("rises monotonically as cost increases, reversibility held fixed", () => {
    // Amounts chosen to stay short of the point where every level's curve
    // saturates in 64-bit float: once cost/scale is large enough that
    // e^(-cost/scale) is smaller than double-precision epsilon relative to
    // 1, `1 - e^(-cost/scale)` rounds to exactly 1.0 and the bar stops
    // moving in floating point even though the underlying real-valued
    // function is still (infinitesimally) increasing. That saturation is
    // covered on its own terms below ("never decreases, even fully
    // saturated") rather than papered over here.
    const amounts = [0, 1, 10, 100, 1_000];
    for (const level of REVERSIBILITY_LEVELS) {
      const bars = amounts.map((amount) => requiredConfidence(level, cost(amount)));
      for (let i = 1; i < bars.length; i++) {
        expect(bars[i], `${level}: $${amounts[i]} vs $${amounts[i - 1]}`).toBeGreaterThan(bars[i - 1]!);
      }
    }
  });

  it("never decreases as cost increases, even once the curve is fully saturated", () => {
    const amounts = [0, 1, 10, 100, 1_000, 10_000, 100_000, 1_000_000];
    for (const level of REVERSIBILITY_LEVELS) {
      const bars = amounts.map((amount) => requiredConfidence(level, cost(amount)));
      for (let i = 1; i < bars.length; i++) {
        expect(bars[i], `${level}: $${amounts[i]} vs $${amounts[i - 1]}`).toBeGreaterThanOrEqual(bars[i - 1]!);
      }
    }
  });

  it("never reaches or exceeds 1.0, for any reversibility level, even at extreme cost", () => {
    for (const level of REVERSIBILITY_LEVELS) {
      const bar = requiredConfidence(level, cost(1_000_000_000));
      expect(bar).toBeLessThan(1);
      expect(bar).toBeGreaterThanOrEqual(0);
    }
  });

  it("boundary cases: exactly at the bar, and one step either side", () => {
    const level: Reversibility = "reversible-with-cost";
    const amount = cost(500);
    const bar = requiredConfidence(level, amount);
    const epsilon = 1e-6;

    expect(clearsBar(bar, level, amount)).toBe(true); // exactly at the bar clears it (>=, not >)
    expect(clearsBar(bar - epsilon, level, amount)).toBe(false); // one step below does not
    expect(clearsBar(bar + epsilon, level, amount)).toBe(true); // one step above does
  });

  it("is a pure function of its two inputs — same inputs, same bar, every call", () => {
    const a = requiredConfidence("reversible-with-delay", cost(2_500));
    const b = requiredConfidence("reversible-with-delay", cost(2_500));
    expect(a).toBe(b);
  });
});

/**
 * The four levels only tell a coherent story ("cheap-and-forgiving asks
 * less than expensive-and-permanent") if their asymptotes (base + headroom)
 * are distinct and strictly ordered, and only stay a hard ceiling of 0.99
 * if the clamp is never actually needed to enforce it. Neither property
 * was previously asserted anywhere — a future retune of BASE_BAR/HEADROOM
 * could silently collapse two levels onto the same bar (the exact failure
 * mode that would undo this model) and nothing would fail. These tests
 * check both properties directly against the constants themselves via
 * REQUIRED_CONFIDENCE_TEST_ONLY, not by eyeballing a couple of sample
 * costs, so a retune that breaks either is caught regardless of which
 * cost value someone happens to test it with.
 */
describe("requiredConfidence — the four levels' asymptotes stay distinct, ordered, and under the ceiling", () => {
  const { BASE_BAR, HEADROOM, MAX_BAR } = REQUIRED_CONFIDENCE_TEST_ONLY;

  function asymptote(level: Reversibility): number {
    return BASE_BAR[level] + HEADROOM[level];
  }

  it("every level's asymptote (base + headroom) is <= MAX_BAR (0.99)", () => {
    for (const level of REVERSIBILITY_LEVELS) {
      expect(asymptote(level)).toBeLessThanOrEqual(MAX_BAR);
    }
  });

  it("the four asymptotes are strictly increasing across the levels, in scale order", () => {
    const asymptotes = REVERSIBILITY_LEVELS.map(asymptote);
    for (let i = 1; i < asymptotes.length; i++) {
      expect(asymptotes[i], `${REVERSIBILITY_LEVELS[i]} vs ${REVERSIBILITY_LEVELS[i - 1]}`).toBeGreaterThan(
        asymptotes[i - 1]!,
      );
    }
  });

  it("the Math.min(bar, MAX_BAR) clamp does not engage for any level today", () => {
    // The cost term is headroom * (1 - e^-x), which is always < headroom
    // for any finite cost — so the unclamped bar (base + costTerm) is
    // always < base + headroom = asymptote, and the clamp only ever does
    // real work if some level's asymptote exceeds MAX_BAR. It does not,
    // today (checked above) — so Math.min never actually clips a value;
    // this restates that as "the clamp is a no-op given the constants as
    // they stand" rather than re-deriving it, to keep this test's intent
    // legible on its own.
    for (const level of REVERSIBILITY_LEVELS) {
      expect(Math.min(asymptote(level), MAX_BAR)).toBe(asymptote(level));
    }

    // And confirm it holds for requiredConfidence's actual output too, at
    // a cost deep enough into the exponential's saturation regime that the
    // bar has stopped moving (see the float-saturation note beside
    // SCALE_DOLLARS in requiredConfidence.ts): the saturated output equals
    // the asymptote exactly, for every level, not something clamped lower.
    for (const level of REVERSIBILITY_LEVELS) {
      const saturatedBar = requiredConfidence(level, cost(1_000_000_000));
      expect(saturatedBar).toBe(asymptote(level));
    }
  });
});
