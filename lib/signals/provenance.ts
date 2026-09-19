/**
 * Provenance answers "how do you know that?" for a single Signal. It is a
 * discriminated union, not a bare `source: string`, for the same reason
 * Decision is a discriminated union in lib/contracts: the *kind* of source
 * changes what other information is meaningful to demand alongside it.
 *
 * Four kinds, each naming who or what actually produced the assertion:
 *
 * - `counterparty` — the party making the request stated this themselves.
 *   Least trustworthy on its own (it's exactly the kind of claim a
 *   decision must not treat as free evidence), but it's still provenance,
 *   not "vibes" — it says plainly that nobody but the requester vouches
 *   for it, which is itself decision-relevant.
 * - `system`       — an internal system of record computed or looked this
 *   up (a database, a rules engine, a third-party API this project
 *   integrates with).
 * - `human`        — a person (an ops reviewer, a support agent) asserted
 *   this directly, outside the automated pipeline.
 * - `derived`      — this signal's value was computed FROM other signals,
 *   not observed directly. This is the one that needs more than "a
 *   source": an audit trail (M5) that finds a `derived` signal and cannot
 *   see what it was derived from has hit a dead end — it can name the
 *   rule that ran, but not check the rule's own inputs, which is exactly
 *   the auditability this project is being built to provide. So `inputs`
 *   (the ids of the signals the derivation actually read) is a *required*
 *   field of this variant specifically, not an optional add-on: a
 *   `derived` provenance without inputs is a compile error, the same
 *   discipline lib/contracts uses for `AskDecision.missing.fact` etc.
 *   `rule` names *how* the derivation was computed, so a reader gets both
 *   "computed by what" and "computed from what" — one without the other
 *   is only half an answer to "how do you know that?".
 *
 * Deliberately NOT included: a generic `metadata`/`extra` bag on any
 * variant. Provenance is meant to be walked and reasoned about
 * mechanically (by gap analysis, and later by the M5 audit trail) — an
 * open-ended bag invites exactly the kind of untyped, unstructured
 * "context" the brief's "vibes" complaint is about. A domain (M6) that
 * needs more should extend the union with its own named variant, not
 * smuggle detail through an untyped field on every variant.
 */
export type Provenance =
  | { readonly kind: "counterparty"; readonly party: string }
  | { readonly kind: "system"; readonly system: string }
  | { readonly kind: "human"; readonly who: string }
  | { readonly kind: "derived"; readonly rule: string; readonly inputs: readonly string[] };

export const PROVENANCE_KINDS = ["counterparty", "system", "human", "derived"] as const;

export interface InvalidProvenance {
  readonly kind: "not-an-object" | "unknown-provenance-kind" | "invalid-field";
  readonly received?: unknown;
  readonly field?: string;
}
