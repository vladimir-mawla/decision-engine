import { describe, expect, it } from "vitest";
import { decide } from "../../lib/decide/decide.js";
import { isBarSaturated } from "../../lib/decide/stakes.js";
import { WORST_CASE_COST } from "../../lib/cost-model/cost.js";
import { requiredConfidence } from "../../lib/cost-model/requiredConfidence.js";
import { makeAction, makeInput, makeRequirement, makeSignal, NOW } from "./helpers.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * PART TWO — REGRESSION: real historical defect, M4
 * ══════════════════════════════════════════════════════════════════════
 * DEFECT (M4, found by independent verification): the escalate reason for
 * a saturated confidence bar (`lib/decide/reasons.ts`, then named
 * `unreachableBarReason`) claimed the bar was "unreachable by evidence
 * alone" and that "ownership of this call moves to a human permanently."
 * The verification's sweep found this condition first fires at roughly
 * $1,800 on the most forgiving reversibility tier — an ordinary cost, not
 * an extreme one — and, more importantly, found the underlying claim was
 * never literally true AT ANY COST: `Confidence` caps at 1.0 and every
 * `requiredConfidence` bar is clamped below that at 0.99 (by construction,
 * `requiredConfidence.ts`'s own MAX_BAR), so a single signal reporting
 * confidence 1.0 ALWAYS clears any bar this model can produce, under
 * min-aggregation. "Unreachable" and "permanently" were both false as
 * stated. The fix renamed the function to `costCeilingReason` and rewrote
 * the text to say only the narrower, true thing: the bar has hit ITS OWN
 * ceiling for this reversibility level, so a bigger stated cost cannot
 * push it higher — not that no evidence could ever clear it.
 *
 * This regression pins the BEHAVIORAL claim directly: confidence 1.0
 * clears the bar even when the bar is fully saturated (WORST_CASE_COST,
 * the model's own worst-case sentinel), at every reversibility level.
 * "Nothing is ever truly unreachable" is not asserted as prose here — it
 * is exercised.
 */
describe("REGRESSION (M4) — a saturated confidence bar is never truly unreachable: confidence 1.0 always clears it", () => {
  const levels = ["reversible-no-trace", "reversible-with-cost", "reversible-with-delay", "irreversible"] as const;

  it.each(levels)("at %s, WORST_CASE_COST saturates the bar, yet confidence 1.0 still executes", (reversibility) => {
    const action = makeAction({ reversibility, cost: WORST_CASE_COST });

    // Confirm the bar really is saturated for this level at this cost —
    // otherwise the test would not actually be exercising the case the
    // historical defect's wording was about.
    expect(isBarSaturated(action)).toBe(true);
    const bar = requiredConfidence(reversibility, WORST_CASE_COST);
    expect(bar).toBeLessThan(1); // the bar itself never reaches 1.0 — see requiredConfidence.ts

    const requirement = makeRequirement({ signalKind: "test.signal", minConfidence: 0.1 });
    const signal = makeSignal({ kind: "test.signal", confidence: 1.0 });

    const decision = decide(makeInput({ action, requirements: [requirement], signals: [signal], now: NOW }));

    // THE ACTUAL REGRESSION ASSERTION: a saturated bar does not mean
    // "unreachable" — confidence 1.0 clears it, every time.
    expect(decision.outcome).toBe("execute");
  });

  it("a genuine cost-ceiling escalate's reason text makes no 'unreachable'/'permanently' overclaim", () => {
    const action = makeAction({ reversibility: "reversible-no-trace", cost: WORST_CASE_COST });
    expect(isBarSaturated(action)).toBe(true);

    // Confidence just under the (saturated) bar — this SHOULD escalate,
    // and per DECISION 3b should be the cost-ceiling variant.
    const requirement = makeRequirement({ signalKind: "test.signal", minConfidence: 0.1 });
    const signal = makeSignal({ kind: "test.signal", confidence: 0.3 });

    const decision = decide(makeInput({ action, requirements: [requirement], signals: [signal], now: NOW }));
    expect(decision.outcome).toBe("escalate");
    if (decision.outcome !== "escalate") return;

    const reason = decision.missing.reason;
    // The corrected wording (reasons.ts's costCeilingReason) explicitly
    // states the OPPOSITE of the old overclaim — it says a confidence of
    // 1.0 would still clear it. It must never repeat the retracted claim
    // in absolute terms ("unreachable"/"permanently", unqualified).
    expect(reason).not.toMatch(/unreachable by evidence/i);
    expect(reason.toLowerCase()).not.toContain("permanently");
    expect(reason).toMatch(/confidence 1\.0/); // the corrected text states the true fact plainly
  });
});
