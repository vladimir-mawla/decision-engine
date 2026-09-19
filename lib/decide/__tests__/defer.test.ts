import { describe, expect, it } from "vitest";
import { decide } from "../decide.js";
import { fixtureInput, fixtureRequirement, fixtureSignal, millis, NOW } from "./fixtures.js";

/**
 * Milestone success criterion: "every `defer` names what it is waiting on
 * time for" — and DECISION 5: `reconsiderAt` traces to something real
 * (`requirement.maxAge`, added to the `now` decide() was actually called
 * with), never an invented timestamp.
 */
describe("defer — names what it waits on, and reconsiderAt traces to requirement.maxAge", () => {
  it("absent time-supplied requirement: waitingOn is the supplier's own text, reconsiderAt = now + maxAge exactly", () => {
    const maxAgeMs = 6 * 60 * 60 * 1000; // 6h
    const requirement = fixtureRequirement({
      signalKind: "payment.settlement-status",
      maxAgeMs,
      supplier: { kind: "time", waitingOn: "the disputed charge to settle" },
    });

    const decision = decide(fixtureInput({ requirements: [requirement], signals: [] }));

    expect(decision.outcome).toBe("defer");
    if (decision.outcome === "defer") {
      expect(decision.missing.kind).toBe("time");
      expect(decision.missing.waitingOn).toBe("the disputed charge to settle");
      expect(decision.missing.reconsiderAt).toBe(new Date(Date.parse(NOW) + maxAgeMs).toISOString());
    }
  });

  it("stale (elapsed, not clock-inconsistent) time-supplied requirement also defers, with the same reconsiderAt rule", () => {
    const maxAgeMs = 60 * 60 * 1000; // 1h
    const requirement = fixtureRequirement({
      signalKind: "payment.settlement-status",
      maxAgeMs,
      supplier: { kind: "time", waitingOn: "a fresh settlement check" },
    });
    const staleSignal = fixtureSignal({
      kind: "payment.settlement-status",
      confidence: 0.9,
      capturedAtIso: "2026-09-19T08:00:00.000Z", // 4h before NOW, older than 1h maxAge
    });

    const decision = decide(fixtureInput({ requirements: [requirement], signals: [staleSignal] }));

    expect(decision.outcome).toBe("defer");
    if (decision.outcome === "defer") {
      expect(decision.missing.waitingOn).toBe("a fresh settlement check");
      expect(decision.missing.reconsiderAt).toBe(new Date(Date.parse(NOW) + maxAgeMs).toISOString());
    }
  });

  it("below-confidence time-supplied requirement (fresh but too weak) also defers via the same rule", () => {
    const maxAgeMs = 2 * 60 * 60 * 1000; // 2h
    const requirement = fixtureRequirement({
      signalKind: "risk.preliminary-score",
      minConfidence: 0.9,
      maxAgeMs,
      supplier: { kind: "time", waitingOn: "the risk score to firm up" },
    });
    const weakSignal = fixtureSignal({
      kind: "risk.preliminary-score",
      confidence: 0.5, // fresh, but below minConfidence 0.9
      capturedAtIso: "2026-09-19T11:30:00.000Z",
    });

    const decision = decide(fixtureInput({ requirements: [requirement], signals: [weakSignal] }));

    expect(decision.outcome).toBe("defer");
    if (decision.outcome === "defer") {
      expect(decision.missing.reconsiderAt).toBe(new Date(Date.parse(NOW) + maxAgeMs).toISOString());
    }
  });

  it("reconsiderAt is always strictly after `now` (maxAge is non-negative by construction)", () => {
    const requirement = fixtureRequirement({
      maxAgeMs: 1,
      supplier: { kind: "time", waitingOn: "one millisecond, for the boundary" },
    });
    const decision = decide(fixtureInput({ requirements: [requirement], signals: [] }));
    expect(decision.outcome).toBe("defer");
    if (decision.outcome === "defer") {
      expect(Date.parse(decision.missing.reconsiderAt)).toBeGreaterThan(Date.parse(NOW));
    }
  });

  it("differing maxAge values on different requirements produce differing reconsiderAt — it is not a hardcoded constant", () => {
    const short = fixtureRequirement({
      signalKind: "a",
      maxAgeMs: millis(10_000),
      supplier: { kind: "time", waitingOn: "a" },
    });
    const long = fixtureRequirement({
      signalKind: "b",
      maxAgeMs: millis(10_000_000),
      supplier: { kind: "time", waitingOn: "b" },
    });

    const shortDecision = decide(fixtureInput({ requirements: [short], signals: [] }));
    const longDecision = decide(fixtureInput({ requirements: [long], signals: [] }));

    expect(shortDecision.outcome).toBe("defer");
    expect(longDecision.outcome).toBe("defer");
    if (shortDecision.outcome === "defer" && longDecision.outcome === "defer") {
      expect(shortDecision.missing.reconsiderAt).not.toBe(longDecision.missing.reconsiderAt);
    }
  });
});
