/**
 * Reversibility is not binary. It is a real scale of how hard an action is to
 * undo once it turns out to have been wrong — and "hard to undo" has more
 * shape than "can / can't":
 *
 *   1. reversible-no-trace   — undoing it leaves no residue (a draft saved,
 *                               a value edited before anyone reads it).
 *   2. reversible-with-cost  — undoing it works but spends something real
 *                               (a refund reversed and re-issued, a deploy
 *                               rolled back after a bad minute of traffic).
 *   3. reversible-with-delay — undoing it needs effort AND time before the
 *                               world is back to where it was (a data
 *                               restore from backup, a shipped order recalled).
 *   4. irreversible          — there is no undo (money sent to a third party,
 *                               an email delivered, data destroyed, a message
 *                               published).
 *
 * Four levels, not two and not a continuous number, because the thing that
 * actually varies across real actions is *what kind* of effort reversal
 * takes — free, paid, paid-and-slow, or impossible — and each kind is a
 * qualitatively different risk posture, not a point on a dial. A continuous
 * "reversibility score" would invite exactly the single-scalar collapse the
 * project rejects (see ADR 0001): it can't say *why* two actions at the same
 * score differ, and it tempts someone to compare reversibility scores across
 * unrelated domains as if 0.42 meant the same thing everywhere. Four named,
 * ordered levels can be reasoned about ("is a rollback possible at all,
 * and if so does it cost money, or time, or both") without pretending to a
 * precision nobody has.
 *
 * The order below IS the ordering used by the cost model (index 0 is most
 * forgiving, index 3 is least). Do not reorder this array — requiredConfidence
 * depends on the index, not just the label.
 */
export const REVERSIBILITY_LEVELS = [
  "reversible-no-trace",
  "reversible-with-cost",
  "reversible-with-delay",
  "irreversible",
] as const;

export type Reversibility = (typeof REVERSIBILITY_LEVELS)[number];

/**
 * The worst case on this scale. Used by resolveReversibility (and by
 * anything else that must fail closed) when the real level cannot be
 * determined — never defaulted to the *best* case, which is what a naive
 * "assume it's fine" fallback would do.
 */
export const WORST_CASE_REVERSIBILITY: Reversibility = "irreversible";

/** True narrowing guard — the only place that should ever compare a raw string against the level list. */
export function isReversibility(value: unknown): value is Reversibility {
  return (
    typeof value === "string" &&
    (REVERSIBILITY_LEVELS as readonly string[]).includes(value)
  );
}

/** Position on the scale, 0 (most forgiving) .. 3 (least). Throws only on a value that is already typed as Reversibility, so this never sees untrusted input — untrusted input goes through isReversibility/resolveReversibility first. */
export function reversibilityOrdinal(level: Reversibility): number {
  return REVERSIBILITY_LEVELS.indexOf(level);
}

/**
 * Fail-closed total function: never throws, never returns undefined.
 * Anything that isn't a recognized level — missing, misspelled, a level from
 * some other project's scale, `undefined` because an upstream lookup failed —
 * resolves to the worst case. This is the "reversibility that cannot be
 * determined must be treated as the worst case" rule made concrete and
 * testable in code, independent of the strict JSON-boundary parser (which
 * instead *rejects* bad input outright — see validation.ts). This resolver
 * exists for call sites that must produce *a* Reversibility rather than
 * abort the whole pipeline, and for exactly those call sites, silence about
 * the substitution is not acceptable — callers that care should inspect
 * `isReversibility(input)` themselves before calling this, or use the
 * strict parser instead.
 */
export function resolveReversibility(input: unknown): Reversibility {
  return isReversibility(input) ? input : WORST_CASE_REVERSIBILITY;
}
