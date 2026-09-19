import { describe, expect, it } from "vitest";
import { recordDecision, type DecisionAuditRecord } from "../record.js";
import { replay } from "../replay.js";
import { parseCostOfBeingWrong } from "../../cost-model/cost.js";
import { capturedAt, fixtureInput, fixtureRequirement, fixtureSignal, NOW } from "./fixtures.js";

function highCost() {
  const parsed = parseCostOfBeingWrong(100_000);
  if (!parsed.ok) throw new Error("fixture cost should be valid");
  return parsed.value;
}

const ID = "audit-1";
const RECORDED_AT = NOW;

function asDecisionRecord(input: ReturnType<typeof fixtureInput>) {
  const record = recordDecision(input, ID, RECORDED_AT);
  if (record.kind !== "decision") throw new Error("expected a DecisionAuditRecord in this test");
  return record;
}

describe("replay — reproduces the recorded decision given the same inputs and the same rule set", () => {
  it("execute: replaying with the same (empty) prohibition set matches exactly", () => {
    const input = fixtureInput({
      requirements: [fixtureRequirement({ minConfidence: 0.1 })],
      signals: [fixtureSignal({ confidence: 0.95 })],
    });
    const record = asDecisionRecord(input);
    const result = replay(record, []);

    expect(result.ruleSetMatches).toBe(true);
    expect(result.matches).toBe(true);
    expect(result.replayed).toEqual(record.decision);
  });

  it("refuse: replaying with the SAME prohibition (by id, with a real matches fn supplied fresh) matches exactly", () => {
    const prohibition = { id: "no-friday-deploys", reason: "never on a Friday", matches: () => true };
    const record = asDecisionRecord(fixtureInput({ prohibitions: [prohibition] }));

    // A fresh Prohibition object with the SAME id and an equivalent
    // predicate — never the original object reference — because a real
    // caller reconstructs prohibitions from their own rule catalog, not
    // from the record (matches can't be serialized; see ADR 0003).
    const suppliedProhibition = { id: "no-friday-deploys", reason: "never on a Friday", matches: () => true };
    const result = replay(record, [suppliedProhibition]);

    expect(result.ruleSetMatches).toBe(true);
    expect(result.matches).toBe(true);
  });
});

describe("replay — a different prohibition set is DETECTABLY different, whether or not the outcome happens to change", () => {
  it("ruleSetMatches is false when the supplied prohibition ids differ from the recorded ones", () => {
    const record = asDecisionRecord(
      fixtureInput({ prohibitions: [{ id: "rule-a", reason: "a", matches: () => true }] }),
    );

    const result = replay(record, [{ id: "rule-b", reason: "b", matches: () => true }]);
    expect(result.ruleSetMatches).toBe(false);
    // The outcome still happens to be refuse either way (both prohibitions
    // match everything) — but ruleSetMatches is false regardless, because
    // the RULE that fired is not the one this replay ran under.
    expect(result.replayed).toMatchObject({ outcome: "refuse" });
  });

  it("ruleSetMatches is false when order differs, even with the same ids (findProhibition checks in order)", () => {
    const record = asDecisionRecord(
      fixtureInput({
        prohibitions: [
          { id: "p1", reason: "1", matches: () => false },
          { id: "p2", reason: "2", matches: () => false },
        ],
      }),
    );
    const reordered = [
      { id: "p2", reason: "2", matches: () => false },
      { id: "p1", reason: "1", matches: () => false },
    ];
    const result = replay(record, reordered);
    expect(result.ruleSetMatches).toBe(false);
  });

  it("a prohibition set that actually changes the outcome is caught by BOTH ruleSetMatches and matches", () => {
    const record = asDecisionRecord(fixtureInput({ prohibitions: [] })); // execute, presumably
    expect(record.decision.outcome).not.toBe("refuse");

    const result = replay(record, [{ id: "new-rule", reason: "added after the fact", matches: () => true }]);
    expect(result.ruleSetMatches).toBe(false);
    expect(result.matches).toBe(false);
    expect(result.replayed).toMatchObject({ outcome: "refuse" });
  });
});

