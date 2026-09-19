import { requiredConfidence } from "../cost-model/requiredConfidence.js";
import { WORST_CASE_COST } from "../cost-model/cost.js";
import type { Action } from "../contracts/action.js";

/**
 * DECISION 3 (half of it) — telling "the bar is unreachable" apart from
 * "the evidence is complete but insufficient right now", both of which are
 * `escalate` (no gaps, aggregate confidence below `requiredConfidence`).
 *
 * `requiredConfidence` is deliberately capped below 1.0 (see its own
 * "why the bar never hits 1.0" comment) precisely so `execute` is never
 * *mathematically* impossible — under min-aggregation (DECISION 4), a
 * signal reporting Confidence 1.0 would always clear any bar
 * `requiredConfidence` can produce. So "unreachable" cannot honestly mean
 * "no confidence value could ever satisfy this" in a literal sense — that
 * is never true by this model's own construction, and claiming otherwise
 * would be exactly the kind of plausible-looking-but-wrong claim this
 * project's fail-closed ethos rejects.
 *
 * What CAN be determined honestly, using only `requiredConfidence` itself
 * (invariant 3 — it is the only source of a bar) and its own public
 * `WORST_CASE_COST` sentinel (not a bare numeric literal dreamed up here —
 * a documented, exported constant meant for exactly this kind of "what's
 * the ceiling" question): whether the bar this action's actual
 * (reversibility, cost) demands has already reached the bar that SAME
 * reversibility level would demand at the worst conceivable cost. Because
 * `requiredConfidence` is monotonic non-decreasing in cost and clamped, the
 * curve saturates — past a certain cost, raising it further does not raise
 * the bar at all (see requiredConfidence.ts's own "KNOWN PROPERTY" note on
 * float saturation). If the actual bar has already reached that ceiling,
 * then the stake level has already extracted the maximum demand this
 * reversibility level's model will ever make — no story about "the stakes
 * are actually higher than we thought" can push the bar any higher, and
 * `escalate` for this action is not "try again once you have better
 * evidence", it is "this reversibility level, at this cost, is already at
 * its worst-case bar — a human owns this call, permanently, not just today."
 * That is what `isBarSaturated` below tests, and it is the operational
 * meaning `decide.ts` gives to "unreachable at this stake level."
 *
 * A reader could disagree with tying "unreachable" to cost-saturation
 * specifically (rather than, say, whether the *limiting signal's own*
 * provenance kind could ever be trusted at this stake level — a
 * `counterparty` self-report is never going to satisfy an irreversible
 * seven-figure action, no matter its stated confidence). That alternative
 * is real and was considered; it was not chosen because it would require
 * inventing a second, independent policy ("which provenance kinds are
 * capped at which stake levels") that lives nowhere in M1–M3's contracts
 * and would need its own bar-like constant — reintroducing the exact
 * "bare numeric threshold" invariant 3 forbids. Saturation uses only
 * numbers `requiredConfidence` itself already produces.
 */
export function isBarSaturated(action: Action): boolean {
  const bar = requiredConfidence(action.reversibility, action.costOfBeingWrong);
  const ceiling = requiredConfidence(action.reversibility, WORST_CASE_COST);
  return bar >= ceiling;
}
