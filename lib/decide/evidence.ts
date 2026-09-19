import type { Action } from "../contracts/action.js";
import type { Confidence } from "../contracts/confidence.js";
import type {
  AskDecision,
  DeferDecision,
  EscalateDecision,
  ExecuteDecision,
  MissingFact,
  MissingJudgment,
  MissingTime,
  RefuseDecision,
} from "../contracts/decision.js";
import type { Signal } from "../signals/signal.js";

/**
 * INVARIANT `no-outcome-without-signals`, enforced structurally.
 *
 * `lib/contracts/decision.ts` is frozen for this milestone and its
 * `Decision` union deliberately does NOT carry an evidence field itself —
 * that file's own note says the audit trail (M5) is meant to wrap a
 * `Decision` with `{ signals, rule, id, recordedAt }` rather than have
 * every outcome carry those fields for everyone. But context-graph.json is
 * explicit that `no-outcome-without-signals` is one of the four invariants
 * that apply STARTING at M4, not deferred to M5 — so M4 introduces its own
 * (smaller) wrapper, local to `lib/decide/`, that M5 can later extend
 * rather than duplicate: `EvidencedDecision = Decision & { evidence }`.
 *
 * The "impossible to construct without its evidence" guarantee is not the
 * wrapper type alone — a type is only as strong as its constructors. So
 * this module exports the ONLY functions `decide.ts` uses to build a
 * `Decision`; every one of them takes `evidence` as a required, positional
 * parameter with no default. `decide.ts` never writes an outcome object
 * literal itself (verified by `__tests__/no-outcome-without-signals.test.ts`,
 * which greps `decide.ts` for the literal pattern `outcome:` and asserts it
 * never appears there — only in this file). That means the only way to
 * produce a `Decision` inside this package is to go through a function
 * that cannot compile without an `evidence` argument, which is exactly
 * "structurally impossible to construct an outcome without its evidence" —
 * mechanical, not aspirational, the same discipline lib/contracts itself
 * uses for e.g. `AskDecision.missing.fact`.
 */
export type EvidencedDecision =
  | (ExecuteDecision & { readonly evidence: readonly Signal[] })
  | (AskDecision & { readonly evidence: readonly Signal[] })
  | (DeferDecision & { readonly evidence: readonly Signal[] })
  | (EscalateDecision & { readonly evidence: readonly Signal[] })
  | (RefuseDecision & { readonly evidence: readonly Signal[] });

export function toExecuteDecision(
  action: Action,
  confidence: Confidence,
  confidenceBar: Confidence,
  evidence: readonly Signal[],
): EvidencedDecision {
  return { outcome: "execute", action, confidence, confidenceBar, evidence };
}

export function toAskDecision(
  action: Action,
  missing: MissingFact,
  evidence: readonly Signal[],
): EvidencedDecision {
  return { outcome: "ask", action, missing, evidence };
}

export function toDeferDecision(
  action: Action,
  missing: MissingTime,
  evidence: readonly Signal[],
): EvidencedDecision {
  return { outcome: "defer", action, missing, evidence };
}

export function toEscalateDecision(
  action: Action,
  missing: MissingJudgment,
  evidence: readonly Signal[],
): EvidencedDecision {
  return { outcome: "escalate", action, missing, evidence };
}

export function toRefuseDecision(
  action: Action,
  reason: string,
  evidence: readonly Signal[],
): EvidencedDecision {
  return { outcome: "refuse", action, reason, evidence };
}
