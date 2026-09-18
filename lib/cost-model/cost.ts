/**
 * The cost of being wrong is NOT the value of the action.
 *
 * A wrongly-approved $5 refund costs $5 — the loss is bounded by the money
 * that moved. A wrongly-approved $5 deploy can cost an outage — the loss is
 * bounded by what the deploy touches, which has nothing to do with the
 * deploy's own "size". Conflating "how big is this action" with "how bad is
 * it if this action was wrong" is the most likely modelling mistake in this
 * whole milestone: it would make a cheap-looking irreversible action
 * (a one-line config flip that deletes a production table) look safe to the
 * cost model purely because nothing about the action *itself* looked
 * expensive.
 *
 * So `CostOfBeingWrong` is kept as its own nominal type, deliberately not a
 * bare `number`, and deliberately not reachable from anything that also
 * looks like "the action's face value" (this project's `Action` type in
 * lib/contracts has no face-value field at all, precisely so nothing can be
 * tempted to reach for it as a stand-in for cost-of-being-wrong). The brand
 * below means a plain number cannot be assigned where a CostOfBeingWrong is
 * expected without going through parseCostOfBeingWrong — so "I'll just use
 * the transaction amount" fails to compile instead of silently working.
 */
declare const costOfBeingWrongBrand: unique symbol;
export type CostOfBeingWrong = number & {
  readonly [costOfBeingWrongBrand]: "CostOfBeingWrong";
};

export interface InvalidCost {
  readonly kind: "negative-cost" | "non-finite-cost";
  readonly received: unknown;
}

/**
 * Strict boundary constructor. Rejects negative and non-finite (NaN,
 * +/-Infinity) values rather than accepting and silently clamping them —
 * real input arrives as JSON, and a negative or non-finite "cost" is not a
 * cost at all, it's a bug upstream that should surface as a typed error
 * rather than be coerced into something that happens to not crash.
 */
export function parseCostOfBeingWrong(
  value: number,
): { readonly ok: true; readonly value: CostOfBeingWrong } | { readonly ok: false; readonly error: InvalidCost } {
  if (!Number.isFinite(value)) {
    return { ok: false, error: { kind: "non-finite-cost", received: value } };
  }
  if (value < 0) {
    return { ok: false, error: { kind: "negative-cost", received: value } };
  }
  return { ok: true, value: value as CostOfBeingWrong };
}

/**
 * The worst case for this scale. Deliberately finite (a large, documented
 * sentinel) rather than actual Infinity: requiredConfidence's curve already
 * saturates smoothly as cost grows (see requiredConfidence.ts), so a huge
 * finite sentinel produces the same "practically unreachable bar" result as
 * true Infinity would, while staying a valid, finite CostOfBeingWrong that
 * the rest of the system (formatting, serialization, arithmetic) never has
 * to special-case. One billion (dollars-equivalent) is comfortably past the
 * saturation point of every reversibility level's cost scale below.
 */
export const WORST_CASE_COST = 1_000_000_000 as CostOfBeingWrong;

/**
 * Fail-closed total function: never throws. Anything that is not a valid,
 * finite, non-negative number — missing, NaN, a string that failed upstream
 * parsing and was passed through as undefined, a negative number from a
 * broken calculation — resolves to WORST_CASE_COST rather than to 0 (the
 * "best case", where nothing is ever escalated because the cost model was
 * fed a friendly default). See resolveReversibility for the same rule
 * applied to the other axis, and lib/contracts/__tests__/fail-closed.test.ts
 * for the proof that both resolvers actually push the bar up, not down.
 */
export function resolveCostOfBeingWrong(input: unknown): CostOfBeingWrong {
  if (typeof input !== "number") return WORST_CASE_COST;
  const parsed = parseCostOfBeingWrong(input);
  return parsed.ok ? parsed.value : WORST_CASE_COST;
}
