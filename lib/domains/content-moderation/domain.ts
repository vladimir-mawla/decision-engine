import type { Action } from "../../contracts/action.js";
import type { Reversibility } from "../../cost-model/reversibility.js";
import type { Prohibition } from "../../decide/prohibition.js";
import type { Requirement } from "../../signals/requirement.js";
import { createSignal, type Signal } from "../../signals/signal.js";
import type { Provenance } from "../../signals/provenance.js";
import type { Domain, DomainCase } from "../types.js";
import { before, DEMO_NOW, HOURS, DAYS, mustCapturedAt, mustConfidence, mustCost, mustMs } from "../shared/fixtures.js";

/**
 * CONTENT MODERATION — a trust-and-safety domain.
 *
 * Decides: whether to act on a reported post or account, given a
 * classifier's category and toxicity reading, the reporting user's own
 * trust score, and (for the most severe or most ambiguous cases) a human
 * policy reviewer or an outright legal-takedown rule.
 *
 * CONTENT IS DELIBERATELY, OBVIOUSLY SYNTHETIC. Every post below is
 * described only by a category label and a numeric score — never by real
 * or realistic abusive text. "moderation.classifier.category = hate-
 * speech-flagged, score 0.81" makes exactly the same point a real quote
 * would for this milestone's purposes (the engine reasons about the
 * evidence's structure, not its prose) without writing anything that reads
 * as genuine harassment or hate speech.
 *
 * COVERAGE THIS DOMAIN CONTRIBUTES: execute, ask, defer, escalate (value-
 * rejected — the `in` operator, this project's own canonical moderation
 * example — AND human-gap AND confidence-bar/insufficient-now), refuse;
 * the `gte` operator on a reporter's trust score; reversibility levels
 * reversible-with-cost, reversible-with-delay, and irreversible.
 */

interface ModerationParameters {
  readonly postId: string;
  readonly authorId: string;
  readonly reporterId: string;
  readonly reportCount: number;
  readonly category: string;
  // See DeployParameters's identical index signature in
  // lib/domains/code-deploy/domain.ts for why this is required.
  readonly [key: string]: unknown;
}

function moderationAction(
  cost: number,
  reversibility: Reversibility,
  type: string,
  parameters: ModerationParameters,
): Action<ModerationParameters> {
  return {
    domain: "content-moderation",
    type,
    parameters,
    costOfBeingWrong: mustCost(cost),
    reversibility,
  };
}

const categoryAllowListRequirement = (): Requirement => ({
  signalKind: "moderation.classifier.category",
  description: "the classifier's category reading for this post",
  minConfidence: mustConfidence(0.5),
  maxAge: mustMs(6 * HOURS),
  supplier: { kind: "time", waitingOn: "the classifier to finish categorizing this post" },
  valueConstraint: { op: "in", values: ["safe", "low-risk"] },
});

const toxicityCeilingRequirement = (): Requirement => ({
  signalKind: "moderation.classifier.toxicityScore",
  description: "the classifier's toxicity score for this post",
  minConfidence: mustConfidence(0.5),
  maxAge: mustMs(6 * HOURS),
  supplier: { kind: "time", waitingOn: "the classifier to finish scoring this post" },
  valueConstraint: { op: "lte", value: 0.3 },
});

const reporterTrustRequirement = (): Requirement => ({
  signalKind: "moderation.reporter.trustScore",
  description: "the reporting user's trusted-flagger credibility score",
  minConfidence: mustConfidence(0.5),
  maxAge: mustMs(DAYS),
  supplier: { kind: "time", waitingOn: "the trust-score lookup for this reporter to complete" },
  valueConstraint: { op: "gte", value: 0.7 },
});

const prohibitions: readonly Prohibition[] = [
  {
    id: "mandatory-legal-takedown",
    reason:
      "Content flagged under a legally mandated removal category is taken down immediately and always " +
      "— no confidence level, reporter trust score, or reviewer judgment overrides a legal takedown " +
      "obligation.",
    matches: (action) => (action.parameters as ModerationParameters).category === "mandatory-legal-takedown",
  },
];

