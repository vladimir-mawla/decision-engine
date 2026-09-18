import { describe, expect, it } from "vitest";
import {
  resolveReversibility,
  WORST_CASE_REVERSIBILITY,
  REVERSIBILITY_LEVELS,
} from "../../cost-model/reversibility.js";
import { resolveCostOfBeingWrong, WORST_CASE_COST, parseCostOfBeingWrong } from "../../cost-model/cost.js";
import { requiredConfidence } from "../../cost-model/requiredConfidence.js";

/**
 * "Fail closed": an action whose reversibility or cost cannot be determined
 * must be treated as the worst case, not the best. These tests prove the
 * resolvers actually do that — not by assertion in prose, but by checking
 * that the resolved values push requiredConfidence UP to its ceiling, never
 * down toward "easy to approve".
 */
describe("fail-closed: undeterminable reversibility resolves to the worst case", () => {
  const garbageInputs: readonly unknown[] = [
    undefined,
    null,
    "",
    "REVERSIBLE",
    "reversible-no-trac", // typo
    "gone forever", // not one of the four known levels
    42,
    {},
    [],
  ];

  it.each(garbageInputs)("resolveReversibility(%p) is the worst case, never the best", (input) => {
    expect(resolveReversibility(input)).toBe(WORST_CASE_REVERSIBILITY);
    expect(resolveReversibility(input)).toBe("irreversible");
  });

  it("every recognized level still passes through unchanged", () => {
    for (const level of REVERSIBILITY_LEVELS) {
      expect(resolveReversibility(level)).toBe(level);
    }
  });

  it("the worst case is actually the worst — no recognized level demands a higher bar at the same cost", () => {
    const cost = parseCostOfBeingWrong(10_000);
    if (!cost.ok) throw new Error("fixture cost should be valid");

    const worstBar = requiredConfidence(WORST_CASE_REVERSIBILITY, cost.value);
    for (const level of REVERSIBILITY_LEVELS) {
      expect(requiredConfidence(level, cost.value)).toBeLessThanOrEqual(worstBar);
    }
  });
});

describe("fail-closed: undeterminable cost of being wrong resolves to the worst case", () => {
  const garbageInputs: readonly unknown[] = [
    undefined,
    null,
    "not a number",
    NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -1,
    -0.01,
    {},
    [],
  ];

  it.each(garbageInputs)("resolveCostOfBeingWrong(%p) is the worst case, never the best (0)", (input) => {
    expect(resolveCostOfBeingWrong(input)).toBe(WORST_CASE_COST);
  });

  it("every valid, finite, non-negative amount still passes through unchanged", () => {
    for (const amount of [0, 1, 5, 500, 50_000]) {
      expect(resolveCostOfBeingWrong(amount)).toBe(amount);
    }
  });

  it("the worst-case cost pushes every reversibility level to (or toward) its ceiling", () => {
    for (const level of REVERSIBILITY_LEVELS) {
      const barAtWorstCost = requiredConfidence(level, WORST_CASE_COST);
      const barAtZeroCost = requiredConfidence(level, resolveCostOfBeingWrong(0));
      expect(barAtWorstCost).toBeGreaterThan(barAtZeroCost);
    }
  });
});

describe("fail-closed: both axes undeterminable at once is still the worst case, not a crash", () => {
  it("combining both resolvers on completely garbage input yields the global maximum bar", () => {
    const reversibility = resolveReversibility("¿quién sabe?");
    const cost = resolveCostOfBeingWrong("also unknown");

    const bar = requiredConfidence(reversibility, cost);

    for (const level of REVERSIBILITY_LEVELS) {
      for (const amount of [0, 5, 500, 50_000, 1_000_000]) {
        const parsed = parseCostOfBeingWrong(amount);
        if (!parsed.ok) throw new Error("fixture cost should be valid");
        expect(requiredConfidence(level, parsed.value)).toBeLessThanOrEqual(bar);
      }
    }
  });
});
