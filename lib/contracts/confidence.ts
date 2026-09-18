/**
 * Confidence is a probability, not an arbitrary number — it is meaningful
 * only in [0, 1]. Branding it (like CostOfBeingWrong in lib/cost-model)
 * means a raw number can't be handed to an `execute` decision as its
 * confidence without first passing through parseConfidence, which is where
 * the 0..1 boundary is actually enforced.
 */
declare const confidenceBrand: unique symbol;
export type Confidence = number & { readonly [confidenceBrand]: "Confidence" };

export interface InvalidConfidence {
  readonly kind: "confidence-out-of-range" | "confidence-not-finite";
  readonly received: unknown;
}

export function parseConfidence(
  value: number,
): { readonly ok: true; readonly value: Confidence } | { readonly ok: false; readonly error: InvalidConfidence } {
  if (!Number.isFinite(value)) {
    return { ok: false, error: { kind: "confidence-not-finite", received: value } };
  }
  if (value < 0 || value > 1) {
    return { ok: false, error: { kind: "confidence-out-of-range", received: value } };
  }
  return { ok: true, value: value as Confidence };
}
