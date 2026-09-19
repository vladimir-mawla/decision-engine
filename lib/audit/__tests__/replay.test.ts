import { describe, expect, it } from "vitest";
import { recordDecision, type DecisionAuditRecord } from "../record.js";
import { replay } from "../replay.js";
import { parseCostOfBeingWrong } from "../../cost-model/cost.js";
import { fixtureInput, fixtureRequirement, fixtureSignal, NOW } from "./fixtures.js";

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
