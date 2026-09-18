import type { Action } from "./action.js";
import type { Confidence } from "./confidence.js";

/**
 * Missing information is a first-class, named value — never an absent
 * field, a `null`, or a silent fallback (context-graph.json invariant
 * `missing-information-is-named-never-implied`). The three shapes below
 * correspond exactly to the three outcomes in ADR 0001 that are *about*
 * something missing, and each shape names both *what* is missing and *who
 * or what* can supply it:
 *
 * - MissingFact      — a fact only the counterparty holds (`ask`).
 * - MissingTime      — nothing to ask anyone; the answer may resolve on its
 *                       own and waiting is what's missing (`defer`).
 * - MissingJudgment  — not missing evidence at all; missing the ownership
 *                       that only a human can hold for a call this costly
 *                       (`escalate`).
 *
 * `execute` and `refuse` do not get a `missing` field: execute means
 * nothing decision-relevant is missing, and refuse means the outcome
 * doesn't depend on what's missing or supplied at all (ADR 0001).
 */
export interface MissingFact {
  readonly kind: "fact";
  /** The one specific fact that would let this clear the bar. Not a vague "more info needed". */
  readonly fact: string;
  /** Who holds that fact and is being asked to supply it. */
  readonly counterparty: string;
}

export interface MissingTime {
  readonly kind: "time";
  /** What has to happen (or elapse) before this is worth re-deciding. */
  readonly waitingOn: string;
  /** When to reconsider — an ISO-8601 instant, or a description if the trigger isn't clock-based (e.g. "when the price settles"). */
  readonly reconsiderAt: string;
}

export interface MissingJudgment {
  readonly kind: "human-judgment";
  /** Why no confidence number, however high, would have been enough — this is not "we weren't sure", it's "confidence was never the blocker". */
  readonly reason: string;
}

export type MissingInformation = MissingFact | MissingTime | MissingJudgment;

/**
 * The five outcomes, as a discriminated union on `outcome`. They are not
 * five points on a severity scale — see ADR 0001 (.genesis/decisions/0001-
 * five-outcome-model.md) for the full reasoning. Each variant's *required*
 * fields are how this project encodes "an ask without a named fact... does
 * not compile" (per the milestone brief) — TypeScript's structural typing
 * means a variant literal that omits a required field is a compile error,
 * not a runtime surprise. See lib/contracts/__tests__/decision-shape.test.ts
 * for the documented @ts-expect-error proofs.
 */

export interface ExecuteDecision {
  readonly outcome: "execute";
  readonly action: Action;
  /** The confidence actually reached, from the signals read (M3/M4 territory — M1 just carries the number). */
  readonly confidence: Confidence;
  /** The bar this had to clear: requiredConfidence(action.reversibility, action.costOfBeingWrong). Carried explicitly so a reader never has to recompute or trust a bare "it passed". */
  readonly confidenceBar: Confidence;
}

export interface AskDecision {
  readonly outcome: "ask";
  readonly action: Action;
  readonly missing: MissingFact;
}

export interface DeferDecision {
  readonly outcome: "defer";
  readonly action: Action;
  readonly missing: MissingTime;
}

export interface EscalateDecision {
  readonly outcome: "escalate";
  readonly action: Action;
  readonly missing: MissingJudgment;
}

export interface RefuseDecision {
  readonly outcome: "refuse";
  readonly action: Action;
  /** Why this action should not happen, independent of who asks or how certain anyone is. */
  readonly reason: string;
}

export type Decision =
  | ExecuteDecision
  | AskDecision
  | DeferDecision
  | EscalateDecision
  | RefuseDecision;

/**
 * Note for M4/M5, so extension doesn't have to fight this shape: Decision is
 * intentionally *not* pre-loaded with audit fields (id, recordedAt, the
 * signals read, the rule that fired). The audit trail (M5) is a wrapper
 * around a Decision — e.g. `AuditedDecision = Decision & { id: string;
 * recordedAt: string; signals: readonly Signal[]; rule: string }` — rather
 * than fields Decision carries for everyone whether or not they're being
 * audited. That keeps "what was decided" (this file) separate from "how do
 * we know, and can we reproduce it" (M5), which is exactly the seam
 * context-graph.json's `no-unreplayable-decision` and `no-outcome-without-
 * signals` invariants are drawn along.
 */

/** Exhaustiveness helper for `switch (decision.outcome)` — never called at runtime, only used so an unhandled outcome variant is a compile error at the default/else branch. */
export function assertNeverOutcome(value: never): never {
  throw new Error(`Unreachable: unhandled Decision outcome ${JSON.stringify(value)}`);
}
