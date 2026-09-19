import { requiredConfidence } from "../cost-model/requiredConfidence.js";
import { WORST_CASE_COST } from "../cost-model/cost.js";
import type { Action } from "../contracts/action.js";

/**
 * DECISION 3 (half of it) — telling "the bar has hit this reversibility
 * level's cost ceiling" apart from "the evidence is complete but
 * insufficient right now", both of which are `escalate` (no gaps,
 * aggregate confidence below `requiredConfidence`).
 *
 * CORRECTED BY FIX 2 (M4 independent verification). This function used to
 * be documented, and used by decide.ts, as detecting whether the bar is
 * "unreachable" — with the operational meaning "a human owns this call,
 * permanently, not just today." The verification swept every
 * reversibility level and found this condition first fires at roughly
 * **$1,800** on the most forgiving tier (`reversible-no-trace`) — an
 * ordinary, unremarkable cost, not an extreme one — which made
 * "permanently" read as a dramatic overclaim for a routine case. On
 * inspection the claim was never literally true at ANY cost, for a
 * structural reason: `requiredConfidence` is deliberately capped below
 * 1.0 (see its own "why the bar never hits 1.0" comment) precisely so
 * `execute` is never *mathematically* impossible — under min-aggregation
 * (DECISION 4), a signal reporting Confidence 1.0 always clears any bar
 * `requiredConfidence` can produce. So "unreachable by evidence" and "a
 * human owns this permanently" were both false as stated; nothing in this
 * model is ever truly unreachable.
 *
 * What this function CAN determine honestly, using only
 * `requiredConfidence` itself (invariant 3 — it is the only source of a
 * bar) and its own public `WORST_CASE_COST` sentinel (not a bare numeric
 * literal dreamed up here — a documented, exported constant meant for
 * exactly this kind of "what's the ceiling" question): whether the bar
 * this action's actual (reversibility, cost) demands has already reached
 * the bar that SAME reversibility level would demand at the worst
 * conceivable cost. Because `requiredConfidence` is monotonic
 * non-decreasing in cost and clamped, the curve saturates — past a
 * certain cost, raising it further does not raise the bar at all (see
 * requiredConfidence.ts's own "KNOWN PROPERTY" note on float saturation,
 * which is exactly why the reversible-no-trace tier saturates as low as
 * ~$1,800). If the actual bar has already reached that ceiling, the
 * MODEL'S STAKES have reached their maximum for this reversibility level
 * — a fact about the cost curve, not a claim about what evidence could
 * ever exist. `decide.ts` now words the resulting escalate reason
 * (`reasons.ts`'s `costCeilingReason`) to say exactly that and nothing
 * more: the bar cannot be pushed higher by a bigger stated cost, so a
 * human decides now, but better evidence for the limiting requirement
 * could, in principle, still clear it later. `isBarSaturated` is
 * unchanged in what it computes — only what decide.ts is licensed to
 * conclude from it has been corrected.
 *
 * A reader could disagree with tying this distinction to cost-saturation
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
