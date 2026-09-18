import { REVERSIBILITY_LEVELS, reversibilityOrdinal, type Reversibility } from "./reversibility.js";
import { type CostOfBeingWrong } from "./cost.js";

/**
 * requiredConfidence(reversibility, cost) is the ONLY place in this project
 * that is allowed to know how demanding the evidence bar should be. Every
 * other file that needs to know "is this confident enough" must call this
 * function rather than compare against a number of its own — that is
 * invariant 3 in .genesis/context-graph.json, and it is why this function's
 * numbers are commented as heavily as they are: a reader who disagrees with
 * a specific number should be able to find it here and nowhere else.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE SHAPE OF THE CURVE
 * ─────────────────────────────────────────────────────────────────────────
 * required = base(reversibility) + headroom(reversibility) * (1 - e^(-cost / scale(reversibility)))
 *            clamped to [base, 0.99]
 *
 * Three per-level constants, chosen so the curve tells a specific story:
 *
 * - BASE_BAR: the bar when the cost of being wrong is ~$0 — i.e. even a
 *   free-to-undo action with no stakes should clear better-than-a-coin-flip
 *   confidence before an autonomous system acts on it. This rises with
 *   reversibility level because "cheap to undo" is not the same as "free to
 *   be wrong" — even a no-trace draft edit shouldn't be flipped on 51%
 *   confidence, and an irreversible action starts demanding real evidence
 *   before a single dollar of stakes has even been added.
 *
 * - HEADROOM: how much room cost has to push the bar up, on top of the
 *   base, for that reversibility level. This is capped per level (not
 *   unbounded) so that base + headroom never reaches 1.0 — see "why the bar
 *   never hits 1.0" below.
 *
 * - SCALE: the dollar amount at which cost has used up roughly 63% of its
 *   headroom (1 - e^-1). Smaller scale = the bar saturates at lower dollar
 *   amounts, appropriate for actions where even modest cost matters a lot
 *   sooner (a no-trace action is rarely used for big stakes, so its curve
 *   is tuned to react at small dollar amounts; an irreversible action's
 *   curve is tuned to keep climbing across a much wider dollar range,
 *   because $500 and $50,000 of irreversible harm are not the same thing
 *   and the bar should keep distinguishing them for longer).
 *
 * Both axes are monotonic non-decreasing by construction: BASE_BAR strictly
 * increases across the four levels, and for fixed scale/headroom,
 * `1 - e^(-cost/scale)` strictly increases in cost for any cost > 0. So
 * required confidence never goes down when either irreversibility or cost
 * of being wrong goes up. That monotonicity is asserted directly in
 * lib/contracts/__tests__/cost-model.test.ts, not just implied by the
 * formula.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE BAR NEVER HITS 1.0
 * ─────────────────────────────────────────────────────────────────────────
 * The curve asymptotes toward 0.99, never to 1.0, and the clamp enforces
 * that explicitly. Two reasons:
 *
 * 1. Perfect certainty is not a real epistemic state for anything this
 *    project reads from typed signals (M3) — demanding confidence = 1.0
 *    would make `execute` permanently unreachable for that class of action,
 *    which isn't "very strict", it's a different outcome wearing execute's
 *    clothes.
 * 2. Whether a bar this demanding should instead trigger an automatic
 *    `escalate` — "no confidence would suffice" per ADR 0001 — is a
 *    decision *about outcomes*, which is lib/decide's job in M4, not this
 *    cost model's. requiredConfidence answers one question only: how high
 *    is the bar. Keeping it a pure confidence-bar function (range
 *    [BASE_BAR, 0.99)) rather than letting it fold in "...and therefore
 *    this should escalate" keeps M1's cost model and M4's outcome selection
 *    from blurring into each other. A reader who thinks some (reversibility,
 *    cost) pairs should be *unreachable by any confidence* rather than
 *    merely "very hard to reach" is disagreeing with a decision that
 *    belongs to M4, not to this function.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE WORKED EXAMPLES FROM THE BRIEF
 * ─────────────────────────────────────────────────────────────────────────
 * requiredConfidence("reversible-no-trace", 5)        ≈ 0.508  → 0.60 confidence clears it (executes)
 * requiredConfidence("irreversible", 50_000)          ≈ 0.978  → 0.95 confidence does NOT clear it (escalates)
 *
 * Both are asserted as literal boundary cases in the test suite, alongside
 * the general monotonicity properties, so the specific numbers stay honest
 * even if the constants below are retuned later.
 */

const BASE_BAR: Readonly<Record<Reversibility, number>> = {
  "reversible-no-trace": 0.5,
  "reversible-with-cost": 0.6,
  "reversible-with-delay": 0.72,
  irreversible: 0.85,
};

const HEADROOM: Readonly<Record<Reversibility, number>> = {
  "reversible-no-trace": 0.08,
  "reversible-with-cost": 0.12,
  "reversible-with-delay": 0.15,
  irreversible: 0.14,
};

const SCALE_DOLLARS: Readonly<Record<Reversibility, number>> = {
  "reversible-no-trace": 50,
  "reversible-with-cost": 500,
  "reversible-with-delay": 5_000,
  irreversible: 20_000,
};

/** Hard ceiling — see "why the bar never hits 1.0" above. */
const MAX_BAR = 0.99;

export function requiredConfidence(
  reversibility: Reversibility,
  cost: CostOfBeingWrong,
): number {
  const base = BASE_BAR[reversibility];
  const headroom = HEADROOM[reversibility];
  const scale = SCALE_DOLLARS[reversibility];

  const costTerm = headroom * (1 - Math.exp(-cost / scale));
  const bar = base + costTerm;

  return Math.min(bar, MAX_BAR);
}

/**
 * Convenience re-export so callers don't need a second import just to walk
 * the levels in order (e.g. to build a table-driven test or a UI legend).
 * Not used by requiredConfidence itself, which indexes BASE_BAR/HEADROOM/
 * SCALE_DOLLARS by the Reversibility string directly rather than by ordinal.
 */
export { REVERSIBILITY_LEVELS, reversibilityOrdinal };
