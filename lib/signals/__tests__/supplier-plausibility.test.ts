import { describe, expect, it } from "vitest";
import { checkHumanSupplierAgainstSatisfyingSignal } from "../supplier-plausibility.js";
import { fixtureRequirement, fixtureSignal } from "./fixtures.js";

/**
 * FIX 2 — this is deliberately a narrow, honest check, not a general
 * "does supplier match intent" validator (no such thing can exist
 * mechanically; see requirement.ts's and supplier-plausibility.ts's own
 * doc comments). These tests exercise exactly the one case it claims to
 * catch, and confirm every other combination is left alone.
 */
describe("checkHumanSupplierAgainstSatisfyingSignal", () => {
  it("flags a human-supplier requirement satisfied by a bare counterparty self-report", () => {
    const requirement = fixtureRequirement({
      signalKind: "compliance.sign-off",
      supplier: { kind: "human", reason: "no automated signal can establish regulatory sign-off" },
    });
    const counterpartyClaim = fixtureSignal({
      kind: "compliance.sign-off",
      source: { kind: "counterparty", party: "customer" },
    });

    const hazard = checkHumanSupplierAgainstSatisfyingSignal(requirement, counterpartyClaim);

    expect(hazard).toEqual({
      kind: "human-supplier-satisfied-by-counterparty-claim",
      requirement,
      signal: counterpartyClaim,
    });
  });

  it("does not flag a human-supplier requirement satisfied by a system, human, or derived signal", () => {
    const requirement = fixtureRequirement({
      signalKind: "compliance.sign-off",
      supplier: { kind: "human", reason: "no automated signal can establish regulatory sign-off" },
    });

    for (const source of [
      { kind: "system" as const, system: "compliance-engine" },
      { kind: "human" as const, who: "compliance-reviewer-1" },
      { kind: "derived" as const, rule: "compliance-rollup", inputs: ["sig-1"] },
    ]) {
      const signal = fixtureSignal({ kind: "compliance.sign-off", source });
      expect(checkHumanSupplierAgainstSatisfyingSignal(requirement, signal)).toBeNull();
    }
  });

  it("does not flag a counterparty- or time-supplier requirement, even against a counterparty claim", () => {
    const counterpartySupplied = fixtureRequirement({
      signalKind: "customer.order.exists",
      supplier: { kind: "counterparty", party: "customer" },
    });
    const timeSupplied = fixtureRequirement({
      signalKind: "payment.settlement.confirmed",
      supplier: { kind: "time", waitingOn: "the payment processor's settlement window" },
    });
    const counterpartyClaim = fixtureSignal({
      kind: "customer.order.exists",
      source: { kind: "counterparty", party: "customer" },
    });

    // Deliberately not covered — see supplier-plausibility.ts's "WHAT THIS
    // DOES NOT CHECK" note. This isn't a false negative; it's the honest
    // boundary of what this check claims to do.
    expect(checkHumanSupplierAgainstSatisfyingSignal(counterpartySupplied, counterpartyClaim)).toBeNull();
    expect(checkHumanSupplierAgainstSatisfyingSignal(timeSupplied, counterpartyClaim)).toBeNull();
  });
});
