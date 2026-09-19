import type { Confidence } from "../contracts/confidence.js";
import type { Milliseconds } from "./time.js";

/**
 * Supplier is the answer to "if this requirement's evidence is missing,
 * who or what could supply it?" — the taxonomy ADR 0001 uses to keep
 * `ask`/`defer`/`escalate` from collapsing into one "not yet" bucket,
 * pulled one layer earlier so it can be *stated on the requirement itself*
 * rather than invented after the fact by whatever code discovers the gap.
 *
 * This is deliberately the same three-way split as
 * lib/contracts/decision.ts's `MissingFact` / `MissingTime` /
 * `MissingJudgment`, and deliberately carries just enough data to build
 * one of those three directly from a Gap (see gap.ts and M4's future
 * mapping):
 *
 * - `counterparty` — `party` is who to ask; the Gap (below) supplies the
 *   *specific fact* text from the Requirement's own `description`, giving
 *   M4 everything `MissingFact` needs (`fact`, `counterparty`) with no
 *   guessing.
 * - `time`        — `waitingOn` names what the clock is waiting for. M4
 *   still owns *when* to reconsider (that's a scheduling policy, not a
 *   fact about the requirement), so `reconsiderAt` is not modelled here.
 * - `human`        — `reason` is why no confidence number would suffice,
 *   ready to hand to `MissingJudgment.reason` unchanged.
 *
 * There is no fourth "nobody" / `refuse` supplier here on purpose: `refuse`
 * in ADR 0001 is categorical and independent of what's missing — it is not
 * the product of a gap in evidence at all, so it has no place in a
 * taxonomy of "who could supply the missing thing." A `refuse` decision is
 * M4's job to produce directly from policy, never from gap analysis.
 */
export type Supplier =
  | { readonly kind: "counterparty"; readonly party: string }
  | { readonly kind: "time"; readonly waitingOn: string }
  | { readonly kind: "human"; readonly reason: string };

/**
 * What a decision needs, stated once, independent of whether it is
 * currently available. Comparing a set of these against a set of
 * available Signals is `analyzeGaps` (gap.ts) — a Requirement carries no
 * logic of its own, only the terms of what "satisfied" means for this one
 * piece of evidence:
 *
 * - `signalKind`     — which Signal.kind would satisfy this (matched by
 *   exact string equality; see gap.ts).
 * - `description`    — the specific thing this requirement is about, e.g.
 *   "the customer's order number", stated once here so it can flow
 *   straight into `MissingFact.fact` / `MissingTime.waitingOn` without a
 *   second, possibly-drifting copy living in decision logic.
 * - `minConfidence`  — the confidence bar a candidate signal's OWN
 *   confidence must clear to count as satisfying this requirement. Not
 *   `requiredConfidence` from lib/cost-model — that function computes the
 *   bar an outcome's overall confidence must clear (reversibility x cost);
 *   this is a narrower, per-*piece-of-evidence* bar ("is this one fact
 *   trustworthy enough to use at all"), stated by whoever defines the
 *   requirement, not derived from the cost model.
 * - `maxAge`         — how fresh a candidate signal must be, stated here
 *   rather than as a global default (see time.ts: staleness is relative
 *   per Signal.kind, and this is where that per-kind statement actually
 *   lives — a `customer.reported-urgency` requirement and a
 *   `customer.verified-identity` requirement for the same decision can
 *   demand very different freshness).
 * - `supplier`       — who/what could supply this if it's absent.
 */
export interface Requirement {
  readonly signalKind: string;
  readonly description: string;
  readonly minConfidence: Confidence;
  readonly maxAge: Milliseconds;
  readonly supplier: Supplier;
}
