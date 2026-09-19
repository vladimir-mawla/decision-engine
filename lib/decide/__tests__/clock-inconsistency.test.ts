import { describe, expect, it } from "vitest";
import { decide } from "../decide.js";
import { capturedAt, fixtureInput, fixtureRequirement, fixtureSignal } from "./fixtures.js";

/**
 * DECISION 6 — what decide() does with a signal whose age is unknowable
 * (M3's "clock-inconsistency", returned for future-dated observations).
 *
 * Setup mirrors lib/signals/__tests__/gap-analysis.test.ts's own
 * clock-inconsistency fixtures exactly: a signal's `capturedAt` (11:59) is
 * valid relative to its OWN constructing clock (12:00, fixtures.NOW), but
 * decide() is then called with an EARLIER `now` (11:30) than that
 * `capturedAt` — a caller-side clock inconsistency.
 */
describe("clock-inconsistency — DECISION 6: escalates instead of an honest-but-impossible defer", () => {
  const earlierNow = capturedAt("2026-09-19T11:30:00Z");

  it("a time-supplied requirement whose only candidate is clock-inconsistent escalates, not defers", () => {
    const requirement = fixtureRequirement({
      signalKind: "payment.settlement-status",
      maxAgeMs: 30 * 60 * 1000,
      supplier: { kind: "time", waitingOn: "the disputed charge to settle" },
    });
    const futureDatedSignal = fixtureSignal({
      kind: "payment.settlement-status",
      confidence: 0.99,
      capturedAtIso: "2026-09-19T11:59:00Z", // after earlierNow
    });

    const decision = decide(
      fixtureInput({ requirements: [requirement], signals: [futureDatedSignal], now: earlierNow }),
    );

    expect(decision.outcome).toBe("escalate");
    if (decision.outcome === "escalate") {
      expect(decision.missing.reason).toMatch(/clock/i);
      expect(decision.missing.reason).toContain("payment.settlement-status");
    }
  });

  it("never silently treated as fresh: it does not execute, and it does not defer with a fabricated reconsiderAt", () => {
    const requirement = fixtureRequirement({
      signalKind: "payment.settlement-status",
      minConfidence: 0.5,
      maxAgeMs: 30 * 60 * 1000,
      supplier: { kind: "time", waitingOn: "settlement" },
    });
    const futureDatedSignal = fixtureSignal({
      kind: "payment.settlement-status",
      confidence: 0.99,
      capturedAtIso: "2026-09-19T11:59:00Z",
    });

    const decision = decide(
      fixtureInput({ requirements: [requirement], signals: [futureDatedSignal], now: earlierNow }),
    );

    expect(decision.outcome).not.toBe("execute");
    expect(decision.outcome).not.toBe("defer");
  });

  it("a clock-inconsistent candidate for a counterparty-supplied requirement still asks normally — the anomaly only blocks defer's reconsiderAt", () => {
    const requirement = fixtureRequirement({
      signalKind: "customer.identity.verified",
      description: "the customer's verified identity",
      maxAgeMs: 30 * 60 * 1000,
      supplier: { kind: "counterparty", party: "customer" },
    });
    const futureDatedSignal = fixtureSignal({
      kind: "customer.identity.verified",
      confidence: 0.99,
      capturedAtIso: "2026-09-19T11:59:00Z",
    });

    const decision = decide(
      fixtureInput({ requirements: [requirement], signals: [futureDatedSignal], now: earlierNow }),
    );

    expect(decision.outcome).toBe("ask");
    if (decision.outcome === "ask") {
      expect(decision.missing.fact).toBe("the customer's verified identity");
    }
  });

  it("a clock-inconsistent candidate for a human-supplied requirement still escalates via the ordinary human-gap reason, not the clock-specific one", () => {
    const requirement = fixtureRequirement({
      signalKind: "compliance.sign-off",
      maxAgeMs: 30 * 60 * 1000,
      supplier: { kind: "human", reason: "cross-border transfers always need a human sign-off" },
    });
    const futureDatedSignal = fixtureSignal({
      kind: "compliance.sign-off",
      confidence: 0.99,
      capturedAtIso: "2026-09-19T11:59:00Z",
    });

    const decision = decide(
      fixtureInput({ requirements: [requirement], signals: [futureDatedSignal], now: earlierNow }),
    );

    expect(decision.outcome).toBe("escalate");
    if (decision.outcome === "escalate") {
      expect(decision.missing.reason).toBe(
        "cross-border transfers always need a human sign-off",
      );
    }
  });
});
