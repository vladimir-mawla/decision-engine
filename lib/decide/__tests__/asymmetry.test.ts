import { describe, expect, it } from "vitest";
import { decide } from "../decide.js";
import { requiredConfidence } from "../../cost-model/requiredConfidence.js";
import type { Reversibility } from "../../cost-model/reversibility.js";
import { sampleAction, fixtureInput, fixtureRequirement, fixtureSignal } from "./fixtures.js";

/**
 * THE PROJECT'S CENTRAL CLAIM, end-to-end: the identical confidence value,
 * fed through two different cost/reversibility profiles, yields `execute`
 * for one and `escalate` for the other. Table-driven per the milestone
 * brief's explicit instruction.
 *
 * Each row holds `confidence` fixed and only varies the action's stakes —
 * proving the asymmetry lives in requiredConfidence's bar (M1), reached
 * through decide()'s own aggregation and comparison (M4), not in anything
 * about the evidence itself.
 */
describe("the asymmetry, end-to-end: same confidence, different stakes, different outcome", () => {
  const rows: ReadonlyArray<{
    readonly confidence: number;
    readonly cheap: { readonly reversibility: Reversibility; readonly cost: number };
    readonly costly: { readonly reversibility: Reversibility; readonly cost: number };
  }> = [
    {
      // The brief's own worked examples: requiredConfidence("reversible-no-trace", 5) ≈ 0.508 (0.60 clears it),
      // requiredConfidence("irreversible", 50_000) ≈ 0.978 (0.95 does not).
      confidence: 0.95,
      cheap: { reversibility: "reversible-no-trace", cost: 5 },
      costly: { reversibility: "irreversible", cost: 50_000 },
    },
    {
      confidence: 0.65,
      cheap: { reversibility: "reversible-no-trace", cost: 5 },
      costly: { reversibility: "reversible-with-delay", cost: 5_000 },
    },
    {
      confidence: 0.7,
      cheap: { reversibility: "reversible-with-cost", cost: 50 },
      costly: { reversibility: "irreversible", cost: 20_000 },
    },
  ];

  for (const row of rows) {
    it(`confidence ${row.confidence}: executes at (${row.cheap.reversibility}, $${row.cheap.cost}) but escalates at (${row.costly.reversibility}, $${row.costly.cost})`, () => {
      const cheapAction = sampleAction(row.cheap);
      const costlyAction = sampleAction(row.costly);

      // Sanity: requiredConfidence itself actually differs and brackets
      // the fixed confidence value on either side — otherwise this row
      // wouldn't be testing the asymmetry at all.
      const cheapBar = requiredConfidence(cheapAction.reversibility, cheapAction.costOfBeingWrong);
      const costlyBar = requiredConfidence(costlyAction.reversibility, costlyAction.costOfBeingWrong);
      expect(row.confidence).toBeGreaterThanOrEqual(cheapBar);
      expect(row.confidence).toBeLessThan(costlyBar);

      const requirement = fixtureRequirement({ minConfidence: 0.01 });
      const signal = fixtureSignal({ confidence: row.confidence });

      const cheapDecision = decide(
        fixtureInput({ action: cheapAction, requirements: [requirement], signals: [signal] }),
      );
      const costlyDecision = decide(
        fixtureInput({ action: costlyAction, requirements: [requirement], signals: [signal] }),
      );

      expect(cheapDecision.outcome).toBe("execute");
      expect(costlyDecision.outcome).toBe("escalate");
    });
  }
});

/**
 * Boundary: confidence exactly at the bar, and one step either side.
 */
describe("boundary — confidence exactly at the required bar, and one step either side", () => {
  it("exactly at the bar clears it (execute); one epsilon below does not (escalate); one epsilon above clears it more comfortably (execute)", () => {
    const action = sampleAction({ reversibility: "reversible-with-cost", cost: 500 });
    const bar = requiredConfidence(action.reversibility, action.costOfBeingWrong);
    const requirement = fixtureRequirement({ minConfidence: 0.01 });
    const epsilon = 1e-6;

    const at = decide(
      fixtureInput({ action, requirements: [requirement], signals: [fixtureSignal({ confidence: bar })] }),
    );
    const below = decide(
      fixtureInput({
        action,
        requirements: [requirement],
        signals: [fixtureSignal({ confidence: bar - epsilon })],
      }),
    );
    const above = decide(
      fixtureInput({
        action,
        requirements: [requirement],
        signals: [fixtureSignal({ confidence: Math.min(bar + epsilon, 1) })],
      }),
    );

    expect(at.outcome).toBe("execute");
    expect(below.outcome).toBe("escalate");
    expect(above.outcome).toBe("execute");
  });
});