describe("replay — a tampered record is detected", () => {
  function tamper(record: DecisionAuditRecord, patch: Partial<DecisionAuditRecord["decision"]>): DecisionAuditRecord {
    return { ...record, decision: { ...record.decision, ...patch } as DecisionAuditRecord["decision"] };
  }

  it("a changed outcome (swapped) is detected", () => {
    const record = asDecisionRecord(
      fixtureInput({ requirements: [fixtureRequirement({ minConfidence: 0.1 })], signals: [fixtureSignal({ confidence: 0.95 })] }),
    );
    expect(record.decision.outcome).toBe("execute");
    const tampered = tamper(record, { outcome: "refuse", reason: "forged" } as never);

    const result = replay(tampered, []);
    expect(result.matches).toBe(false);
  });

  it("a changed confidence on an execute decision is detected", () => {
    const record = asDecisionRecord(
      fixtureInput({ requirements: [fixtureRequirement({ minConfidence: 0.1 })], signals: [fixtureSignal({ confidence: 0.95 })] }),
    );
    expect(record.decision.outcome).toBe("execute");
    const tampered = tamper(record, { confidence: 0.01 } as never);

    const result = replay(tampered, []);
    expect(result.matches).toBe(false);
  });

  it("a changed cost (via the action) is detected", () => {
    const record = asDecisionRecord(
      fixtureInput({ requirements: [fixtureRequirement({ minConfidence: 0.1 })], signals: [fixtureSignal({ confidence: 0.95 })] }),
    );
    const tampered: DecisionAuditRecord = {
      ...record,
      action: { ...record.action, reversibility: "irreversible", costOfBeingWrong: highCost() },
    };

    const result = replay(tampered, []);
    // Same evidence, but a far higher confidence bar under the tampered
    // action — 0.95 no longer clears it, so replay disagrees with the
    // (untouched) recorded execute decision.
    expect(result.matches).toBe(false);
  });
});

/**
 * SWEEP/FIX FINDING (see this milestone's audit fix report): every test
 * above (and every other test in this directory) uses `NOW`/`RECORDED_AT`
 * for BOTH `record.now` and the moment the test itself runs — they are
 * the same fixture constant. That makes "replay is driven by record.now"
 * and "replay is driven by a wall clock" produce IDENTICAL results
 * whenever the suite happens to run at (or near) that instant — verified:
 * replacing `record.now` with `new Date().toISOString()` inside
 * `replay()` broke only 1 of 325 tests, and re-running that same mutation
 * with the wall-clock call swapped for the literal fixture `NOW` (i.e.
 * simulating a CI run at exactly that instant) made all 325 pass despite
 * the mutation still being present. A guarantee that only holds when the
 * suite is run at a particular moment is no guarantee at all.
 *
 * This test is immune to that: it never lets replay's own `now` coincide
 * with wall-clock time at all (both `now` values below are from 2024, not
 * whenever this suite happens to run), and it proves the ONLY way replay
 * could legitimately produce different answers for the two calls is by
 * reading `record.now` — a wall clock reading `new Date()` at call time
 * would see (near enough) the SAME real instant for both calls and could
 * not manufacture the required divergence.
 */
describe("replay — driven by record.now, and nothing else (deterministic, independent of when the suite runs)", () => {
  it("two otherwise-identical records that differ ONLY in `now` replay to different results — a wall clock could not produce this divergence", () => {
    const capturedAtIso = "2024-01-01T00:00:00.000Z";
    const signal = fixtureSignal({ id: "clock-sig", confidence: 0.95, capturedAtIso });
    const requirement = fixtureRequirement({ minConfidence: 0.1, maxAgeMs: 60 * 60 * 1000 }); // 1 hour

    // Recorded at a `now` when the signal is fresh (30 minutes old) —
    // decides execute. Both `now` values here are from 2024: neither is
    // anywhere near whenever this test actually runs.
    const freshNow = capturedAt(new Date(Date.parse(capturedAtIso) + 30 * 60 * 1000).toISOString());
    const freshRecord = recordDecision(
      fixtureInput({ requirements: [requirement], signals: [signal], now: freshNow }),
      ID,
      RECORDED_AT,
    );
    if (freshRecord.kind !== "decision") throw new Error("expected a DecisionAuditRecord");
    expect(freshRecord.decision.outcome).toBe("execute");

    // The SAME record, hand-tampered so only `now` changes — to a moment
    // when the SAME signal (same evidence, same action, same
    // requirements) is stale (2 hours old, past the 1-hour maxAge).
    // Hand-tampering a record this way is this file's own established
    // convention (see the "a tampered record is detected" describe block
    // above).
    const staleNow = capturedAt(new Date(Date.parse(capturedAtIso) + 2 * 60 * 60 * 1000).toISOString());
    const staleVariant: DecisionAuditRecord = { ...freshRecord, now: staleNow };

    const freshReplay = replay(freshRecord, []);
    const staleReplay = replay(staleVariant, []);

    // Correct behavior (replay reads record.now): the fresh-now replay
    // still matches the recorded execute decision; the stale-now replay
    // does not — the same signal is too old under ITS record's `now`, so
    // it can no longer satisfy the requirement and the outcome diverges.
    expect(freshReplay.matches).toBe(true);
    expect(staleReplay.matches).toBe(false);

    // THE TEETH: both replay() calls above execute within this one test,
    // at (near enough) the same real wall-clock instant. If replay() read
    // `new Date().toISOString()` instead of `record.now`, both calls
    // would see essentially the same real `now` and would therefore have
    // to AGREE with each other — they could not land on the different
    // `matches` values asserted above, no matter what real instant the
    // suite happens to run at.
  });
});
