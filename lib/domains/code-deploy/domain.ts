import type { Action } from "../../contracts/action.js";
import type { Reversibility } from "../../cost-model/reversibility.js";
import type { Prohibition } from "../../decide/prohibition.js";
import type { Requirement } from "../../signals/requirement.js";
import { createSignal, type Signal } from "../../signals/signal.js";
import type { Provenance } from "../../signals/provenance.js";
import type { Domain, DomainCase } from "../types.js";
import { before, DEMO_NOW, HOURS, mustCapturedAt, mustConfidence, mustCost, mustMs } from "../shared/fixtures.js";

/**
 * CODE DEPLOY — a release-engineering domain.
 *
 * Decides: whether to ship a pull request, given review approvals, CI
 * status, a static-analysis/canary confidence reading, and (for the
 * riskiest changes) a required rollout target or a human security sign-off.
 *
 * COST-OF-BEING-WRONG vs. FACE VALUE — THE HEADLINE DEMONSTRATION IN THIS
 * FILE (case D7 below, contrasted with D1): `lib/cost-model/cost.ts`'s own
 * comment names this exact failure mode — "a wrongly-approved $5 deploy can
 * cost an outage... conflating 'how big is this action' with 'how bad is it
 * if this action was wrong' ... would make a cheap-looking irreversible
 * action ... look safe to the cost model purely because nothing about the
 * action itself looked expensive." D1 is a reversible-no-trace feature-flag
 * toggle to an internal admin tool, carrying $800 of `costOfBeingWrong` —
 * genuinely low-stakes, executes easily. D7 is a config flip that disables a
 * fraud check on the checkout path. Where a reviewer would naturally look,
 * the two match: one line changed, one file touched, two review approvals,
 * passing CI, and `no-findings` static analysis at 0.90 confidence, each.
 *
 * What separates them is D7's `costOfBeingWrong` ($250,000, an estimate of
 * fraud exposure during the window before anyone notices) and its
 * `irreversible` reversibility — exactly the two fields of an `Action` that
 * `decide()` reads. Neither has anything to do with the diff's size; both
 * come from what the flag CONTROLS. `lib/domains/__tests__/coverage.test.ts`
 * pins this independently, reading D7's `linesChanged` and asserting it is
 * 1, so the "tiny diff, huge cost" case cannot quietly stop being tiny.
 *
 * D1 clears its bar on 95%-confidence
 * review-approval and CI evidence, the only two requirements it declares
 * (a 90%-confidence static-analysis signal is also captured for D1, but no
 * requirement of D1's reads it — present, honest evidence, not a driver of
 * the outcome; see D1's own comment below). D7 escalates on 90%-confidence
 * evidence across ITS three requirements — review approvals, CI, and
 * (unlike D1) static analysis itself, which D7 does gate on. D7's evidence
 * is not weaker than D1's; D7's $250,000 cost of being wrong pushes the
 * confidence bar this reversibility level demands well above what either
 * case's evidence supplies. The stakes, not the evidence, are what's
 * categorically different, and the model is built to keep those two
 * questions separate.
 *
 * COVERAGE THIS DOMAIN CONTRIBUTES: execute, ask, defer, escalate (value-
 * rejected — the `in` operator — AND human-gap AND both confidence-bar
 * variants: cost-ceiling in D8, insufficient-now in D7), refuse; the `gte`
 * constraint operator (`deploy.reviewApprovals.count`, this project's own
 * canonical example for `gte` — see `lib/signals/constraint.ts`'s header);
 * reversibility levels reversible-no-trace, reversible-with-delay, and
 * irreversible.
 */

interface DeployParameters {
  readonly repo: string;
  readonly prNumber: number;
  readonly service: string;
  readonly environment: string;
  readonly linesChanged: number;
  readonly filesChanged: number;
  readonly method: "normal" | "force-push";
  readonly branchProtected: boolean;
  // Index signature so `DeployParameters` structurally satisfies
  // `Action["parameters"]`'s default type (`Readonly<Record<string,
  // unknown>>`) — a named interface isn't assignable to `Record<string,
  // unknown>` without one, even when every field it declares is.
  readonly [key: string]: unknown;
}

