import { describe, expect, it } from "vitest";
import { decide } from "../decide.js";
import { fixtureInput, fixtureRequirement, fixtureSignal } from "./fixtures.js";

/**
 * Milestone success criterion: "every `ask` names the one specific fact
 * the counterparty must supply."
 */
describe("ask — names the one specific fact and the counterparty who holds it", () => {
  it("the missing fact is the requirement's own description, verbatim, and counterparty is the requirement's supplier.party", () => {
    const requirement = fixtureRequirement({
      signalKind: "customer.order-number",
      description: "the customer's order number for this refund",
      supplier: { kind: "counterparty", party: "the customer" },
    });

    const decision = decide(fixtureInput({ requirements: [requirement], signals: [] }));

    expect(decision.outcome).toBe("ask");
    if (decision.outcome === "ask") {
      expect(decision.missing.kind).toBe("fact");
      expect(decision.missing.fact).toBe("the customer's order number for this refund");
      expect(decision.missing.counterparty).toBe("the customer");
    }
  });

  it("with several unmet counterparty requirements, exactly one fact is named — not a list, not a summary", () => {
    const a = fixtureRequirement({
      signalKind: "customer.order-number",
      description: "the order number",
      supplier: { kind: "counterparty", party: "customer" },
    });
    const b = fixtureRequirement({
      signalKind: "customer.shipping-address",
      description: "the shipping address",
      supplier: { kind: "counterparty", party: "customer" },
    });

    const decision = decide(fixtureInput({ requirements: [a, b], signals: [] }));

    expect(decision.outcome).toBe("ask");
    if (decision.outcome === "ask") {
      // Exactly one of the two, chosen deterministically (first occurrence
      // — see precedence.ts), never both concatenated into a vague ask.
      expect(["the order number", "the shipping address"]).toContain(decision.missing.fact);
      expect(decision.missing.fact).toBe("the order number");
    }
  });

  it("a stale (not merely absent) signal for the same requirement still produces an ask naming the same fact", () => {
    const requirement = fixtureRequirement({
      signalKind: "customer.order-number",
      description: "the order number",
      maxAgeMs: 60 * 60 * 1000, // 1h
      supplier: { kind: "counterparty", party: "customer" },
    });
    // Captured 3h before fixtures.NOW — older than the 1h maxAge above.
    const staleSignal = fixtureSignal({
      kind: "customer.order-number",
      confidence: 0.95,
      capturedAtIso: "2026-09-19T09:00:00.000Z",
    });

    const decision = decide(fixtureInput({ requirements: [requirement], signals: [staleSignal] }));

    expect(decision.outcome).toBe("ask");
    if (decision.outcome === "ask") expect(decision.missing.fact).toBe("the order number");
  });
});
