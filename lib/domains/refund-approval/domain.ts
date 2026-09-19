import type { Action } from "../../contracts/action.js";
import type { Prohibition } from "../../decide/prohibition.js";
import type { Requirement } from "../../signals/requirement.js";
import { createSignal, type Signal } from "../../signals/signal.js";
import type { Domain, DomainCase } from "../types.js";
import { before, DEMO_NOW, HOURS, DAYS, mustCapturedAt, mustConfidence, mustCost, mustMs } from "../shared/fixtures.js";

/**
 * REFUND APPROVAL — a payments-support domain.
 *
 * Decides: whether to approve a customer's refund request against an
 * order, given a fraud assessment, the order's own eligibility under
 * policy, the customer's dispute history, and (for cross-border orders) a
 * compliance sign-off.
 *
 * REVERSIBILITY ARGUMENT (applies to every case in this file): a refund is
 * "reversible-with-cost," never "reversible-no-trace" and never
 * "irreversible." Once approved, the money actually moves — clawing it
 * back means re-charging the customer's original payment instrument, which
 * can fail outright (an expired card, insufficient funds, a closed
 * account) and, even when it succeeds, costs a real support/collections
 * cycle and spends some of the relationship with a customer who was just
 * told "actually, no." That is a genuine, bounded cost to undo — not free
 * (no trace), and not permanent (there is always a lever: re-charge,
 * collections, write-off) — which is exactly what "reversible-with-cost"
 * names. This is also `lib/cost-model/cost.ts`'s own worked example: "a
 * wrongly-approved $5 refund costs about $5, bounded by the money that
 * moved." Every `costOfBeingWrong` below is therefore anchored to the
 * refund amount itself (read from `parameters`, never from a face-value
 * field on `Action` — there isn't one) — the one domain in this file where
 * "cost of being wrong" and "the action's face value" legitimately
 * coincide, which is itself worth stating plainly rather than leaving a
 * reader to wonder why refund-approval doesn't also demonstrate the
 * face-value/cost split the way code-deploy does.
 *
 * COVERAGE THIS DOMAIN CONTRIBUTES: execute, ask, defer, escalate (value-
 * rejected — the ADR 0004 headline fraud CLEAN/FRAUDULENT example — AND
 * human-gap AND cost-ceiling), refuse; the `equals` and `lte` constraint
 * operators; the one "history narrows rather than grants" case
 * (R7 — a customer's chargeback history disqualifies an otherwise-clean
 * request; a GOOD history never independently grants anything, it is only
 * ever checked as an exclusion).
 */

interface RefundParameters {
  readonly ticketId: string;
  readonly customerId: string;
  readonly orderId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly reasonCode: string;
  readonly channel: string;
  readonly crossBorder?: boolean;
  readonly accountFrozen?: boolean;
  // See DeployParameters's identical index signature in
  // lib/domains/code-deploy/domain.ts for why this is required.
  readonly [key: string]: unknown;
}

interface RefundInputParameters {
  readonly ticketId: string;
  readonly customerId: string;
  readonly orderId: string;
  readonly currency: string;
  readonly reasonCode: string;
  readonly channel: string;
  readonly crossBorder?: boolean;
  readonly accountFrozen?: boolean;
}

// Deliberately not `Omit<RefundParameters, "amountCents">`: `RefundParameters`
// carries a string index signature (needed so it structurally satisfies
// `Action["parameters"]`'s default type below), and `Omit` on an indexed
// type collapses back to `{ [x: string]: unknown }`, silently discarding
// every named field it was supposed to keep. A small, separately-written
// input type avoids that trap.
function refundAction(
  amountUsd: number,
  parameters: RefundInputParameters,
): Action<RefundParameters> {
  return {
    domain: "refund-approval",
    type: "refund.approve",
    parameters: { ...parameters, amountCents: Math.round(amountUsd * 100) },
    costOfBeingWrong: mustCost(amountUsd),
    reversibility: "reversible-with-cost",
  };
}

const fraudAssessmentRequirement = (overrides: { readonly minConfidence?: number } = {}): Requirement => ({
  signalKind: "customer.fraudAssessment",
  description: "the fraud engine's assessment of this customer/order pair",
  minConfidence: mustConfidence(overrides.minConfidence ?? 0.5),
  maxAge: mustMs(6 * HOURS),
  // `time`, not `counterparty`: this is a SYSTEM-computed signal (the fraud
  // engine), and if it were ever absent/stale, nobody asks the customer to
  // supply their own fraud score — the honest answer is "wait for the
  // engine to (re)run." None of this file's 8 cases actually leaves this
  // requirement unmet by absence/staleness/low-confidence (every case
  // either satisfies it or fails its `equals` constraint, which carries no
  // `supplier` at all — see gap.ts), so this field is not exercised here;
  // it is still worth getting right rather than leaving a placeholder that
  // would silently mislabel a real gap if a future case ever hit it — see
  // requirement.ts's own HAZARD comment on exactly this mistake.
  supplier: { kind: "time", waitingOn: "the fraud engine to finish assessing this customer/order pair" },
  valueConstraint: { op: "equals", value: "clear" },
});

