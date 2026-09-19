import { describe, expect, it } from "vitest";
import { decide } from "../decide.js";
import { fixtureInput, fixtureRequirement, fixtureSignal, sampleAction } from "./fixtures.js";
import type { Requirement } from "../../signals/requirement.js";

/**
 * End-to-end `decide()` coverage for value constraints
 * (`.genesis/decisions/0004-value-constraints.md`). `lib/signals/
 * __tests__/gap-analysis.test.ts` and `lib/signals/__tests__/
 * constraint.test.ts` already cover the mechanism (Gap production,
 * operator evaluation) in isolation; this file is where the milestone's
 * headline claim gets proven THROUGH the full engine: the content of a
 * signal's value now actually changes the outcome.
 */

const FRAUD_REQUIREMENT: Requirement = fixtureRequirement({
  signalKind: "fraud.assessment",
  description: "the fraud assessment for this transfer",
  minConfidence: 0.8,
  maxAgeMs: 24 * 60 * 60 * 1000,
  supplier: { kind: "human", reason: "no automated signal can establish a fraud verdict without a defined constraint" },
  valueConstraint: { op: "equals", value: "clear" },
});

function fraudSignal(value: string): ReturnType<typeof fixtureSignal> {
  return fixtureSignal({
    kind: "fraud.assessment",
    value,
    confidence: 0.95,
    capturedAtIso: "2026-09-19T11:00:00Z",
  });
}

describe("decide() — the headline claim: the content of a signal's value now affects the outcome", () => {
  it("fraud assessment = CLEAN -> execute", () => {
    const result = decide(
      fixtureInput({ requirements: [FRAUD_REQUIREMENT], signals: [fraudSignal("clear")] }),
    );
    expect(result.outcome).toBe("execute");
  });

  it("fraud assessment = FRAUDULENT — stolen card -> NOT execute (a different outcome for a different value)", () => {
    const result = decide(
      fixtureInput({ requirements: [FRAUD_REQUIREMENT], signals: [fraudSignal("fraudulent — stolen card")] }),
    );
    expect(result.outcome).not.toBe("execute");
    expect(result.outcome).toBe("escalate");
  });

  it("the escalate reason names the rejection honestly — never reused verbatim from the cost-ceiling/insufficient-now wording, never containing the raw value", () => {
    const result = decide(
      fixtureInput({ requirements: [FRAUD_REQUIREMENT], signals: [fraudSignal("fraudulent — stolen card, acct 4111")] }),
    );
    expect(result.outcome).toBe("escalate");
    if (result.outcome === "escalate") {
      expect(result.missing.reason).toContain("fraud.assessment");
      expect(result.missing.reason).toContain("constraint");
      expect(result.missing.reason).not.toContain("4111");
      expect(result.missing.reason).not.toContain("stolen card");
      // Not the cost-ceiling/insufficient-now vocabulary — this is a
      // distinct cause, and must not read as either of those two.
      expect(result.missing.reason).not.toContain("ceiling");
      expect(result.missing.reason).not.toContain("aggregate confidence");
    }
  });

  it("evidence carries the real signals (no-outcome-without-signals), never an empty array, for a value-rejection escalate", () => {
    const signal = fraudSignal("fraudulent");
    const result = decide(fixtureInput({ requirements: [FRAUD_REQUIREMENT], signals: [signal] }));
    expect(result.outcome).toBe("escalate");
    expect(result.evidence).toEqual([signal]);
  });
});

describe("decide() — a constraint runs only after freshness and confidence already passed", () => {
  it("a stale fraud signal escalates via the ORDINARY time-gap path (human supplier here), never as a value rejection", () => {
    const staleRequirement = fixtureRequirement({
      signalKind: "fraud.assessment",
      maxAgeMs: 5 * 60 * 1000, // 5 minutes
      supplier: { kind: "human", reason: "no automated signal can establish a fraud verdict" },
      valueConstraint: { op: "equals", value: "clear" },
    });
    const staleClean = fixtureSignal({
      kind: "fraud.assessment",
      value: "clear", // would have cleared the constraint if it had been read
      confidence: 0.95,
      capturedAtIso: "2026-09-19T10:00:00Z", // 2h before NOW — stale
    });

    const result = decide(fixtureInput({ requirements: [staleRequirement], signals: [staleClean] }));
    expect(result.outcome).toBe("escalate");
    if (result.outcome === "escalate") {
      // The human-supplier gap reason (requirement.ts's own text), not the
      // value-rejection wording — proves staleness pre-empted the
      // constraint entirely rather than the constraint firing on stale
      // evidence.
      expect(result.missing.reason).toBe("no automated signal can establish a fraud verdict");
    }
  });

  it("a below-confidence fraud signal is still an ordinary gap, never a value rejection", () => {
    const strictRequirement = fixtureRequirement({
      signalKind: "fraud.assessment",
      minConfidence: 0.99,
      supplier: { kind: "counterparty", party: "customer" },
      valueConstraint: { op: "equals", value: "clear" },
    });
    const weakClean = fixtureSignal({
      kind: "fraud.assessment",
      value: "clear",
      confidence: 0.5,
      capturedAtIso: "2026-09-19T11:00:00Z",
    });

    const result = decide(fixtureInput({ requirements: [strictRequirement], signals: [weakClean] }));
    expect(result.outcome).toBe("ask");
  });
});

