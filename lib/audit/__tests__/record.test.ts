import { describe, expect, it } from "vitest";
import { recordDecision } from "../record.js";
import { discloseSignalValue } from "../disclose.js";
import { fixtureInput, fixtureRequirement, fixtureSignal, NOW } from "./fixtures.js";

const ID = "audit-1";
const RECORDED_AT = NOW;

describe("recordDecision — a full audit trail per decision", () => {
  it("records id and recordedAt verbatim, exactly as supplied (never generated internally)", () => {
    const record = recordDecision(fixtureInput(), ID, RECORDED_AT);
    expect(record.id).toBe(ID);
    expect(record.recordedAt).toBe(RECORDED_AT);
  });

  it("no-outcome-without-signals: the record carries the exact evidence, not just the verdict", () => {
    const signal = fixtureSignal({ id: "sig-a", confidence: 0.95 });
    const record = recordDecision(
      fixtureInput({ requirements: [fixtureRequirement({ minConfidence: 0.1 })], signals: [signal] }),
      ID,
      RECORDED_AT,
    );
    expect(record.kind).toBe("decision");
    if (record.kind === "decision") {
      expect(record.decision.outcome).toBe("execute");
      expect(record.decision.evidence).toEqual([
        { id: "sig-a", kind: signal.kind, source: signal.source, capturedAt: signal.capturedAt, confidence: signal.confidence },
      ]);
    }
  });

  it("never discloses a signal's value — the record's evidence is metadata only, even when the underlying signal carries something sensitive", () => {
    const sensitive = fixtureSignal({ id: "sig-sensitive", value: { ssn: "000-00-0000" }, confidence: 0.95 });
    const record = recordDecision(
      fixtureInput({ requirements: [fixtureRequirement({ minConfidence: 0.1 })], signals: [sensitive] }),
      ID,
      RECORDED_AT,
    );
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("000-00-0000");
    expect(serialized).not.toContain("ssn");
  });

  it("disclosure remains available, separately and by name, for a caller who deliberately wants it", () => {
    const sensitive = fixtureSignal({ id: "sig-sensitive-2", value: 12345, confidence: 0.95 });
    const record = recordDecision(
      fixtureInput({ requirements: [fixtureRequirement({ minConfidence: 0.1 })], signals: [sensitive] }),
      ID,
      RECORDED_AT,
    );
    expect(JSON.stringify(record)).not.toContain("12345");
    const disclosure = discloseSignalValue(sensitive, fixtureRequirement().maxAge, NOW);
    expect(disclosure.reading.status).toBe("fresh");
    if (disclosure.reading.status === "fresh") {
      expect(disclosure.reading.value).toBe(12345);
    }
  });

  it("names the exact rule that fired, alongside the outcome", () => {
    const record = recordDecision(
      fixtureInput({ prohibitions: [{ id: "no-frozen", reason: "account frozen", matches: () => true }] }),
      ID,
      RECORDED_AT,
    );
    expect(record.kind).toBe("decision");
    if (record.kind === "decision") {
      expect(record.decision.outcome).toBe("refuse");
      expect(record.rule).toEqual({ kind: "prohibition", prohibitionId: "no-frozen", reason: "account frozen" });
    }
  });

  it("records the prohibition ids in order, standing in for the un-serializable `matches` predicates", () => {
    const record = recordDecision(
      fixtureInput({
        prohibitions: [
          { id: "p1", reason: "r1", matches: () => false },
          { id: "p2", reason: "r2", matches: () => false },
        ],
      }),
      ID,
      RECORDED_AT,
    );
    expect(record.kind).toBe("decision");
    if (record.kind === "decision") {
      expect(record.prohibitionIds).toEqual(["p1", "p2"]);
    }
  });

  it("records requirements and now verbatim, lossless (plain data, no functions)", () => {
    const requirement = fixtureRequirement({ signalKind: "x", minConfidence: 0.1 });
    const record = recordDecision(fixtureInput({ requirements: [requirement], now: NOW }), ID, RECORDED_AT);
    expect(record.kind).toBe("decision");
    if (record.kind === "decision") {
      expect(record.requirements).toEqual([requirement]);
      expect(record.now).toBe(NOW);
    }
  });

  it("carries no snapshotWarnings for an ordinary, well-formed input", () => {
    const record = recordDecision(fixtureInput(), ID, RECORDED_AT);
    expect(record.kind).toBe("decision");
    if (record.kind === "decision") {
      expect(record.snapshotWarnings).toEqual([]);
    }
  });
});