const policyEligibilityRequirement = (): Requirement => ({
  signalKind: "refund.policy.eligibility",
  description: "whether this order is within the refund policy's eligibility window",
  minConfidence: mustConfidence(0.5),
  maxAge: mustMs(DAYS),
  // `time` for the same reason as fraudAssessmentRequirement above: this is
  // the order-service's own automated eligibility check, not a fact the
  // customer holds.
  supplier: { kind: "time", waitingOn: "the order-service eligibility check to complete" },
  valueConstraint: { op: "equals", value: "eligible" },
});

/**
 * "HISTORY NARROWS RATHER THAN GRANTS" — this requirement's role is
 * purely exclusionary. A customer with a CLEAN chargeback history does not
 * get anything FROM this requirement beyond "not disqualified" — approval
 * still depends entirely on `fraudAssessmentRequirement` and
 * `policyEligibilityRequirement` above. Only a customer whose recent
 * chargeback count exceeds the threshold is affected by this requirement
 * at all, and the effect is strictly negative (a `constraint-violated`
 * Gap, i.e. `escalate`) — never a grant of confidence or a path to
 * `execute` on its own. See case R7 below.
 */
const chargebackHistoryRequirement = (): Requirement => ({
  signalKind: "customer.chargebackHistory.count90d",
  description: "the customer's chargeback count over the trailing 90 days",
  minConfidence: mustConfidence(0.5),
  maxAge: mustMs(DAYS),
  // `time` — this is a payments-ledger lookup, not something to ask the
  // customer for (asking "how many times have you charged back?" is not a
  // fact-gathering question this project would put to the party the
  // decision is about). See fraudAssessmentRequirement's note above.
  supplier: { kind: "time", waitingOn: "the payments-ledger chargeback-history lookup to complete" },
  valueConstraint: { op: "lte", value: 1 },
});

const prohibitions: readonly Prohibition[] = [
  {
    id: "refund-account-frozen",
    reason:
      "This account is frozen for a compliance hold. No refund is issued against a frozen account, " +
      "regardless of how clean the fraud assessment or policy eligibility check looks — the hold itself " +
      "is the reason, not the evidence.",
    matches: (action) => (action.parameters as RefundParameters).accountFrozen === true,
  },
];

function signal(params: {
  readonly id: string;
  readonly kind: string;
  readonly value: unknown;
  readonly source: Parameters<typeof createSignal>[0]["source"];
  readonly hoursAgo: number;
  readonly confidence: number;
}): Signal {
  return createSignal({
    id: params.id,
    kind: params.kind,
    value: params.value,
    source: params.source,
    capturedAt: mustCapturedAt(before(DEMO_NOW, params.hoursAgo * HOURS), DEMO_NOW),
    confidence: mustConfidence(params.confidence),
  });
}

