import { describe, expect, it } from "vitest";
import type { CostOfBeingWrong } from "../../lib/cost-model/cost.js";
import { parseCostOfBeingWrong } from "../../lib/cost-model/cost.js";
import { requiredConfidence } from "../../lib/cost-model/requiredConfidence.js";
import { parseConfidence } from "../../lib/contracts/confidence.js";
import { decide } from "../../lib/decide/decide.js";
import { makeAction, makeInput, makeRequirement, makeSignal, NOW } from "./helpers.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * PART TWO — REGRESSION: real historical defect, M1
 * ══════════════════════════════════════════════════════════════════════
 * DEFECT (M1, found by independent verification): `CostOfBeingWrong` is a
 * branded `number` specifically so a plain number cannot be ASSIGNED where
 * a validated cost is expected without going through `parseCostOfBeingWrong`.
 * But a deliberate double cast, `(x as number) as CostOfBeingWrong`, compiles
 * with zero errors — TypeScript's structural typing cannot refuse an
 * explicit assertion. cost.ts's own doc comment names this directly: "What
 * the brand does NOT stop is a deliberate cast ... that is exactly the
 * shortcut a time-pressured domain implementation could reach for."
 *
 * THE ACTUAL FIX, per that same comment, is NOT a runtime guard — it is a
 * static source-scan test, `lib/contracts/__tests__/brand-casts.test.ts`,
 * which fails the build if `as CostOfBeingWrong` appears anywhere in `lib/`
 * outside `cost.ts` itself. That test is frozen (inside `lib/`) and out of
 * scope for M7 to touch or duplicate — and it explicitly exempts every
 * `*.test.ts` file, including this one, "since fixtures are allowed to
 * construct branded test values directly." So the cast below is not
 * something the frozen guard would ever catch here, and that is by design:
 * this test's job is not to re-prove the source-scan (it already runs, as
 * part of the 478/478 baseline) but to answer a DIFFERENT, honest question
 * the historical defect raises: once the brand IS bypassed — by a caller
 * outside lib/'s own source scan, e.g. a value arriving from
 * deserialization, another service, or exactly this kind of cast — what
 * ACTUALLY happens downstream? The brand offers no runtime protection at
 * all once bypassed; the only real question is whether anything else in
 * the pipeline still fails closed.
 */
describe("REGRESSION (M1) — a bypassed CostOfBeingWrong brand carries no runtime protection of its own", () => {
  it("the double cast the frozen source-scan exists to forbid compiles and runs with zero runtime error", () => {
    const bypassed = (-999_999 as unknown as number) as CostOfBeingWrong;
    // No exception, no validation — the brand is purely a compile-time
    // fiction once you cast past it. This one line is the entire defect,
    // made concrete: nothing stops it from happening here.
    expect(typeof bypassed).toBe("number");
    expect(bypassed).toBe(-999_999);
  });

  it("HONEST FINDING: requiredConfidence accepts the bypassed negative cost and produces a mathematically nonsensical (non-finite or out-of-range) bar, rather than a plausible-looking wrong one", () => {
    const bypassedNegative = (-100 as unknown as number) as CostOfBeingWrong;
    const bar = requiredConfidence("reversible-no-trace", bypassedNegative);
    // A real, valid cost can never make requiredConfidence return
    // something parseConfidence would reject — the bypassed negative cost
    // does exactly that (the exponential term overshoots past 1, driving
    // the bar below 0, which parseConfidence's range check refuses).
    const parsedBar = parseConfidence(bar);
    expect(parsedBar.ok).toBe(false);
  });

  it("HONEST FINDING: an extreme bypassed cost drives the bar to a non-finite value, which parseConfidence also refuses", () => {
    const bypassedHugeNegative = (-1_000_000_000 as unknown as number) as CostOfBeingWrong;
    const bar = requiredConfidence("irreversible", bypassedHugeNegative);
    expect(Number.isFinite(bar)).toBe(false);
    expect(parseConfidence(bar).ok).toBe(false);
  });

  it("HONEST FINDING: a bypassed NaN cost (impossible via the real parser) propagates to a NaN bar", () => {
    const rejected = parseCostOfBeingWrong(Number.NaN);
    expect(rejected.ok).toBe(false); // the real parser correctly refuses NaN
    const bypassedNaN = (Number.NaN as unknown as number) as CostOfBeingWrong;
    const bar = requiredConfidence("reversible-with-delay", bypassedNaN);
    expect(Number.isNaN(bar)).toBe(true);
    expect(parseConfidence(bar).ok).toBe(false);
  });

  it("THE ACTUAL SAFETY NET: decide() does not execute on a bypassed-brand action — it fails closed to escalate, never open", () => {
    // computeConfidenceBar (lib/decide/decide.ts) calls parseConfidence on
    // requiredConfidence's result and treats a rejection as `bar === null`,
    // which routes to an internal-error escalate — a SEPARATE, independent
    // guard from the one the brand-cast defect was actually about. This is
    // the honest, complete answer: the brand's own protection is fully
    // defeated by the cast, but the downstream pipeline still does not
    // silently execute on the resulting garbage value — it happens to be
    // caught one layer later, by a guard that was never designed with this
    // specific attack in mind.
    const bypassedNegative = (-500 as unknown as number) as CostOfBeingWrong;
    const action = makeAction({ reversibility: "reversible-no-trace", cost: 1 });
    const hostileAction = { ...action, costOfBeingWrong: bypassedNegative };

    const requirement = makeRequirement({ signalKind: "test.signal", minConfidence: 0.1 });
    const signal = makeSignal({ kind: "test.signal", confidence: 0.9 });

    const decision = decide(makeInput({ action: hostileAction, requirements: [requirement], signals: [signal], now: NOW }));

    expect(decision.outcome).not.toBe("execute");
    expect(decision.outcome).toBe("escalate");
  });
});
