import { describe, expect, it } from "vitest";
import { analyzeGaps } from "../../lib/signals/gap.js";
import type { CapturedAt } from "../../lib/signals/time.js";
import { makeRequirement, makeSignal, mustCapturedAt } from "./helpers.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * PART TWO — REGRESSION: real historical defect, M3
 * ══════════════════════════════════════════════════════════════════════
 * DEFECT (M3, found by independent verification): a `stale` Gap
 * (lib/signals/gap.ts) is supposed to carry the freshest candidate's
 * actual `age` — but when EVERY candidate for a requirement is
 * clock-inconsistent (its own `capturedAt` is, relative to the `now` this
 * particular `analyzeGaps` call was given, in the future — see
 * lib/signals/time.ts's `ageOf`), there is no honest duration to report.
 * The earlier implementation fabricated `age: 0` for this case — a
 * plausible-looking LIE ("this signal is exactly zero milliseconds old")
 * that directly contradicted gap.ts's own doc comment promising the Gap
 * reports the signal's actual age. It was fixed by making `stale.age` an
 * `Age` (the same discriminated union `elapsed | clock-inconsistency`
 * `ageOf` itself returns) instead of a bare `Milliseconds` — so a caller
 * cannot even read a numeric age off a clock-inconsistent Gap without
 * first narrowing on `age.kind`, the same discipline `SignalReading` uses
 * to keep `.value` unreachable on a non-"fresh" reading.
 *
 * A clock inconsistency at gap-analysis time is real and reachable even
 * though `parseCapturedAt` refuses to CONSTRUCT a future-dated signal
 * relative to ITS OWN `now`: a signal validated against one clock reading
 * can still be judged, later, against an earlier `now` (a caller replaying
 * with a `now` from before the signal was captured, or two callers whose
 * clocks disagree) — `ageOf` is exactly the function that detects that,
 * and `analyzeGaps` is exactly the function this defect lived in.
 */
describe("REGRESSION (M3) — a stale Gap never fabricates age: 0 when every candidate is clock-inconsistent", () => {
  it('all candidates clock-inconsistent -> the stale Gap\'s age is honestly { kind: "clock-inconsistency" }, never a fabricated elapsed duration', () => {
    // Construct a signal validly captured at T2 (relative to its OWN
    // clock, T2 === T2, allowed), then judge it via analyzeGaps against an
    // EARLIER now, T1 — a real, reachable clock inconsistency, not a
    // contrived violation of parseCapturedAt's own construction-time rule.
    const t2 = mustCapturedAt("2026-09-19T15:00:00.000Z", "2026-09-19T15:00:00.000Z" as CapturedAt);
    const t1 = "2026-09-19T14:00:00.000Z" as CapturedAt;

    const signal = makeSignal({
      id: "sig-future-relative-to-t1",
      kind: "test.signal",
      confidence: 0.9,
      now: t2,
      capturedAtIso: t2,
    });

    const requirement = makeRequirement({ signalKind: "test.signal", minConfidence: 0.5 });

    const gaps = analyzeGaps([requirement], [signal], t1);

    expect(gaps).toHaveLength(1);
    const gap = gaps[0]!;
    expect(gap.reason).toBe("stale");
    if (gap.reason !== "stale") return;

    // THE ACTUAL REGRESSION ASSERTION: never a fabricated numeric age.
    expect(gap.age.kind).toBe("clock-inconsistency");
    // Structurally, a clock-inconsistent Age has no `.ms` field at all —
    // TypeScript enforces this at compile time (the discriminated union
    // has no shared `.ms`), and this asserts the runtime shape agrees:
    // there is no `ms` key sitting on the object regardless of narrowing.
    expect("ms" in gap.age).toBe(false);
  });

  it("mixed candidates (one elapsed-but-stale, one clock-inconsistent) prefer the trustworthy elapsed age — its OWN real duration, never a fabricated 0 borrowed from the inconsistent one", () => {
    const now = "2026-09-19T15:00:00.000Z" as CapturedAt;
    const requirement = makeRequirement({ signalKind: "test.signal", minConfidence: 0.5, maxAgeMs: 60_000 });

    // Elapsed but stale (2 hours old, maxAge is only 60s).
    const staleElapsed = makeSignal({
      id: "sig-stale-elapsed",
      kind: "test.signal",
      confidence: 0.9,
      now,
      capturedAtIso: "2026-09-19T13:00:00.000Z",
    });
    // Clock-inconsistent relative to the `now` analyzeGaps is called with
    // below, even though it was validly constructed relative to ITS OWN
    // "now" (16:00, one hour after this signal's own capturedAt).
    const laterClock = "2026-09-19T16:00:00.000Z" as CapturedAt;
    const futureRelativeToAnalysis = makeSignal({
      id: "sig-clock-inconsistent",
      kind: "test.signal",
      confidence: 0.9,
      now: laterClock,
      capturedAtIso: laterClock,
    });

    const gaps = analyzeGaps([requirement], [staleElapsed, futureRelativeToAnalysis], now);
    expect(gaps).toHaveLength(1);
    const gap = gaps[0]!;
    expect(gap.reason).toBe("stale");
    if (gap.reason !== "stale") return;

    // The "most recent" candidate honestly prefers the trustworthy elapsed
    // reading over the clock-inconsistent one (per gap.ts's own documented
    // tie-break) — its age is real elapsed time, never a fabricated 0.
    expect(gap.age.kind).toBe("elapsed");
    if (gap.age.kind === "elapsed") {
      expect(gap.age.ms).toBe(2 * 60 * 60 * 1000);
    }
  });
});
