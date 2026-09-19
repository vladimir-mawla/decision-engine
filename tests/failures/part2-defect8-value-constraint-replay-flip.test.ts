import { describe, expect, it } from "vitest";
import { recordDecision } from "../../lib/audit/record.js";
import { replay } from "../../lib/audit/replay.js";
import { decide } from "../../lib/decide/decide.js";
import { makeAction, makeInput, makeRequirement, makeSignal, NOW } from "./helpers.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * PART TWO — REGRESSION: real historical defect, value-constraints (ADR 0004)
 * ══════════════════════════════════════════════════════════════════════
 * DEFECT (found by the SECOND independent verification of the
 * value-constraints change): a metadata-only `replay()` reconstructs every
 * evidence signal with the `UNDISCLOSED_VALUE` sentinel (never the real
 * value, by design — see snapshot.ts). For a decision that never depended
 * on a value constraint, that is perfectly sound. But `UNDISCLOSED_VALUE`
 * fails EVERY constraint operator by construction (it is a symbol, not a
 * comparable primitive) — so replaying a record where some OTHER,
 * unrelated requirement was satisfied via a value constraint manufactures
 * a BRAND NEW `"constraint-violated"` Gap that never existed in the
 * original decision. Because a value rejection is given the HIGHEST
 * precedence of all Gap reasons (ranked -1, ahead of even `human` at 0 —
 * lib/decide/precedence.ts's DECISION 7), that fabricated Gap can WIN over
 * a real, original Gap for a completely different requirement — flipping
 * the reported OUTCOME KIND, not just failing to reproduce an `execute`.
 * ADR 0004 Decision 5's own two-requirement reproduction is exactly this:
 * a recorded `ask` replays as `escalate`.
 *
 * THE FIX (not undone by this test — `knownSignals`, replay.ts's third,
 * optional parameter): a caller holding the real original signals can
 * supply them, matched against the recorded snapshot by id AND metadata,
 * to get full-fidelity replay. Omitting it is always safe (never a false
 * match) but never sound for a value-constraint-dependent decision either
 * — this is a documented, load-bearing LIMITATION, not a bug metadata-only
 * replay is expected to paper over.
 */
describe("REGRESSION (value-constraints) — metadata-only replay can flip a recorded `ask` into `escalate`", () => {
  const constraintSatisfiedRequirement = makeRequirement({
    signalKind: "fraud.assessment",
    description: "the fraud assessment on this order",
    minConfidence: 0.5,
    supplier: { kind: "human", reason: "unused: this requirement is satisfied and produces no Gap" },
    valueConstraint: { op: "equals", value: "clean" },
  });

  const counterpartyGapRequirement = makeRequirement({
    signalKind: "customer.orderNumber.confirmed",
    description: "the customer's order number",
    minConfidence: 0.5,
    supplier: { kind: "counterparty", party: "the customer" },
    // No matching signal supplied below — genuinely absent, producing an
    // ordinary `ask` gap in the ORIGINAL decision.
  });

  const fraudSignal = makeSignal({
    id: "sig-fraud-clean",
    kind: "fraud.assessment",
    value: "clean",
    confidence: 0.9,
  });

  const action = makeAction({ reversibility: "reversible-with-cost", cost: 500 });
  const input = makeInput({
    action,
    requirements: [constraintSatisfiedRequirement, counterpartyGapRequirement],
    signals: [fraudSignal],
    now: NOW,
  });

  it("THE ORIGINAL DECISION: the constraint-satisfied requirement contributes no Gap; the missing order number produces an ordinary `ask`", () => {
    const decision = decide(input);
    expect(decision.outcome).toBe("ask");
  });

  it("THE BREAK: metadata-only replay (no knownSignals) fabricates a constraint-violated Gap for the SATISFIED requirement and it outranks the real `ask` gap, flipping the outcome to `escalate`", () => {
    const record = recordDecision(input, "audit-flip-1", NOW);
    expect(record.kind).toBe("decision");
    if (record.kind !== "decision") return;
    expect(record.decision.outcome).toBe("ask");

    const result = replay(record, []); // no knownSignals — the default, and the common case
    expect(result.matches).toBe(false);
    expect(result.replayed.outcome).toBe("escalate");
    if (result.replayed.outcome === "escalate") {
      // Confirm it is specifically the value-rejected cause, not a
      // coincidental human-gap escalate — the fabricated Gap, not a
      // reasonable reinterpretation of the real one.
      expect(result.replayed.missing.reason).toMatch(/does not satisfy that constraint/);
    }
  });

  it("THE FIX IN ACTION: supplying knownSignals with the REAL, matching-metadata signal restores full-fidelity replay", () => {
    const record = recordDecision(input, "audit-flip-2", NOW);
    if (record.kind !== "decision") throw new Error("expected a decision record");

    const result = replay(record, [], [fraudSignal]);
    expect(result.matches).toBe(true);
    expect(result.replayed.outcome).toBe("ask");
  });

  it("WHAT THE AUDIT TRAIL PRESERVES EITHER WAY: the RuleTrace and requirements are intact, so a reviewer comparing both replays can SEE exactly which requirement's value constraint caused the divergence", () => {
    const record = recordDecision(input, "audit-flip-3", NOW);
    if (record.kind !== "decision") throw new Error("expected a decision record");

    const withoutKnownSignals = replay(record, []);
    const withKnownSignals = replay(record, [], [fraudSignal]);

    expect(withoutKnownSignals.matches).toBe(false);
    expect(withKnownSignals.matches).toBe(true);
    // The recorded requirements (including the constraint itself) are
    // preserved verbatim on the record regardless of which replay path is
    // taken — a human comparing the two ReplayResults can reconstruct
    // exactly why they diverge without needing anything beyond the record.
    expect(record.requirements).toHaveLength(2);
    expect(record.requirements.some((r) => r.valueConstraint?.op === "equals")).toBe(true);
  });
});
