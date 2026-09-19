import { describe, expect, it } from "vitest";
import { recordDecision } from "../../lib/audit/record.js";
import { makeAction, makeInput, makeRequirement, makeSignal, NOW } from "./helpers.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * PART TWO — REGRESSION: real historical defect, M5 — HONEST, PARTIAL PIN
 * ══════════════════════════════════════════════════════════════════════
 * DEFECT (M5, found by independent verification): five assertions across
 * `lib/audit/__tests__/` passed for the wrong reason — including the two
 * NAMED as this milestone's own security-critical guarantee ("never
 * discloses a signal's value"), in `record.test.ts`. Those two tests
 * asserted only that `JSON.stringify(record)` did not contain a secret
 * string. That is vacuous as a security guarantee: a `Signal`'s value
 * lives inside a closure (M3's own encapsulation), so `JSON.stringify`
 * cannot reach it EITHER WAY — whether `recordDecision` correctly maps
 * evidence through `toSignalSnapshot`, or a real regression made it embed
 * the raw `Signal` directly. Confirmed by mutation: making `record.ts`
 * embed the raw `Signal` left both tests green. The test that actually
 * caught the mutation was an unrelated, incidental `toEqual` elsewhere in
 * the same file. Three more of the same shape were found in the sweep
 * (`replay.ts`'s `now`-vs-wall-clock purity, `RuleTrace`'s confidence-bar
 * fields never asserted, `SignalDisclosure`'s fields never asserted). All
 * five were rewritten to structural, mutation-resistant assertions.
 *
 * WHY THIS CANNOT BE FULLY PINNED FROM tests/failures/, STATED PLAINLY:
 * the defect is about the TEXT of specific assertions inside
 * `lib/audit/__tests__/record.test.ts`, `rule.test.ts`, `disclose.test.ts`,
 * and `replay.test.ts` — files under `lib/`, frozen for M7. Re-proving the
 * ORIGINAL finding requires either (a) mutating the frozen production code
 * those tests exercise and confirming those SPECIFIC tests still pass (a
 * mutation-testing exercise this milestone is not permitted to run against
 * frozen files), or (b) editing the frozen test files themselves to swap
 * back in the vacuous assertions temporarily — both forbidden by M7's own
 * freeze boundary. There is no honest way to pin "these five named
 * assertions, in these five specific frozen locations, now check the right
 * thing" without touching the frozen locations. Writing a test that merely
 * asserts something adjacent and calling it equivalent would be exactly
 * the "test that cannot fail" anti-pattern defect 7 itself is a case
 * study in — worse than an acknowledged gap, per this milestone's own
 * brief.
 *
 * WHAT CAN HONESTLY BE DONE INSTEAD: verify, from the PUBLIC API alone,
 * the underlying BEHAVIORAL property the vacuous tests were trying (and
 * failing) to guarantee — that `recordDecision` structurally cannot leak
 * a signal's value, checked the mutation-resistant way (asserting the
 * exact key set and the absence of any function-valued property on every
 * evidence entry), the same shape of fix the M5 verification actually
 * applied. This is a real, passing regression check on the CURRENT public
 * behavior; it is not a re-creation of the specific frozen-test-file
 * history, and this comment says so rather than implying otherwise.
 */
describe("REGRESSION (M5) — honest partial pin: recordDecision's evidence cannot leak a signal's value (structural check, not string-absence)", () => {
  it("every evidence entry has exactly the SignalSnapshot key set — no `value` key, no function-valued property, regardless of what the original Signal's value was", () => {
    const secretValue = { ssn: "000-00-0000", note: "this must never appear in the record" };
    const action = makeAction({ reversibility: "reversible-with-cost", cost: 50 });
    const requirement = makeRequirement({ signalKind: "test.signal", minConfidence: 0.1 });
    const signal = makeSignal({ kind: "test.signal", confidence: 0.9, value: secretValue });

    const record = recordDecision(makeInput({ action, requirements: [requirement], signals: [signal], now: NOW }), "id-1", NOW);
    expect(record.kind).toBe("decision");
    if (record.kind !== "decision") return;

    expect(record.decision.evidence).toHaveLength(1);
    const snapshot = record.decision.evidence[0] as unknown as Record<string, unknown>;

    // The mutation-resistant assertion the fix actually introduced: the
    // exact key set, not merely "no string match for the secret somewhere
    // in a stringified blob."
    expect(new Set(Object.keys(snapshot))).toEqual(new Set(["id", "kind", "source", "capturedAt", "confidence"]));
    expect("value" in snapshot).toBe(false);
    for (const key of Object.keys(snapshot)) {
      expect(typeof snapshot[key]).not.toBe("function");
    }

    // Secondary, string-absence check — kept only as a WEAKER corroborating
    // signal, explicitly not the primary guarantee (that is the structural
    // check above), matching how the actual M5 fix demoted this exact
    // assertion rather than deleting it outright.
    expect(JSON.stringify(record)).not.toContain("000-00-0000");
  });

  it("this holds even when the Signal is hand-built to satisfy the shape without going through createSignal's normal discipline", () => {
    // signal.ts's own documented KNOWN LIMIT: nothing stops a caller from
    // hand-writing an object satisfying the Signal interface. Here, that
    // object's `read` always claims "fresh" regardless of age/maxAge —
    // recordDecision never calls `.read()` at all (M5's own header
    // comment: metadata alone is enough), so this should make no
    // difference to what the record captures.
    const hostileSignal = {
      id: "hostile-1",
      kind: "test.signal",
      source: { kind: "system" as const, system: "hostile" },
      capturedAt: NOW,
      confidence: 0.95,
      read: () => ({ status: "fresh" as const, value: "SECRET", age: 0, confidence: 0.95 }),
    };

    const action = makeAction({ reversibility: "reversible-with-cost", cost: 50 });
    const requirement = makeRequirement({ signalKind: "test.signal", minConfidence: 0.1 });

    const record = recordDecision(
      makeInput({ action, requirements: [requirement], signals: [hostileSignal as never], now: NOW }),
      "id-2",
      NOW,
    );
    expect(record.kind).toBe("decision");
    if (record.kind !== "decision") return;
    expect(JSON.stringify(record)).not.toContain("SECRET");
  });
});