function signal(params: {
  readonly id: string;
  readonly kind: string;
  readonly value: unknown;
  readonly source: Provenance;
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

// ── M1 — execute: a routine hide-post action. ─────────────────────────────
const m1: DomainCase = {
  id: "moderation-m1-clean-hide",
  title: "Low-risk report, classifier and reporter trust both clear",
  narrative:
    "Post PST-90142 was reported once. The classifier reads it as category \"low-risk\" with a toxicity " +
    "score of 0.12, and the reporting user has a trusted-flagger score of 0.85 — well above this policy's " +
    "0.7 floor.",
  reversibilityRationale:
    "Reversible-with-cost: hiding a post can be undone by unhiding it, but a wrongly-hidden post still " +
    "loses real reach and engagement during the window it was hidden — a bounded, real cost, not free and " +
    "not permanent.",
  action: moderationAction(1_200, "reversible-with-cost", "moderation.hidePost", {
    postId: "PST-90142",
    authorId: "usr-51029",
    reporterId: "usr-77213",
    reportCount: 1,
    category: "low-risk",
  }),
  requirements: [categoryAllowListRequirement(), toxicityCeilingRequirement(), reporterTrustRequirement()],
  prohibitions,
  signals: [
    signal({ id: "sig-m1-category", kind: "moderation.classifier.category", value: "low-risk", source: { kind: "system", system: "content-classifier-v7" }, hoursAgo: 0.5, confidence: 0.95 }),
    signal({ id: "sig-m1-toxicity", kind: "moderation.classifier.toxicityScore", value: 0.12, source: { kind: "system", system: "content-classifier-v7" }, hoursAgo: 0.5, confidence: 0.93 }),
    signal({ id: "sig-m1-trust", kind: "moderation.reporter.trustScore", value: 0.85, source: { kind: "system", system: "trust-score-service" }, hoursAgo: 1, confidence: 0.9 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "execute" },
};

// ── M2 — ask: impersonation claim needs proof only the reporter has. ─────
const m2: DomainCase = {
  id: "moderation-m2-ask-impersonation-proof",
  title: "Impersonation report, no proof of identity yet",
  narrative:
    "Post PST-90210 was reported for impersonation. The classifier and toxicity checks both come back " +
    "clean (impersonation isn't a toxicity problem), but the reporting user hasn't yet provided anything " +
    "linking them to the identity they claim is being impersonated — a fact only they can supply.",
  reversibilityRationale: "Reversible-with-cost — same reasoning as M1.",
  action: moderationAction(900, "reversible-with-cost", "moderation.hidePost", {
    postId: "PST-90210",
    authorId: "usr-64410",
    reporterId: "usr-10022",
    reportCount: 1,
    category: "impersonation-claim",
  }),
  requirements: [
    categoryAllowListRequirement(),
    toxicityCeilingRequirement(),
    {
      signalKind: "impersonation.identityProof.linked",
      description: "a link or reference proving the reporter is the person they claim is being impersonated",
      minConfidence: mustConfidence(0.5),
      maxAge: mustMs(DAYS),
      supplier: { kind: "counterparty", party: "the reporting user" },
    },
  ],
  prohibitions,
  signals: [
    signal({ id: "sig-m2-category", kind: "moderation.classifier.category", value: "low-risk", source: { kind: "system", system: "content-classifier-v7" }, hoursAgo: 0.5, confidence: 0.9 }),
    signal({ id: "sig-m2-toxicity", kind: "moderation.classifier.toxicityScore", value: 0.05, source: { kind: "system", system: "content-classifier-v7" }, hoursAgo: 0.5, confidence: 0.9 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "ask" },
};

// ── M3 — defer: first-offense self-correction window. ────────────────────
const m3: DomainCase = {
  id: "moderation-m3-defer-cooldown",
  title: "First warning issued, self-correction window still open",
  narrative:
    "Account usr-33218 received a first warning for post PST-90315. Policy gives a 24-hour self-" +
    "correction window before any escalated action is even considered — nobody needs to be asked " +
    "anything; the clock is the missing witness.",
  reversibilityRationale:
    "Reversible-with-delay: the throttled state this policy would otherwise apply lifts automatically " +
    "after a cooldown, but only after real time passes — not instant, not permanent.",
  action: moderationAction(2_000, "reversible-with-delay", "moderation.throttleAccount", {
    postId: "PST-90315",
    authorId: "usr-33218",
    reporterId: "usr-90011",
    reportCount: 1,
    category: "low-risk",
  }),
  requirements: [
    categoryAllowListRequirement(),
    toxicityCeilingRequirement(),
    {
      signalKind: "moderation.selfCorrection.window.completed",
      description: "whether the 24-hour self-correction window after a first warning has elapsed",
      minConfidence: mustConfidence(0.5),
      maxAge: mustMs(48 * HOURS),
      supplier: { kind: "time", waitingOn: "the 24-hour self-correction window after a first warning to elapse" },
    },
  ],
  prohibitions,
  signals: [
    signal({ id: "sig-m3-category", kind: "moderation.classifier.category", value: "low-risk", source: { kind: "system", system: "content-classifier-v7" }, hoursAgo: 1, confidence: 0.9 }),
    signal({ id: "sig-m3-toxicity", kind: "moderation.classifier.toxicityScore", value: 0.2, source: { kind: "system", system: "content-classifier-v7" }, hoursAgo: 1, confidence: 0.9 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "defer" },
};

// ── M4 — escalate/value-rejected: category not on the allow-list. ────────
const m4: DomainCase = {
  id: "moderation-m4-category-not-allowed",
  title: "Classifier category reads outside the allow-list",
  narrative:
    "Post PST-90402 was reported and the classifier's category comes back \"hate-speech-flagged\" — " +
    "present, fresh, and confidently reported, just not one of the two categories ({safe, low-risk}) that " +
    "clear this policy on their own. (Label and score only, by design — see this file's header.)",
  reversibilityRationale: "Reversible-with-cost — same reasoning as M1.",
  action: moderationAction(1_500, "reversible-with-cost", "moderation.hidePost", {
    postId: "PST-90402",
    authorId: "usr-88710",
    reporterId: "usr-40099",
    reportCount: 3,
    category: "hate-speech-flagged",
  }),
  requirements: [categoryAllowListRequirement(), toxicityCeilingRequirement(), reporterTrustRequirement()],
  prohibitions,
  signals: [
    signal({ id: "sig-m4-category", kind: "moderation.classifier.category", value: "hate-speech-flagged", source: { kind: "system", system: "content-classifier-v7" }, hoursAgo: 0.5, confidence: 0.91 }),
    signal({ id: "sig-m4-toxicity", kind: "moderation.classifier.toxicityScore", value: 0.2, source: { kind: "system", system: "content-classifier-v7" }, hoursAgo: 0.5, confidence: 0.9 }),
    signal({ id: "sig-m4-trust", kind: "moderation.reporter.trustScore", value: 0.8, source: { kind: "system", system: "trust-score-service" }, hoursAgo: 1, confidence: 0.9 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "escalate", cause: "value-rejected" },
};

// ── M5 — escalate/human: newsworthiness exception. ───────────────────────
const m5: DomainCase = {
  id: "moderation-m5-newsworthiness-review",
  title: "Verified public-figure account, borderline claim, newsworthiness exception",
  narrative:
    "Post PST-90519 from a verified public-official account makes a borderline factual claim about an " +
    "ongoing public matter. This project's policy carves out a newsworthiness exception for verified " +
    "public-interest accounts that no automated classifier resolves — it is, by policy, a human's call.",
  reversibilityRationale:
    "Reversible-with-delay: reduced-distribution states on a high-visibility account take longer to " +
    "fully lift than an ordinary hide (caching and syndication layers lag behind the moderation action), " +
    "so undoing it costs real time, not just a click.",
  action: moderationAction(10_000, "reversible-with-delay", "moderation.reduceDistribution", {
    postId: "PST-90519",
    authorId: "usr-verified-01",
    reporterId: "usr-20044",
    reportCount: 5,
    category: "borderline-claim",
  }),
  requirements: [
    categoryAllowListRequirement(),
    toxicityCeilingRequirement(),
    {
      signalKind: "policy.newsworthinessException.review",
      description: "a human policy reviewer's judgment on whether the newsworthiness exception applies",
      minConfidence: mustConfidence(0.5),
      maxAge: mustMs(48 * HOURS),
      supplier: {
        kind: "human",
        reason:
          "Policy carves out a newsworthiness exception for verified public-interest accounts that " +
          "requires a human policy reviewer's judgment; no automated classifier resolves this distinction.",
      },
    },
  ],
  prohibitions,
  signals: [
    signal({ id: "sig-m5-category", kind: "moderation.classifier.category", value: "low-risk", source: { kind: "system", system: "content-classifier-v7" }, hoursAgo: 0.5, confidence: 0.88 }),
    signal({ id: "sig-m5-toxicity", kind: "moderation.classifier.toxicityScore", value: 0.18, source: { kind: "system", system: "content-classifier-v7" }, hoursAgo: 0.5, confidence: 0.88 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "escalate", cause: "human" },
};

// ── M6 — refuse: mandatory legal takedown. ────────────────────────────────
const m6: DomainCase = {
  id: "moderation-m6-legal-takedown",
  title: "Legally mandated takedown category, refused regardless of evidence",
  narrative:
    "Post PST-90601 is flagged under this platform's mandatory-legal-takedown category (a legal " +
    "obligation, not a discretionary judgment call). No amount of classifier confidence or reporter " +
    "trust changes this outcome — it is refused the same way for any evidence attached.",
  reversibilityRationale:
    "Irreversible: a legally mandated takedown is treated as permanent — the content is removed and the " +
    "removal is reported per the underlying legal obligation, with no path back to \"visible again.\" " +
    "Like R6 (refund-approval) and D6 (code-deploy), this label is irrelevant to the outcome here: the " +
    "mandatory-legal-takedown prohibition refuses this case outright, before reversibility — or cost, or " +
    "any signal at all — is ever read.",
  action: moderationAction(20_000, "irreversible", "moderation.legalTakedown", {
    postId: "PST-90601",
    authorId: "usr-19203",
    reporterId: "usr-legal-intake",
    reportCount: 1,
    category: "mandatory-legal-takedown",
  }),
  requirements: [categoryAllowListRequirement(), toxicityCeilingRequirement()],
  prohibitions,
  signals: [
    signal({ id: "sig-m6-category", kind: "moderation.classifier.category", value: "low-risk", source: { kind: "system", system: "content-classifier-v7" }, hoursAgo: 0.5, confidence: 0.9 }),
    signal({ id: "sig-m6-toxicity", kind: "moderation.classifier.toxicityScore", value: 0.1, source: { kind: "system", system: "content-classifier-v7" }, hoursAgo: 0.5, confidence: 0.9 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "refuse" },
};

// ── M7 — HARD, escalate/insufficient-now: a permanent ban on 75% confidence. ──
const m7: DomainCase = {
  id: "moderation-m7-repeat-offender-ban",
  title: "HARD CASE — permanent ban considered on 75% confidence",
  narrative:
    "Account usr-55081 has two prior formal warnings; a third report leads the classifier to assess this " +
    "as a confirmed repeat-harassment pattern — at 75% confidence, which most reviewers would call " +
    "fairly strong. A permanent ban is irreversible, though, and this policy puts the cost of wrongly " +
    "banning a real, paying user at $150,000 (lost relationship, reputational and potential legal " +
    "exposure) — a bar that 75% confidence, however \"fairly strong\" it sounds, does not clear.",
  reversibilityRationale:
    "Irreversible: once an account and its content are purged, there is no undo that restores what was " +
    "there — the same category as the brief's own irreversible examples (data destroyed, a message " +
    "published).",
  action: moderationAction(150_000, "irreversible", "moderation.banAccount", {
    postId: "PST-90703",
    authorId: "usr-55081",
    reporterId: "usr-30077",
    reportCount: 3,
    category: "repeat-harassment-pattern",
  }),
  requirements: [{
    signalKind: "moderation.repeatOffender.assessment",
    description: "the classifier's assessment that this account shows a confirmed repeat-harassment pattern",
    minConfidence: mustConfidence(0.5),
    maxAge: mustMs(6 * HOURS),
    supplier: { kind: "time", waitingOn: "a second, independent classifier pass to corroborate the assessment" },
  }],
  prohibitions,
  signals: [
    signal({ id: "sig-m7-assessment", kind: "moderation.repeatOffender.assessment", value: "confirmed", source: { kind: "system", system: "content-classifier-v7" }, hoursAgo: 0.5, confidence: 0.75 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "escalate", cause: "insufficient-now" },
};

export const contentModeration: Domain = {
  name: "content-moderation",
  description:
    "Acts on reported posts and accounts using a classifier's category and toxicity readings and a " +
    "reporter's trust score — a trust-and-safety domain using invented category labels and scores only, " +
    "never real or realistic abusive text.",
  cases: [m1, m2, m3, m4, m5, m6, m7],
};