// ── R1 — execute: a clean, ordinary refund. ───────────────────────────────
const r1: DomainCase = {
  id: "refund-r1-clean-approval",
  title: "Duplicate-charge refund, $85.50, clean on every check",
  narrative:
    "Customer support ticket TCK-88213: a customer was charged twice for order ORD-552091 (a checkout " +
    "retry after a timed-out payment page). The fraud engine reads the account as clear, the order is " +
    "inside the policy eligibility window, and the customer has no recent chargebacks.",
  reversibilityRationale:
    "Reversible-with-cost: the $85.50 has actually moved. If this approval turns out to be wrong, " +
    "recovering it means re-charging the customer or writing it off — a real but bounded cost, not free " +
    "and not permanent.",
  action: refundAction(85.5, {
    ticketId: "TCK-88213",
    customerId: "cus_4f8a2b91",
    orderId: "ORD-552091",
    currency: "USD",
    reasonCode: "duplicate-charge",
    channel: "web-checkout",
  }),
  requirements: [fraudAssessmentRequirement(), policyEligibilityRequirement(), chargebackHistoryRequirement()],
  prohibitions,
  signals: [
    signal({ id: "sig-r1-fraud", kind: "customer.fraudAssessment", value: "clear", source: { kind: "system", system: "fraud-engine-v3" }, hoursAgo: 1, confidence: 0.93 }),
    signal({ id: "sig-r1-policy", kind: "refund.policy.eligibility", value: "eligible", source: { kind: "system", system: "order-service" }, hoursAgo: 1, confidence: 0.97 }),
    signal({ id: "sig-r1-cbk", kind: "customer.chargebackHistory.count90d", value: 0, source: { kind: "system", system: "payments-ledger" }, hoursAgo: 2, confidence: 0.9 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "execute" },
};

// ── R2 — ask: the customer needs to confirm which order they mean. ───────
const r2: DomainCase = {
  id: "refund-r2-ask-order-number",
  title: "Duplicate-charge claim with no order number yet",
  narrative:
    "Ticket TCK-88301: the customer emailed support claiming \"I was charged twice last week\" but has not " +
    "yet said which order. Fraud and policy both check out for the account in general; the one thing " +
    "missing is the specific order number the customer is disputing.",
  reversibilityRationale: "Reversible-with-cost — same reasoning as R1; no money has moved yet either way.",
  action: refundAction(60, {
    ticketId: "TCK-88301",
    customerId: "cus_2c710dd4",
    orderId: "unknown",
    currency: "USD",
    reasonCode: "duplicate-charge",
    channel: "email-support",
  }),
  requirements: [
    fraudAssessmentRequirement(),
    policyEligibilityRequirement(),
    {
      signalKind: "customer.orderNumber.confirmed",
      description: "the order number for the charge the customer is disputing as a duplicate",
      minConfidence: mustConfidence(0.5),
      maxAge: mustMs(DAYS),
      supplier: { kind: "counterparty", party: "customer" },
    },
  ],
  prohibitions,
  signals: [
    signal({ id: "sig-r2-fraud", kind: "customer.fraudAssessment", value: "clear", source: { kind: "system", system: "fraud-engine-v3" }, hoursAgo: 1, confidence: 0.9 }),
    signal({ id: "sig-r2-policy", kind: "refund.policy.eligibility", value: "eligible", source: { kind: "system", system: "order-service" }, hoursAgo: 1, confidence: 0.9 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "ask" },
};

// ── R3 — defer: the disputed charge is still settling. ───────────────────
const r3: DomainCase = {
  id: "refund-r3-defer-settlement",
  title: "Refund requested while the original charge is still settling",
  narrative:
    "Ticket TCK-88402: the customer disputes a $42.00 charge on order ORD-559980, but the payment " +
    "processor shows the charge is still in a pending settlement state from an earlier retry. There is " +
    "nothing to ask the customer — the settlement will resolve on its own.",
  reversibilityRationale: "Reversible-with-cost — same reasoning as R1.",
  action: refundAction(42, {
    ticketId: "TCK-88402",
    customerId: "cus_9911aa02",
    orderId: "ORD-559980",
    currency: "USD",
    reasonCode: "not-as-described",
    channel: "web-checkout",
  }),
  requirements: [
    fraudAssessmentRequirement(),
    policyEligibilityRequirement(),
    {
      signalKind: "payment.settlement.status",
      description: "whether the disputed charge has finished settling with the payment processor",
      minConfidence: mustConfidence(0.5),
      maxAge: mustMs(6 * HOURS),
      supplier: { kind: "time", waitingOn: "the disputed charge to finish settling with the payment processor" },
    },
  ],
  prohibitions,
  signals: [
    signal({ id: "sig-r3-fraud", kind: "customer.fraudAssessment", value: "clear", source: { kind: "system", system: "fraud-engine-v3" }, hoursAgo: 1, confidence: 0.91 }),
    signal({ id: "sig-r3-policy", kind: "refund.policy.eligibility", value: "eligible", source: { kind: "system", system: "order-service" }, hoursAgo: 1, confidence: 0.92 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "defer" },
};

// ── R4 — escalate/value-rejected: the ADR 0004 headline example. ─────────
const r4: DomainCase = {
  id: "refund-r4-fraud-flag",
  title: "Fraud engine reads FRAUDULENT, not merely stale or absent",
  narrative:
    "Ticket TCK-88510: a $210.00 refund request on order ORD-561204. The fraud engine's assessment is " +
    "present, fresh, and confident — and it reads \"fraudulent,\" not \"clear.\" This is the exact case " +
    ".genesis/decisions/0004-value-constraints.md was written for: the evidence isn't missing, it " +
    "arrived and said no.",
  reversibilityRationale: "Reversible-with-cost — same reasoning as R1.",
  action: refundAction(210, {
    ticketId: "TCK-88510",
    customerId: "cus_ff0021ab",
    orderId: "ORD-561204",
    currency: "USD",
    reasonCode: "item-not-received",
    channel: "web-checkout",
  }),
  requirements: [fraudAssessmentRequirement(), policyEligibilityRequirement(), chargebackHistoryRequirement()],
  prohibitions,
  signals: [
    signal({ id: "sig-r4-fraud", kind: "customer.fraudAssessment", value: "fraudulent", source: { kind: "system", system: "fraud-engine-v3" }, hoursAgo: 0.5, confidence: 0.9 }),
    signal({ id: "sig-r4-policy", kind: "refund.policy.eligibility", value: "eligible", source: { kind: "system", system: "order-service" }, hoursAgo: 1, confidence: 0.9 }),
    signal({ id: "sig-r4-cbk", kind: "customer.chargebackHistory.count90d", value: 0, source: { kind: "system", system: "payments-ledger" }, hoursAgo: 2, confidence: 0.9 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "escalate", cause: "value-rejected" },
};

// ── R5 — escalate/human: cross-border sign-off. ───────────────────────────
const r5: DomainCase = {
  id: "refund-r5-cross-border-signoff",
  title: "Cross-border refund needs a compliance officer, not a confidence score",
  narrative:
    "Ticket TCK-88622: a $640.00 refund on a cross-border order (customer billed in USD, merchant of " +
    "record in a different jurisdiction). Fraud and policy both check out, but this project's compliance " +
    "policy requires a human sign-off on cross-border reversals above $500 — no automated signal " +
    "establishes regulatory equivalence across jurisdictions.",
  reversibilityRationale: "Reversible-with-cost — same reasoning as R1.",
  action: refundAction(640, {
    ticketId: "TCK-88622",
    customerId: "cus_77bb1203",
    orderId: "ORD-563390",
    currency: "USD",
    reasonCode: "duplicate-charge",
    channel: "web-checkout",
    crossBorder: true,
  }),
  requirements: [
    fraudAssessmentRequirement(),
    policyEligibilityRequirement(),
    chargebackHistoryRequirement(),
    {
      signalKind: "compliance.crossBorderReview.signoff",
      description: "a compliance officer's sign-off on this cross-border reversal",
      minConfidence: mustConfidence(0.5),
      maxAge: mustMs(DAYS),
      supplier: {
        kind: "human",
        reason:
          "Cross-border refunds above $500 require a compliance officer's sign-off; no automated signal " +
          "can establish regulatory equivalence between jurisdictions for a cross-border reversal.",
      },
    },
  ],
  prohibitions,
  signals: [
    signal({ id: "sig-r5-fraud", kind: "customer.fraudAssessment", value: "clear", source: { kind: "system", system: "fraud-engine-v3" }, hoursAgo: 1, confidence: 0.9 }),
    signal({ id: "sig-r5-policy", kind: "refund.policy.eligibility", value: "eligible", source: { kind: "system", system: "order-service" }, hoursAgo: 1, confidence: 0.92 }),
    signal({ id: "sig-r5-cbk", kind: "customer.chargebackHistory.count90d", value: 0, source: { kind: "system", system: "payments-ledger" }, hoursAgo: 2, confidence: 0.9 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "escalate", cause: "human" },
};

// ── R6 — refuse: frozen account, evidence is irrelevant. ──────────────────
const r6: DomainCase = {
  id: "refund-r6-frozen-account",
  title: "Same clean evidence as R1 — refused anyway, because the account is frozen",
  narrative:
    "Ticket TCK-88701: evidence-wise, this looks exactly like R1 — clean fraud check, eligible order, no " +
    "chargeback history. The difference: this account is frozen under an active compliance hold. " +
    "`refuse` is categorical — it does not matter that the evidence would otherwise have cleared the bar.",
  reversibilityRationale: "Reversible-with-cost — same reasoning as R1 (irrelevant to the outcome here, since a prohibition never reaches the evidence at all).",
  action: refundAction(85.5, {
    ticketId: "TCK-88701",
    customerId: "cus_4f8a2b91",
    orderId: "ORD-552091",
    currency: "USD",
    reasonCode: "duplicate-charge",
    channel: "web-checkout",
    accountFrozen: true,
  }),
  requirements: [fraudAssessmentRequirement(), policyEligibilityRequirement(), chargebackHistoryRequirement()],
  prohibitions,
  signals: [
    signal({ id: "sig-r6-fraud", kind: "customer.fraudAssessment", value: "clear", source: { kind: "system", system: "fraud-engine-v3" }, hoursAgo: 1, confidence: 0.93 }),
    signal({ id: "sig-r6-policy", kind: "refund.policy.eligibility", value: "eligible", source: { kind: "system", system: "order-service" }, hoursAgo: 1, confidence: 0.97 }),
    signal({ id: "sig-r6-cbk", kind: "customer.chargebackHistory.count90d", value: 0, source: { kind: "system", system: "payments-ledger" }, hoursAgo: 2, confidence: 0.9 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "refuse" },
};

// ── R7 — HARD, escalate/value-rejected: history narrows, doesn't grant. ──
const r7: DomainCase = {
  id: "refund-r7-chargeback-history",
  title: "HARD CASE — everything looks clean except a history the customer didn't mention",
  narrative:
    "Ticket TCK-88790: a $95.00 refund request. Fraud reads clear, the order is eligible — a reviewer " +
    "skimming just those two signals would approve on the spot. But the customer has filed 2 chargebacks " +
    "in the trailing 90 days, over the lte-1 threshold this policy sets. The good signals never GRANTED " +
    "approval by themselves; the history check is purely exclusionary, and it disqualifies this request.",
  reversibilityRationale: "Reversible-with-cost — same reasoning as R1.",
  action: refundAction(95, {
    ticketId: "TCK-88790",
    customerId: "cus_66ee9910",
    orderId: "ORD-567712",
    currency: "USD",
    reasonCode: "not-as-described",
    channel: "web-checkout",
  }),
  requirements: [fraudAssessmentRequirement(), policyEligibilityRequirement(), chargebackHistoryRequirement()],
  prohibitions,
  signals: [
    signal({ id: "sig-r7-fraud", kind: "customer.fraudAssessment", value: "clear", source: { kind: "system", system: "fraud-engine-v3" }, hoursAgo: 1, confidence: 0.92 }),
    signal({ id: "sig-r7-policy", kind: "refund.policy.eligibility", value: "eligible", source: { kind: "system", system: "order-service" }, hoursAgo: 1, confidence: 0.95 }),
    signal({ id: "sig-r7-cbk", kind: "customer.chargebackHistory.count90d", value: 2, source: { kind: "system", system: "payments-ledger" }, hoursAgo: 2, confidence: 0.9 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "escalate", cause: "value-rejected" },
};

// ── R8 — HARD, escalate/cost-ceiling: a large B2B refund with ambiguous fraud confidence. ──
const r8: DomainCase = {
  id: "refund-r8-large-b2b-refund",
  title: "HARD CASE — $48,000 B2B annual-contract refund, fraud confidence 0.65",
  narrative:
    "Ticket TCK-89012: a corporate customer disputes a $48,000 annual-contract renewal charge. Everything " +
    "the fraud engine can say, it says at 65% confidence — enough to clear this requirement's own " +
    "per-signal bar, but this policy's cost-of-being-wrong bar for a refund this size has already " +
    "saturated at 0.72 for this reversibility level. Arguing the amount is even larger wouldn't move the " +
    "bar further; only stronger evidence would.",
  reversibilityRationale: "Reversible-with-cost — same reasoning as R1; the amount is larger, but the KIND of harm (money moved, recoverable at a cost) is unchanged.",
  action: refundAction(48_000, {
    ticketId: "TCK-89012",
    customerId: "cus_b2b_442190",
    orderId: "ORD-590210",
    currency: "USD",
    reasonCode: "contract-dispute",
    channel: "account-manager",
  }),
  requirements: [fraudAssessmentRequirement(), policyEligibilityRequirement(), chargebackHistoryRequirement()],
  prohibitions,
  signals: [
    signal({ id: "sig-r8-fraud", kind: "customer.fraudAssessment", value: "clear", source: { kind: "system", system: "fraud-engine-v3" }, hoursAgo: 1, confidence: 0.65 }),
    signal({ id: "sig-r8-policy", kind: "refund.policy.eligibility", value: "eligible", source: { kind: "system", system: "order-service" }, hoursAgo: 1, confidence: 0.9 }),
    signal({ id: "sig-r8-cbk", kind: "customer.chargebackHistory.count90d", value: 0, source: { kind: "system", system: "payments-ledger" }, hoursAgo: 2, confidence: 0.85 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "escalate", cause: "cost-ceiling" },
};

export const refundApproval: Domain = {
  name: "refund-approval",
  description:
    "Approves or blocks customer refund requests using a fraud assessment, policy eligibility, and " +
    "chargeback history — a payments-support domain where the cost of being wrong genuinely is close to " +
    "the money that moved.",
  cases: [r1, r2, r3, r4, r5, r6, r7, r8],
};
