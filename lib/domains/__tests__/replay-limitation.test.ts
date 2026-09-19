import { describe, expect, it } from "vitest";
import { recordDecision } from "../../audit/record.js";
import { replay } from "../../audit/replay.js";
import { refundApproval } from "../refund-approval/domain.js";
import { toDecideInput } from "../shared/test-helpers.js";

/**
 * ADR 0004's amendment documents a real, honest limitation: a value
 * constraint that was SATISFIED and contributed to the recorded outcome
 * cannot replay from the audit record's metadata alone —
 * `fromSignalSnapshot`'s `UNDISCLOSED_VALUE` sentinel fails every operator
 * by construction, which can manufacture a `constraint-violated` Gap at
 * replay time that outranks every other Gap (including, per the
 * amendment, flipping an `ask` into an `escalate`). This is not a defect
 * in this project's own domains — it is a documented property of
 * `lib/audit/replay.ts`'s two-argument form, and `knownSignals` (the
 * three-argument form) exists specifically to close it for a caller who
 * legitimately holds the original signals.
 *
 * This file exists so that fact is exercised through THIS project's own
 * data, not merely cited from the ADR: it proves BOTH halves — the
 * documented `matches: false` without `knownSignals`, and the exact
 * replay `assertCaseDecidesAndReplaysAsExpected` (used by every other
 * test in this package) relies on WITH it — so a reader can see the
 * mechanism work both ways rather than only ever seeing the passing path.
 */
describe("documented ADR 0004 replay limitation, exercised through refund-approval's R1", () => {
  const r1 = refundApproval.cases.find((c) => c.id === "refund-r1-clean-approval")!;

  it("R1 executes because its fraud-assessment value constraint (equals \"clear\") is SATISFIED — a real value, not a Gap", () => {
    const input = toDecideInput(r1);
    const record = recordDecision(input, "audit-replay-doc-1", r1.now);
    expect(record.kind).toBe("decision");
    if (record.kind === "decision") {
      expect(record.decision.outcome).toBe("execute");
    }
  });

  it("replaying WITHOUT knownSignals reports matches:false — metadata alone cannot reconstruct that the fraud signal's value was actually \"clear\"", () => {
    const input = toDecideInput(r1);
    const record = recordDecision(input, "audit-replay-doc-2", r1.now);
    if (record.kind !== "decision") throw new Error("expected a decision record");

    const result = replay(record, r1.prohibitions); // no knownSignals
    expect(result.ruleSetMatches).toBe(true); // the rule SET still matches; only the value-dependent outcome doesn't.
    expect(result.matches).toBe(false);
    // Honest, not silently wrong: replay still reports a real (if
    // different) outcome, never a crash and never a fabricated "true".
    expect(result.replayed.outcome).not.toBe("input-rejected");
  });

  it("replaying WITH knownSignals (the original signals, supplied fresh, in-process) reproduces the recorded execute exactly", () => {
    const input = toDecideInput(r1);
    const record = recordDecision(input, "audit-replay-doc-3", r1.now);
    if (record.kind !== "decision") throw new Error("expected a decision record");

    const result = replay(record, r1.prohibitions, r1.signals);
    expect(result.matches).toBe(true);
    expect(result.replayed.outcome).toBe("execute");
  });
});
