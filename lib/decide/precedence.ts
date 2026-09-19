import type { Gap } from "../signals/gap.js";
import type { Supplier } from "../signals/requirement.js";

/**
 * DECISION 1 — precedence among simultaneous gaps.
 *
 * Several requirements can be unmet at once, with different suppliers, but
 * `decide()` must produce exactly one outcome. The rule adopted here:
 *
 *     human > counterparty > time
 *
 * Reasoning: if a **human** must judge something, that dominates — no
 * counterparty answer and no elapsed time removes the need for a human's
 * sign-off once one is required, so a `human`-supplier gap always wins
 * regardless of what else is also missing. Between **counterparty** and
 * **time**: the counterparty can act *now* (answering a question is
 * something a party can do on demand), while time cannot be hurried by
 * asking harder or asking someone else — so surfacing the fact that CAN be
 * resolved immediately (ask) takes priority over the fact that can only be
 * resolved by waiting (defer). Asking beats waiting because asking is the
 * more actionable of the two "not yet" outcomes: it gives the counterparty
 * something to do right now, whereas defer gives nobody anything to do.
 *
 * A reader could disagree with the counterparty-over-time half of this (one
 * could argue that if *both* a fact and time are missing, and the time
 * component will resolve on its own regardless of the answer, waiting is
 * "free" and asking is the unnecessary step) — but this project takes the
 * position that surfacing the actionable gap first is more valuable than
 * optimizing for which gap resolves with less effort, because an `ask` that
 * turns out to be unnecessary costs one exchange, while a `defer` that
 * turns out to still need a fact afterward costs a full wait *plus* the same
 * exchange later.
 *
 * Ties within the same supplier kind (e.g. two independent `counterparty`
 * gaps) are broken by first occurrence in `gaps` — decide() always calls
 * `analyzeGaps` with the same `requirements` array in the same order for
 * the same input, so this keeps `selectWinningGap` a pure, deterministic
 * function of its argument (no-unreplayable-decision) without inventing a
 * second sort key (e.g. alphabetical by description) that the six
 * decisions above never asked for.
 *
 * DECISION 7 (`.genesis/decisions/0004-value-constraints.md`) — where a
 * `"constraint-violated"` Gap (lib/signals/gap.ts) ranks. It has no
 * `supplier` at all (the taxonomy above answers "who could supply the
 * missing thing", and nothing is missing for this Gap reason — the
 * evidence is present and says no), so it cannot be compared using
 * `SUPPLIER_PRECEDENCE` the way the other three reasons are. It is given
 * the HIGHEST precedence of all four — ahead of even `human` — because it
 * is qualitatively more decisive than any "not yet" gap: a missing fact,
 * elapsed time, or a pending human judgment all describe evidence that
 * COULD still turn out fine once supplied; a value rejection is evidence
 * that has ALREADY arrived and already says no. Resolving every other
 * simultaneous gap does not change that answer, so it should not be
 * outranked by one that might.
 */
const SUPPLIER_PRECEDENCE: Readonly<Record<Supplier["kind"], number>> = {
  human: 0,
  counterparty: 1,
  time: 2,
};

/** Lower is higher-precedence. Exported so tests can assert the ordering directly rather than re-deriving it from behavior alone. */
export function precedenceRank(kind: Supplier["kind"]): number {
  return SUPPLIER_PRECEDENCE[kind];
}

/**
 * Full precedence rank across ALL Gap reasons, including
 * `"constraint-violated"` (see DECISION 7 above) — `-1`, strictly ahead of
 * `precedenceRank("human")`'s `0`. Every other reason defers to
 * `precedenceRank(gap.supplier.kind)` unchanged, so this is a superset of
 * the existing ordering, not a replacement for it; `precedenceRank` itself
 * is untouched and still exported for the 3-way supplier ordering alone.
 */
export function gapPrecedenceRank(gap: Gap): number {
  if (gap.reason === "constraint-violated") return -1;
  return precedenceRank(gap.supplier.kind);
}

/**
 * Picks the single Gap that governs the outcome, per the precedence rule
 * above. Returns `null` only when `gaps` is empty (nothing to resolve is a
 * separate case decide() handles itself — see decide.ts's confidence path).
 */
export function selectWinningGap(gaps: readonly Gap[]): Gap | null {
  if (gaps.length === 0) return null;
  return gaps.reduce((best, candidate) =>
    gapPrecedenceRank(candidate) < gapPrecedenceRank(best) ? candidate : best,
  );
}