function deployAction(
  cost: number,
  reversibility: Reversibility,
  parameters: DeployParameters,
): Action<DeployParameters> {
  return {
    domain: "code-deploy",
    type: "deploy.release",
    parameters,
    costOfBeingWrong: mustCost(cost),
    reversibility,
  };
}

const reviewApprovalsRequirement = (): Requirement => ({
  signalKind: "deploy.reviewApprovals.count",
  description: "the number of code-review approvals on this pull request",
  minConfidence: mustConfidence(0.5),
  maxAge: mustMs(48 * HOURS),
  supplier: { kind: "time", waitingOn: "another reviewer to approve the pull request" },
  valueConstraint: { op: "gte", value: 2 },
});

const ciPassedRequirement = (): Requirement => ({
  signalKind: "ci.testSuite.status",
  description: "whether the CI test suite passed on the latest commit",
  minConfidence: mustConfidence(0.5),
  maxAge: mustMs(6 * HOURS),
  supplier: { kind: "time", waitingOn: "the CI pipeline to finish running" },
  valueConstraint: { op: "equals", value: "passed" },
});

const prohibitions: readonly Prohibition[] = [
  {
    id: "no-force-push-protected-branch",
    reason:
      "This project never permits a force-push that rewrites history on a protected branch. The blast " +
      "radius — silently discarding commits other engineers have already merged and built on — cannot " +
      "be bounded by any amount of review confidence, so this is refused outright, not weighed against " +
      "the evidence.",
    matches: (action) => {
      const p = action.parameters as DeployParameters;
      return p.method === "force-push" && p.branchProtected === true;
    },
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

// ── D1 — execute: a low-stakes feature-flag toggle. ──────────────────────
const d1: DomainCase = {
  id: "deploy-d1-flag-toggle-admin-tool",
  title: "Feature-flag toggle behind a kill switch, internal admin tool",
  narrative:
    "PR #4821 on internal-tools/admin-console flips a feature flag gating a new bulk-export button, " +
    "behind a kill switch that can instantly revert it. Two approvals and CI green — the only two things " +
    "this case's policy actually gates on — clear this case's bar at 95% confidence. A static-analysis " +
    "pass is also captured, reporting no findings at 90% confidence; a real pipeline would produce " +
    "exactly this reading, but no requirement below reads it, so — DELIBERATE CHOICE, stated plainly " +
    "rather than left for a reader to wonder about: this signal is kept, on purpose, as an example of a " +
    "real system genuinely carrying evidence no policy consumes, not silently dropped and not wired to a " +
    "requirement it would take no real work to add. It plays no part in this case's outcome.",
  reversibilityRationale:
    "Reversible-no-trace: the flag can be flipped back instantly, and nothing about an internal admin " +
    "tool's bulk-export button leaves residue once reverted — no customer traffic depends on it, no data " +
    "is written that a revert wouldn't also undo.",
  action: deployAction(800, "reversible-no-trace", {
    repo: "internal-tools/admin-console",
    prNumber: 4821,
    service: "admin-console",
    environment: "production",
    linesChanged: 1,
    filesChanged: 1,
    method: "normal",
    branchProtected: true,
  }),
  // D1 deliberately declares only these two requirements — review approvals
  // and CI — even though a third signal (below) is also captured. See
  // this file's own header comment and D1's narrative for why the static-
  // analysis signal is kept, unconsumed, on purpose, rather than either
  // wired to a requirement or removed.
  requirements: [reviewApprovalsRequirement(), ciPassedRequirement()],
  prohibitions,
  signals: [
    signal({ id: "sig-d1-approvals", kind: "deploy.reviewApprovals.count", value: 2, source: { kind: "system", system: "code-review-service" }, hoursAgo: 1, confidence: 0.95 }),
    signal({ id: "sig-d1-ci", kind: "ci.testSuite.status", value: "passed", source: { kind: "system", system: "ci-pipeline" }, hoursAgo: 0.5, confidence: 0.95 }),
    // INERT BY DESIGN: no requirement above has signalKind
    // "deploy.staticAnalysis.confidence", so decide() never reads this
    // signal for D1 (contrast D7 below, where the same signal kind DOES
    // have a requirement and is genuinely decisive). Kept rather than
    // removed or wired up, as a deliberate, honest example of a real
    // system carrying a signal no policy consumes — see the file header.
    signal({ id: "sig-d1-scan", kind: "deploy.staticAnalysis.confidence", value: "no-findings", source: { kind: "system", system: "static-analysis" }, hoursAgo: 0.5, confidence: 0.9 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "execute" },
};

// ── D2 — ask: schema migration needs the author's own confirmation. ──────
const d2: DomainCase = {
  id: "deploy-d2-ask-migration-compat",
  title: "Schema migration, backward-compatibility not yet confirmed",
  narrative:
    "PR #5102 on core/orders-service adds a nullable column via a live migration. Reviews and CI are in " +
    "order, but nobody has confirmed the one fact only the submitting engineer can state: whether this " +
    "migration is safe to run against the currently deployed service version (a rolling deploy means old " +
    "and new code run side by side for a window).",
  reversibilityRationale:
    "Reversible-with-delay: undoing a live schema migration needs a maintenance window and a data-" +
    "consistency check before the world is back to where it was — real effort AND real time, not free and " +
    "not permanent.",
  action: deployAction(8_000, "reversible-with-delay", {
    repo: "core/orders-service",
    prNumber: 5102,
    service: "orders-service",
    environment: "production",
    linesChanged: 40,
    filesChanged: 3,
    method: "normal",
    branchProtected: true,
  }),
  requirements: [
    reviewApprovalsRequirement(),
    ciPassedRequirement(),
    {
      signalKind: "migration.backwardCompatible.confirmed",
      description: "whether this migration is backward-compatible with the currently running service version",
      minConfidence: mustConfidence(0.5),
      maxAge: mustMs(48 * HOURS),
      supplier: { kind: "counterparty", party: "the submitting engineer" },
    },
  ],
  prohibitions,
  signals: [
    signal({ id: "sig-d2-approvals", kind: "deploy.reviewApprovals.count", value: 2, source: { kind: "system", system: "code-review-service" }, hoursAgo: 2, confidence: 0.93 }),
    signal({ id: "sig-d2-ci", kind: "ci.testSuite.status", value: "passed", source: { kind: "system", system: "ci-pipeline" }, hoursAgo: 1, confidence: 0.93 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "ask" },
};

// ── D3 — defer: waiting on the canary window. ─────────────────────────────
const d3: DomainCase = {
  id: "deploy-d3-defer-canary-window",
  title: "Canary rollout, error-rate window still running",
  narrative:
    "PR #5190 on search/ranking-service is mid-rollout to a 5% canary. Reviews and CI passed; the only " +
    "thing left is the 30-minute error-rate observation window, which will resolve on its own — there is " +
    "nobody to ask, only time to let pass.",
  reversibilityRationale:
    "Reversible-with-delay: rolling back a canary means draining traffic and confirming metrics have " +
    "recovered — bounded effort and bounded time, but not instantaneous and not free.",
  action: deployAction(15_000, "reversible-with-delay", {
    repo: "search/ranking-service",
    prNumber: 5190,
    service: "ranking-service",
    environment: "canary",
    linesChanged: 120,
    filesChanged: 5,
    method: "normal",
    branchProtected: true,
  }),
  requirements: [
    reviewApprovalsRequirement(),
    ciPassedRequirement(),
    {
      signalKind: "canary.errorRate.window.completed",
      description: "whether the 30-minute canary error-rate observation window has finished",
      minConfidence: mustConfidence(0.5),
      maxAge: mustMs(6 * HOURS),
      supplier: { kind: "time", waitingOn: "the 30-minute canary error-rate window to finish before promoting to full traffic" },
    },
  ],
  prohibitions,
  signals: [
    signal({ id: "sig-d3-approvals", kind: "deploy.reviewApprovals.count", value: 2, source: { kind: "system", system: "code-review-service" }, hoursAgo: 1, confidence: 0.94 }),
    signal({ id: "sig-d3-ci", kind: "ci.testSuite.status", value: "passed", source: { kind: "system", system: "ci-pipeline" }, hoursAgo: 0.5, confidence: 0.94 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "defer" },
};

// ── D4 — escalate/value-rejected: skipped the canary policy (the `in` operator). ──
const d4: DomainCase = {
  id: "deploy-d4-skip-canary-policy",
  title: "Direct-to-production rollout, bypassing the required canary stage",
  narrative:
    "PR #5233 on search/indexing-pipeline is tagged for rollout stage \"production-direct\" — someone " +
    "requested skipping the canary stage entirely. This project's rollout policy requires the stage to be " +
    "one of {staging, canary} for this service; \"production-direct\" is present, fresh, and confidently " +
    "reported — it just isn't an allowed value.",
  reversibilityRationale:
    "Reversible-with-delay: same reasoning as D3 — rolling back a bad indexing-pipeline change needs " +
    "time to reprocess and confirm, not just a revert commit.",
  action: deployAction(5_000, "reversible-with-delay", {
    repo: "search/indexing-pipeline",
    prNumber: 5233,
    service: "indexing-pipeline",
    environment: "production-direct",
    linesChanged: 15,
    filesChanged: 2,
    method: "normal",
    branchProtected: true,
  }),
  requirements: [
    reviewApprovalsRequirement(),
    ciPassedRequirement(),
    {
      signalKind: "deploy.rolloutStage",
      description: "the rollout stage this change is being deployed through",
      minConfidence: mustConfidence(0.5),
      maxAge: mustMs(6 * HOURS),
      supplier: { kind: "time", waitingOn: "the rollout to be re-tagged through an allowed stage" },
      valueConstraint: { op: "in", values: ["staging", "canary"] },
    },
  ],
  prohibitions,
  signals: [
    signal({ id: "sig-d4-approvals", kind: "deploy.reviewApprovals.count", value: 2, source: { kind: "system", system: "code-review-service" }, hoursAgo: 1, confidence: 0.9 }),
    signal({ id: "sig-d4-ci", kind: "ci.testSuite.status", value: "passed", source: { kind: "system", system: "ci-pipeline" }, hoursAgo: 0.5, confidence: 0.9 }),
    signal({ id: "sig-d4-stage", kind: "deploy.rolloutStage", value: "production-direct", source: { kind: "system", system: "deploy-orchestrator" }, hoursAgo: 0.2, confidence: 0.95 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "escalate", cause: "value-rejected" },
};

// ── D5 — escalate/human: authentication middleware needs a security reviewer. ──
const d5: DomainCase = {
  id: "deploy-d5-auth-middleware-signoff",
  title: "Authentication middleware rewrite, security sign-off required",
  narrative:
    "PR #5301 on core/auth-service touches session-token validation (300 lines across 12 files). Reviews " +
    "and CI both check out, but this project's compliance policy requires a human security reviewer for " +
    "any change to the authentication middleware, independent of how confident automated testing is.",
  reversibilityRationale:
    "Reversible-with-delay: rolling back an authentication-path change safely means draining active " +
    "sessions and confirming no users are left in an inconsistent auth state — effort and time, not " +
    "instant and not free.",
  action: deployAction(60_000, "reversible-with-delay", {
    repo: "core/auth-service",
    prNumber: 5301,
    service: "user-authentication",
    environment: "production",
    linesChanged: 300,
    filesChanged: 12,
    method: "normal",
    branchProtected: true,
  }),
  requirements: [
    reviewApprovalsRequirement(),
    ciPassedRequirement(),
    {
      signalKind: "security.reviewer.signoff",
      description: "a human security reviewer's sign-off on this authentication-path change",
      minConfidence: mustConfidence(0.5),
      maxAge: mustMs(48 * HOURS),
      supplier: {
        kind: "human",
        reason:
          "Changes to the authentication middleware require a human security reviewer's sign-off " +
          "regardless of automated test confidence, per compliance policy.",
      },
    },
  ],
  prohibitions,
  signals: [
    signal({ id: "sig-d5-approvals", kind: "deploy.reviewApprovals.count", value: 3, source: { kind: "system", system: "code-review-service" }, hoursAgo: 2, confidence: 0.92 }),
    signal({ id: "sig-d5-ci", kind: "ci.testSuite.status", value: "passed", source: { kind: "system", system: "ci-pipeline" }, hoursAgo: 1, confidence: 0.92 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "escalate", cause: "human" },
};

// ── D6 — refuse: force-push to a protected branch. ────────────────────────
const d6: DomainCase = {
  id: "deploy-d6-force-push-refused",
  title: "Force-push to a protected branch, refused regardless of review count",
  narrative:
    "An engineer requests a force-push to core/payments-service's protected main branch to \"clean up\" a " +
    "messy merge. Review approvals and CI status are irrelevant here: a force-push to shared, protected " +
    "history is refused outright, the same way it would be with any evidence attached.",
  reversibilityRationale:
    "Irreversible: once other engineers have pulled or built on the commits a force-push discards, there " +
    "is no undo — the history is gone from the shared branch, and \"a force-push is irreversible\" is " +
    "this milestone's own canonical example of the level.",
  action: deployAction(500_000, "irreversible", {
    repo: "core/payments-service",
    prNumber: 0,
    service: "payments-service",
    environment: "production",
    linesChanged: 0,
    filesChanged: 0,
    method: "force-push",
    branchProtected: true,
  }),
  requirements: [reviewApprovalsRequirement(), ciPassedRequirement()],
  prohibitions,
  signals: [
    signal({ id: "sig-d6-approvals", kind: "deploy.reviewApprovals.count", value: 2, source: { kind: "system", system: "code-review-service" }, hoursAgo: 1, confidence: 0.9 }),
    signal({ id: "sig-d6-ci", kind: "ci.testSuite.status", value: "passed", source: { kind: "system", system: "ci-pipeline" }, hoursAgo: 0.5, confidence: 0.9 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "refuse" },
};

// ── D7 — HARD, escalate/insufficient-now: the cost-vs-value headline case. ──
const d7: DomainCase = {
  id: "deploy-d7-one-line-fraud-flag",
  title: "HARD CASE — one line changed, disables fraud checks on checkout",
  narrative:
    "PR #5402 on core/payments-service flips a single config flag that disables a fraud-scoring check on " +
    "the checkout path (meant as a temporary bypass for a vendor incident). By every face-value measure " +
    "this is the smallest, most boring PR in this file: 1 line, 1 file, 2 approvals, CI green, static " +
    "analysis 90% confident it's safe. It escalates anyway, because once fraudulent transactions clear " +
    "during the exposure window, that loss cannot be recovered by reverting the flag.",
  reversibilityRationale:
    "Irreversible: NOT because damage already occurred once a transaction clears — reverting a wrongly-" +
    "approved refund also only stops future harm, and that alone would make every reversible-with-cost " +
    "action in this codebase irreversible too, which would collapse the level entirely. The real " +
    "distinguishing fact is WHO the money went to and whether any recovery path reaches them: a cleared " +
    "fraudulent transaction's recipient is an anonymous, uncooperative actor this project has no lever " +
    "against — no known account to re-charge, no relationship to send to collections, nothing — which is " +
    "exactly the ADR's own \"money sent to a third party\" example. Contrast refund-approval's cases " +
    "(reversible-with-cost): there, the counterparty is a known, contactable customer, reachable for a " +
    "re-charge or a collections cycle. Reverting this flag stops NEW fraud from clearing, but there is no " +
    "such lever for what already cleared, so the exposure window itself is irreversible.",
  action: deployAction(250_000, "irreversible", {
    repo: "core/payments-service",
    prNumber: 5402,
    service: "payments-authorization",
    environment: "production",
    linesChanged: 1,
    filesChanged: 1,
    method: "normal",
    branchProtected: true,
  }),
  requirements: [reviewApprovalsRequirement(), ciPassedRequirement(), {
    signalKind: "deploy.staticAnalysis.confidence",
    description: "the static-analysis engine's confidence that this specific change is safe",
    minConfidence: mustConfidence(0.5),
    maxAge: mustMs(6 * HOURS),
    supplier: { kind: "time", waitingOn: "a deeper static-analysis pass to complete" },
  }],
  prohibitions,
  signals: [
    signal({ id: "sig-d7-approvals", kind: "deploy.reviewApprovals.count", value: 2, source: { kind: "system", system: "code-review-service" }, hoursAgo: 0.5, confidence: 0.9 }),
    signal({ id: "sig-d7-ci", kind: "ci.testSuite.status", value: "passed", source: { kind: "system", system: "ci-pipeline" }, hoursAgo: 0.3, confidence: 0.9 }),
    signal({ id: "sig-d7-scan", kind: "deploy.staticAnalysis.confidence", value: "no-findings", source: { kind: "system", system: "static-analysis" }, hoursAgo: 0.3, confidence: 0.9 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "escalate", cause: "insufficient-now" },
};

// ── D8 — HARD, escalate/cost-ceiling: large-blast-radius canary, ambiguous metrics. ──
const d8: DomainCase = {
  id: "deploy-d8-large-canary-ambiguous",
  title: "HARD CASE — full ranking-model rollout, canary metrics ambiguous",
  narrative:
    "PR #5488 on search/ranking-service ships a new ranking model to 100% of traffic after a canary whose " +
    "metrics assessment lands at 80% confidence — genuinely ambiguous, not a clear pass or fail. At this " +
    "service's scale, a bad ranking change reaching every user has a business/reputational cost this " +
    "policy puts at $500,000, which has already pushed this reversibility level's bar to its ceiling: " +
    "arguing the cost is even higher would not raise the bar any further, only better metrics would help.",
  reversibilityRationale:
    "Reversible-with-delay: rolling back a bad ranking model means redeploying the previous model and " +
    "waiting for ranking caches to reflect it — real effort and real time, but not permanent.",
  action: deployAction(500_000, "reversible-with-delay", {
    repo: "search/ranking-service",
    prNumber: 5488,
    service: "ranking-service",
    environment: "production",
    linesChanged: 450,
    filesChanged: 20,
    method: "normal",
    branchProtected: true,
  }),
  requirements: [reviewApprovalsRequirement(), ciPassedRequirement(), {
    signalKind: "canary.metricsAssessment.confidence",
    description: "the canary metrics assessment's confidence that the new ranking model is safe to fully promote",
    minConfidence: mustConfidence(0.5),
    maxAge: mustMs(6 * HOURS),
    supplier: { kind: "time", waitingOn: "a longer canary observation window to reduce the ambiguity" },
  }],
  prohibitions,
  signals: [
    signal({ id: "sig-d8-approvals", kind: "deploy.reviewApprovals.count", value: 3, source: { kind: "system", system: "code-review-service" }, hoursAgo: 3, confidence: 0.95 }),
    signal({ id: "sig-d8-ci", kind: "ci.testSuite.status", value: "passed", source: { kind: "system", system: "ci-pipeline" }, hoursAgo: 2, confidence: 0.95 }),
    signal({ id: "sig-d8-canary", kind: "canary.metricsAssessment.confidence", value: "ambiguous", source: { kind: "system", system: "canary-analysis" }, hoursAgo: 0.5, confidence: 0.8 }),
  ],
  now: DEMO_NOW,
  expected: { outcome: "escalate", cause: "cost-ceiling" },
};

export const codeDeploy: Domain = {
  name: "code-deploy",
  description:
    "Ships or blocks a pull request using review approvals, CI status, and either a rollout-target " +
    "constraint or a human security sign-off — a release-engineering domain where a change's size and its " +
    "cost of being wrong are deliberately kept independent.",
  cases: [d1, d2, d3, d4, d5, d6, d7, d8],
};