describe("decide() — precedence: a value rejection coexists with another gap of each supplier kind", () => {
  const otherSignalless = (supplierKind: "human" | "counterparty" | "time"): Requirement =>
    fixtureRequirement({
      signalKind: `other.${supplierKind}.requirement`,
      description: `an unrelated ${supplierKind}-supplied fact`,
      supplier:
        supplierKind === "human"
          ? { kind: "human", reason: "an unrelated human sign-off is also missing" }
          : supplierKind === "counterparty"
            ? { kind: "counterparty", party: "customer" }
            : { kind: "time", waitingOn: "an unrelated settlement" },
    });

  it("value rejection outranks a simultaneous human gap", () => {
    const result = decide(
      fixtureInput({
        requirements: [FRAUD_REQUIREMENT, otherSignalless("human")],
        signals: [fraudSignal("fraudulent")],
      }),
    );
    expect(result.outcome).toBe("escalate");
    if (result.outcome === "escalate") {
      expect(result.missing.reason).toContain("fraud.assessment");
      expect(result.missing.reason).not.toBe("an unrelated human sign-off is also missing");
    }
  });

  it("value rejection outranks a simultaneous counterparty gap", () => {
    const result = decide(
      fixtureInput({
        requirements: [FRAUD_REQUIREMENT, otherSignalless("counterparty")],
        signals: [fraudSignal("fraudulent")],
      }),
    );
    // Without the value-rejection precedence rule this would be `ask`
    // (counterparty gaps normally beat a mere missing fact); with it, the
    // present-and-negative evidence wins instead.
    expect(result.outcome).toBe("escalate");
  });

  it("value rejection outranks a simultaneous time gap", () => {
    const result = decide(
      fixtureInput({
        requirements: [FRAUD_REQUIREMENT, otherSignalless("time")],
        signals: [fraudSignal("fraudulent")],
      }),
    );
    expect(result.outcome).toBe("escalate");
  });
});

describe("decide() — fail closed for a value constraint, exactly like every other input shape", () => {
  it("never throws for a malformed constraint (unknown op)", () => {
    const requirement = fixtureRequirement({
      signalKind: "k",
      valueConstraint: { op: "regex-match", value: ".*" } as never,
    });
    const signal = fixtureSignal({ kind: "k", value: "anything", capturedAtIso: "2026-09-19T11:00:00Z" });

    expect(() => decide(fixtureInput({ requirements: [requirement], signals: [signal] }))).not.toThrow();
    const result = decide(fixtureInput({ requirements: [requirement], signals: [signal] }));
    expect(result.outcome).not.toBe("execute");
  });

  it("never throws when the signal's disclosed value is an object with a throwing getter of its own", () => {
    const requirement = fixtureRequirement({ signalKind: "k", valueConstraint: { op: "equals", value: "clear" } });
    // `evaluateConstraint` never reaches into a non-primitive value's own
    // properties (equals/lte/gte/in all check `typeof` first) — so this
    // resolves to a plain type-mismatch without ever touching `bad`, and
    // the point of this test is exactly that: a value shaped like this
    // must never cause decide() to throw, whether or not its internals
    // are ever actually read.
    const hostileValue = {
      get bad(): never {
        throw new Error("radioactive value");
      },
    };
    const signal = fixtureSignal({ kind: "k", value: hostileValue, capturedAtIso: "2026-09-19T11:00:00Z" });

    expect(() => decide(fixtureInput({ requirements: [requirement], signals: [signal] }))).not.toThrow();
    const result = decide(fixtureInput({ requirements: [requirement], signals: [signal] }));
    expect(result.outcome).not.toBe("execute");
  });

  it("never throws when the signal's value is a Proxy that throws on every property access", () => {
    const requirement = fixtureRequirement({ signalKind: "k", valueConstraint: { op: "equals", value: "clear" } });
    const proxyValue = new Proxy(
      { anything: true },
      {
        get() {
          throw new Error("radioactive proxy value");
        },
      },
    );
    const signal = fixtureSignal({ kind: "k", value: proxyValue, capturedAtIso: "2026-09-19T11:00:00Z" });

    expect(() => decide(fixtureInput({ requirements: [requirement], signals: [signal] }))).not.toThrow();
  });

  it("is still a pure function of its inputs for a value-rejection decision — same input twice, same output", () => {
    const input = fixtureInput({ requirements: [FRAUD_REQUIREMENT], signals: [fraudSignal("fraudulent")] });
    const first = decide(input);
    const second = decide(input);
    expect(first).toEqual(second);
  });

  it("a requirement with NO valueConstraint declared behaves exactly as before — backward compatible by construction", () => {
    const requirement = fixtureRequirement({ signalKind: "k", minConfidence: 0.8, maxAgeMs: 60 * 60 * 1000 });
    const signal = fixtureSignal({ kind: "k", confidence: 0.9, capturedAtIso: "2026-09-19T11:00:00Z" });

    const result = decide(fixtureInput({ requirements: [requirement], signals: [signal] }));
    expect(result.outcome).toBe("execute");
  });

  it("a value constraint can still coexist with the reversibility x cost bar: high confidence clears an expensive, irreversible action's bar even with a constraint declared", () => {
    const expensive = sampleAction({ cost: 500_000, reversibility: "irreversible" });
    const veryConfidentClean = fixtureSignal({
      kind: "fraud.assessment",
      value: "clear",
      confidence: 1, // Confidence's own maximum — always clears any bar this model can produce.
      capturedAtIso: "2026-09-19T11:00:00Z",
    });

    const result = decide(
      fixtureInput({ action: expensive, requirements: [FRAUD_REQUIREMENT], signals: [veryConfidentClean] }),
    );
    expect(result.outcome).toBe("execute");
  });
});
