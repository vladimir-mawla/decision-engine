import type { Confidence } from "../contracts/confidence.js";
import type { Requirement } from "../signals/requirement.js";
import type { Satisfaction } from "./satisfaction.js";

/**
 * Human-readable `MissingJudgment.reason` text for every escalate cause
 * `decide()` can produce. `MissingJudgment` (lib/contracts/decision.ts) is
 * frozen for this milestone and has a single `reason: string` field — no
 * `kind` discriminant to tell the causes apart mechanically — so the prose
 * itself is what a reader (or a future M7 failure-suite assertion) checks
 * against. Centralizing the wording here means the two situations
 * DECISION 3 must distinguish ("stop trying" vs. "a human decides today")
 * are worded once, consistently, rather than inline at each call site in
 * decide.ts risking drift between them.
 */

/** DECISION 3a — a `human`-supplier requirement is unmet. The Gap's own Supplier already carries the reason verbatim (requirement.ts: "ready to hand to MissingJudgment.reason unchanged") — no rewording needed or wanted. */
export function humanGapReason(reason: string): string {
  return reason;
}

/** DECISION 6 — the winning gap's only candidate evidence is dated after decide()'s own clock. */
export function clockInconsistencyReason(requirement: Requirement): string {
  return (
    `A candidate signal for "${requirement.signalKind}" is dated after this decision's own clock ` +
    `(a clock inconsistency, not ordinary staleness) — its age cannot be computed, so no honest ` +
    `reconsiderAt could be derived and this cannot be deferred. This is not a confidence problem: ` +
    `it needs a human to establish why evidence for "${requirement.description}" claims to be from ` +
    `the future before any automated reasoning about it can proceed.`
  );
}

/**
 * DECISION 3b — the required confidence bar has already saturated at this
 * reversibility level's worst-case ceiling (see stakes.ts's
 * `isBarSaturated`).
 *
 * FIX 2 (M4 independent verification) renamed this from the original
 * `unreachableBarReason` and rewrote its text. The original wording said
 * the bar was "unreachable by evidence alone" and that "ownership of this
 * call moves to a human permanently" — and the verification's sweep
 * showed that reading fires from as little as ~$1,800 on the most
 * forgiving reversibility tier, which makes "permanently" sound far more
 * dramatic than what is actually true. It never WAS literally true:
 * `Confidence` is capped at 1.0 (lib/contracts/confidence.ts) and every
 * `requiredConfidence` bar is capped below that at 0.99
 * (requiredConfidence.ts's "why the bar never hits 1.0"), so under
 * min-aggregation a single signal reporting confidence 1.0 always clears
 * any bar this model can produce — nothing is EVER truly unreachable by
 * evidence. What `isBarSaturated` actually, honestly detects is narrower:
 * this reversibility level's bar has hit ITS OWN ceiling, so a bigger
 * stated cost-of-being-wrong cannot push the bar any higher than it
 * already is. That is a true and useful fact — it tells a reader "don't
 * bother re-arguing the stakes, the model already assumes the worst" — but
 * it is a different claim from "no evidence could ever clear this", and
 * conflating the two was the bug. This text now says only the part that is
 * true.
 */
export function costCeilingReason(limiting: Satisfaction, bar: Confidence): string {
  return (
    `Every requirement is met, but aggregate confidence (${limiting.confidence.toFixed(4)}, limited by ` +
    `"${limiting.requirement.signalKind}") does not clear the required bar (${bar.toFixed(4)}). That bar has ` +
    `already reached this action's reversibility level's ceiling — requiredConfidence(reversibility, cost) ` +
    `has saturated, so a larger stated cost-of-being-wrong would not raise the bar any further; the stakes, ` +
    `not the evidence, have hit the model's maximum for this reversibility level. This is NOT a claim that no ` +
    `confidence value could ever clear the bar — a signal reporting confidence 1.0 always would, since the bar ` +
    `is capped below 1.0 by design — so better or stronger evidence for "${limiting.requirement.description}" ` +
    `could still, in principle, clear it later. What will not change it is arguing the cost is higher than ` +
    `stated: that lever has already been pushed as far as this model lets it go. A human decides this one.`
  );
}

/** DECISION 3c — the bar has real headroom left (has not hit this reversibility level's ceiling); this specific evidence just doesn't clear it today. "A human decides today." */
export function insufficientNowReason(limiting: Satisfaction, bar: Confidence): string {
  return (
    `Every requirement is met, but aggregate confidence (${limiting.confidence.toFixed(4)}, limited by ` +
    `"${limiting.requirement.signalKind}") does not clear the required bar (${bar.toFixed(4)}) for this ` +
    `action's stakes. The bar itself still has headroom — it has not reached this reversibility level's ` +
    `ceiling — so this is not a structurally impossible ask: better or additional evidence for ` +
    `"${limiting.requirement.description}" could clear it later. A human decides today with what is ` +
    `available now.`
  );
}

/** Edge case beyond the six headline decisions: an action with no stated evidence requirements at all. Fails closed to escalate rather than silently executing on zero evidence. */
export function noRequirementsReason(): string {
  return (
    "This action declares no evidence requirements at all, so no confidence claim can be assessed " +
    "against any bar — there is nothing to aggregate and nothing to name as limiting. Executing with " +
    "no stated evidence would be the fail-open default this project rejects; a human must decide " +
    "whether this action needs requirements defined before it can run autonomously."
  );
}

/**
 * FIX 1 (M4 independent verification) — decide()'s newest case: `input`
 * itself (not one of its fields) could not be read at all — missing,
 * `null`/`undefined`, or a hostile object whose `action` getter throws.
 * There is no `Action` to attach to a `Decision` (every one of the five
 * outcomes requires one), so this is deliberately worded as "nothing was
 * evaluated" rather than as any judgment about an action, because no
 * action was ever actually obtained.
 */
export function unusableInputReason(): string {
  return (
    "decide() was given something it could not evaluate at all — the input was missing, or its " +
    "`action` field could not be read without throwing. This is not a decision about any action " +
    "(there is no action to name, so no confidence bar, prohibition, or gap analysis could even " +
    "begin): a human must inspect what was actually passed to decide() directly — likely an " +
    "upstream parse failure or a malformed replayed record, not something this engine can reason " +
    "about."
  );
}

/** Last-resort fail-closed reason for decide()'s outermost guard (an unexpected exception from a hostile or malformed Action/Requirement/Signal/Prohibition) and for internal states that should be structurally unreachable but are still handled rather than assumed away. */
export function internalErrorReason(): string {
  return (
    "This decision could not be evaluated safely — an unexpected error occurred while reading the " +
    "action, its requirements, or its signals. Failing closed rather than guessing: a human must " +
    "review this action directly."
  );
}

/** Defensive fail-closed case: analyzeGaps reported zero Gaps for a requirement that findSatisfaction (this module's own mirror of that logic) cannot independently confirm as satisfied — an internal inconsistency, not a normal outcome. */
export function internalInconsistencyReason(requirement: Requirement): string {
  return (
    `Internal inconsistency: no Gap was reported for "${requirement.signalKind}", but this decision's ` +
    `own evidence-matching could not independently confirm a satisfying signal for it. Failing closed to ` +
    `escalate rather than trusting either side of the disagreement — a human should investigate why gap ` +
    `analysis and confidence aggregation disagree.`
  );
}
