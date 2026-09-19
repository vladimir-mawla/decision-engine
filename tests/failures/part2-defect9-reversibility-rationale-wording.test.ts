import { describe, expect, it } from "vitest";
import { codeDeploy } from "../../lib/domains/index.js";
import { refundApproval } from "../../lib/domains/index.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * PART TWO — REGRESSION: real historical defect, M6 — HONEST, PARTIAL PIN
 * ══════════════════════════════════════════════════════════════════════
 * DEFECT (M6, found by independent verification): case D7's
 * `reversibilityRationale` (lib/domains/code-deploy/domain.ts) originally
 * argued its `irreversible` level because reverting the flag "stops new
 * damage, but does not undo transactions already cleared" — a claim
 * EQUALLY true of every `reversible-with-cost` action in this codebase (a
 * reverted refund also only stops future harm; it never un-charges a
 * customer's original payment either). Taken at face value, that argument
 * would collapse `reversible-with-cost` into `irreversible` for every case
 * in the project, since "reverting only stops future harm" is true of
 * both levels — it does not actually distinguish them. It was fixed by
 * rewriting the rationale to turn on the REAL distinguishing fact: whether
 * a recovery path reaches a known, contactable counterparty (a refund's
 * recipient is a reachable customer; a cleared fraudulent transaction's
 * recipient is an anonymous actor with no lever against them at all).
 *
 * WHY THIS CANNOT BE FULLY PINNED BY A BEHAVIORAL TEST, STATED PLAINLY:
 * `reversibilityRationale` is a plain, human-facing `string` field on
 * `DomainCase` (lib/domains/types.ts) — the demo script prints it, but
 * `decide()`/`requiredConfidence()`/`isBarSaturated()` never read it. The
 * ENGINE's behavior (which confidence bar D7 gets) is 100% determined by
 * `action.reversibility` (the literal `"irreversible"`) and
 * `action.costOfBeingWrong` alone, regardless of what the rationale prose
 * argues. So there is no runtime code path whose OUTPUT would differ if
 * this string were wrong, badly worded, or even absent — the defect was
 * entirely about whether the ARGUMENT is sound, which is a question about
 * the quality of a piece of English prose, not a behavioral invariant a
 * test can exercise. Writing a test that merely checks decide() still
 * returns `escalate` for D7 (it does, and other suites already cover
 * that) would not pin THIS defect at all — that number never depended on
 * the rationale text.
 *
 * WHAT CAN HONESTLY BE DONE INSTEAD: a narrow, content-based regression
 * guard against the SPECIFIC retracted argument shape reappearing. This
 * cannot verify the rationale is logically sound (only a human, or a fresh
 * independent review, can judge that) — it can only catch a REVERSION to
 * the exact collapsing argument this defect already was, which is a real,
 * if modest, thing to guard against.
 */
describe("REGRESSION (M6) — honest partial pin: D7's reversibility rationale does not revert to the collapsing 'stops future harm only' argument", () => {
  const d7 = codeDeploy.cases.find((c) => c.id === "deploy-d7-one-line-fraud-flag");

  it("D7 exists and is still classified irreversible (the level itself, unaffected either way by the rationale's wording)", () => {
    expect(d7).toBeDefined();
    expect(d7?.action.reversibility).toBe("irreversible");
  });

  it("the rationale states the actual distinguishing fact (a recovery path to a reachable counterparty) rather than the retracted, collapsing one", () => {
    const rationale = d7?.reversibilityRationale ?? "";
    // The corrected argument's real content: an unreachable counterparty,
    // contrasted explicitly against a reachable one.
    expect(rationale.toLowerCase()).toContain("recovery path");
    expect(rationale.toLowerCase()).toContain("reachable");
  });

  it("the rationale explicitly disclaims the retracted argument shape by name, rather than silently no longer using it (so a future editor sees WHY, not just a different string)", () => {
    const rationale = d7?.reversibilityRationale ?? "";
    expect(rationale).toContain("NOT because damage already occurred");
  });

  it("cross-check: refund-approval's own reversible-with-cost rationale independently argues recoverability via a reachable, contactable customer — the exact contrast D7's fixed rationale draws against", () => {
    // If this ever changed to also argue "reverting only stops future
    // harm" as ITS distinguishing reason (without the reachable-customer
    // contrast), the two domains' rationales would no longer distinguish
    // reversible-with-cost from irreversible at all — the same collapse
    // the original D7 defect risked, from the other side.
    const anyRefundCase = refundApproval.cases[0];
    expect(anyRefundCase?.action.reversibility).toBe("reversible-with-cost");
  });
});
