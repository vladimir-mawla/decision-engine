import { describe, expect, it } from "vitest";
import { analyzeGaps } from "../gap.js";
import { fixtureRequirement, fixtureSignal, NOW } from "./fixtures.js";

describe("analyzeGaps — requirements fully met", () => {
  it("every requirement satisfied by a fresh, sufficiently-confident signal yields no gaps", () => {
    const requirement = fixtureRequirement({
      signalKind: "customer.identity.verified",
      minConfidence: 0.8,
      maxAgeMs: 24 * 60 * 60 * 1000,
    });
    const signal = fixtureSignal({
      kind: "customer.identity.verified",
      confidence: 0.95,
      capturedAtIso: "2026-09-19T11:00:00Z", // 1h before NOW
    });

    const gaps = analyzeGaps([requirement], [signal], NOW);
    expect(gaps).toEqual([]);
  });
});

describe("analyzeGaps — exactly one requirement missing", () => {
  it("one missing requirement among several met yields exactly one gap, labelled with its supplier", () => {
    const met = fixtureRequirement({
      signalKind: "customer.identity.verified",
      minConfidence: 0.8,
      maxAgeMs: 24 * 60 * 60 * 1000,
      supplier: { kind: "counterparty", party: "customer" },
    });
    const metSignal = fixtureSignal({
      kind: "customer.identity.verified",
      confidence: 0.95,
      capturedAtIso: "2026-09-19T11:00:00Z",
    });

    const missing = fixtureRequirement({
      signalKind: "customer.order.exists",
      description: "the customer's order number",
      minConfidence: 0.5,
      maxAgeMs: 24 * 60 * 60 * 1000,
      supplier: { kind: "counterparty", party: "customer" },
    });

    const gaps = analyzeGaps([met, missing], [metSignal], NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("absent");
    expect(gaps[0]?.requirement.signalKind).toBe("customer.order.exists");
    expect(gaps[0]?.supplier).toEqual({ kind: "counterparty", party: "customer" });
  });
});

describe("analyzeGaps — several requirements missing, different suppliers", () => {
  it("each gap is labelled with its own requirement's supplier, not a shared default", () => {
    const askGap = fixtureRequirement({
      signalKind: "customer.order.exists",
      description: "the customer's order number",
      supplier: { kind: "counterparty", party: "customer" },
    });
    const deferGap = fixtureRequirement({
      signalKind: "payment.settlement.confirmed",
      description: "the disputed charge to settle",
      supplier: { kind: "time", waitingOn: "the payment processor's settlement window" },
    });
    const escalateGap = fixtureRequirement({
      signalKind: "compliance.sign-off",
      description: "compliance sign-off for a cross-border transfer",
      supplier: { kind: "human", reason: "no automated signal can establish regulatory sign-off" },
    });

    const gaps = analyzeGaps([askGap, deferGap, escalateGap], [], NOW);
    expect(gaps).toHaveLength(3);

    const bySignalKind = new Map(gaps.map((g) => [g.requirement.signalKind, g]));
    expect(bySignalKind.get("customer.order.exists")?.supplier).toEqual({
      kind: "counterparty",
      party: "customer",
    });
    expect(bySignalKind.get("payment.settlement.confirmed")?.supplier).toEqual({
      kind: "time",
      waitingOn: "the payment processor's settlement window",
    });
    expect(bySignalKind.get("compliance.sign-off")?.supplier).toEqual({
      kind: "human",
      reason: "no automated signal can establish regulatory sign-off",
    });

    // All three are "absent" here (nothing was supplied at all) — the
    // supplier labelling is what distinguishes them, not the gap reason.
    for (const gap of gaps) expect(gap.reason).toBe("absent");
  });
});

describe("analyzeGaps — a stale signal counts as missing, not present", () => {
  it("a signal that exists but is older than the requirement's maxAge still produces a gap", () => {
    const requirement = fixtureRequirement({
      signalKind: "customer.identity.verified",
      maxAgeMs: 30 * 60 * 1000, // 30 minutes
      supplier: { kind: "counterparty", party: "customer" },
    });
    // Captured 2 hours before NOW — well past the 30-minute threshold.
    const staleSignal = fixtureSignal({
      kind: "customer.identity.verified",
      confidence: 0.99,
      capturedAtIso: "2026-09-19T10:00:00Z",
    });

    const gaps = analyzeGaps([requirement], [staleSignal], NOW);

    // The critical assertion: presence of a matching signal did NOT
    // satisfy the requirement. A stale signal is not a satisfied
    // requirement wearing an asterisk — it is a Gap, full stop.
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("stale");
    if (gaps[0]?.reason === "stale") {
      expect(gaps[0].signal.id).toBe(staleSignal.id);
      expect(gaps[0].age).toBe(2 * 60 * 60 * 1000);
    }
  });

  it("the same evidence set: satisfied under a lenient maxAge, a gap under a strict one", () => {
    const signal = fixtureSignal({
      kind: "customer.identity.verified",
      confidence: 0.99,
      capturedAtIso: "2026-09-19T10:00:00Z", // 2h before NOW
    });

    const lenient = fixtureRequirement({ signalKind: "customer.identity.verified", maxAgeMs: 24 * 60 * 60 * 1000 });
    const strict = fixtureRequirement({ signalKind: "customer.identity.verified", maxAgeMs: 5 * 60 * 1000 });

    expect(analyzeGaps([lenient], [signal], NOW)).toEqual([]);
    expect(analyzeGaps([strict], [signal], NOW)).toHaveLength(1);
  });
});

describe("analyzeGaps — a signal present but below the required confidence", () => {
  it("produces a below-confidence gap, not a satisfied requirement", () => {
    const requirement = fixtureRequirement({
      signalKind: "customer.identity.verified",
      minConfidence: 0.9,
      maxAgeMs: 24 * 60 * 60 * 1000,
    });
    const weakSignal = fixtureSignal({
      kind: "customer.identity.verified",
      confidence: 0.4,
      capturedAtIso: "2026-09-19T11:00:00Z",
    });

    const gaps = analyzeGaps([requirement], [weakSignal], NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("below-confidence");
    if (gaps[0]?.reason === "below-confidence") {
      expect(gaps[0].actualConfidence).toBe(0.4);
      expect(gaps[0].signal.id).toBe(weakSignal.id);
    }
  });

  it("a fresh signal exactly at the confidence bar counts as satisfying it (>=, not >)", () => {
    const requirement = fixtureRequirement({ signalKind: "k", minConfidence: 0.8, maxAgeMs: 24 * 60 * 60 * 1000 });
    const atBar = fixtureSignal({ kind: "k", confidence: 0.8, capturedAtIso: "2026-09-19T11:00:00Z" });
    expect(analyzeGaps([requirement], [atBar], NOW)).toEqual([]);
  });
});

describe("analyzeGaps is a pure function of (requirements, available signals, now)", () => {
  it("calling it twice with the same inputs yields deep-equal results", () => {
    const requirement = fixtureRequirement({ signalKind: "k", maxAgeMs: 60 * 60 * 1000 });
    const signals = [fixtureSignal({ kind: "k", confidence: 0.5, capturedAtIso: "2026-09-19T10:00:00Z" })];

    const first = analyzeGaps([requirement], signals, NOW);
    const second = analyzeGaps([requirement], signals, NOW);
    expect(first).toEqual(second);
  });

  it("does not mutate its inputs", () => {
    const requirement = fixtureRequirement({ signalKind: "k", maxAgeMs: 60 * 60 * 1000 });
    const signals = [fixtureSignal({ kind: "k", confidence: 0.5, capturedAtIso: "2026-09-19T10:00:00Z" })];
    const requirementsSnapshot = JSON.stringify([requirement]);

    analyzeGaps([requirement], signals, NOW);

    expect(JSON.stringify([requirement])).toBe(requirementsSnapshot);
    expect(signals).toHaveLength(1);
  });
});
