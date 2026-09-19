import { describe, expect, it } from "vitest";
import { createSignal } from "../signal.js";
import { ageOf, isFresh } from "../time.js";
import { capturedAt, confidence, millis, NOW } from "./fixtures.js";

/**
 * Staleness is per-kind, not global: the SAME signal, read with two
 * different `maxAge` policies, comes back fresh under one and stale under
 * the other. There is no default TTL anywhere in this module for that
 * exact reason — the caller states it on every read (or, in gap analysis,
 * on every Requirement).
 */
describe("freshness — per-kind, caller-stated, never a global TTL", () => {
  it("the same signal is fresh under a lenient policy and stale under a strict one", () => {
    // Captured exactly 2 hours before NOW.
    const signal = createSignal({
      id: "sig-1",
      kind: "market.price",
      value: 101.5,
      source: { kind: "system", system: "pricing-feed" },
      capturedAt: capturedAt("2026-09-19T10:00:00Z"),
      confidence: confidence(0.95),
    });

    const lenient = signal.read(millis(24 * 60 * 60 * 1000), NOW); // 24h policy — a stale identity check's threshold
    const strict = signal.read(millis(5 * 60 * 1000), NOW); // 5m policy — appropriate for a fast-moving market price

    expect(lenient.status).toBe("fresh");
    expect(strict.status).toBe("stale");
  });

  it("boundary: exactly at the threshold counts as fresh (<=, not <)", () => {
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const signal = createSignal({
      id: "sig-1",
      kind: "market.price",
      value: 101.5,
      source: { kind: "system", system: "pricing-feed" },
      capturedAt: capturedAt("2026-09-19T10:00:00Z"), // exactly 2h before NOW
      confidence: confidence(0.95),
    });

    const atThreshold = signal.read(millis(twoHoursMs), NOW);
    expect(atThreshold.status).toBe("fresh");
  });

  it("boundary: one millisecond past the threshold counts as stale", () => {
    const justUnderTwoHoursMs = 2 * 60 * 60 * 1000 - 1;
    const signal = createSignal({
      id: "sig-1",
      kind: "market.price",
      value: 101.5,
      source: { kind: "system", system: "pricing-feed" },
      capturedAt: capturedAt("2026-09-19T10:00:00Z"), // exactly 2h before NOW
      confidence: confidence(0.95),
    });

    const justPastThreshold = signal.read(millis(justUnderTwoHoursMs), NOW);
    expect(justPastThreshold.status).toBe("stale");
  });

  it("boundary: one millisecond before the threshold counts as fresh", () => {
    const justOverTwoHoursMs = 2 * 60 * 60 * 1000 + 1;
    const signal = createSignal({
      id: "sig-1",
      kind: "market.price",
      value: 101.5,
      source: { kind: "system", system: "pricing-feed" },
      capturedAt: capturedAt("2026-09-19T10:00:00Z"), // exactly 2h before NOW
      confidence: confidence(0.95),
    });

    const justUnderThreshold = signal.read(millis(justOverTwoHoursMs), NOW);
    expect(justUnderThreshold.status).toBe("fresh");
  });

  it("a fresh reading carries its own confidence and age alongside the value — never a bare value", () => {
    const signal = createSignal({
      id: "sig-1",
      kind: "market.price",
      value: 101.5,
      source: { kind: "system", system: "pricing-feed" },
      capturedAt: capturedAt("2026-09-19T11:00:00Z"), // 1h before NOW
      confidence: confidence(0.72),
    });

    const reading = signal.read(millis(24 * 60 * 60 * 1000), NOW);
    expect(reading.status).toBe("fresh");
    if (reading.status !== "fresh") throw new Error("expected fresh");
    expect(reading.value).toBe(101.5);
    expect(reading.confidence).toBe(0.72);
    expect(reading.age).toBe(60 * 60 * 1000);
  });

  it("a stale reading names both the actual age and the threshold it missed, but no value", () => {
    const signal = createSignal({
      id: "sig-1",
      kind: "market.price",
      value: 101.5,
      source: { kind: "system", system: "pricing-feed" },
      capturedAt: capturedAt("2026-09-19T00:00:00Z"), // 12h before NOW
      confidence: confidence(0.95),
    });

    const reading = signal.read(millis(60 * 1000), NOW); // 1-minute policy
    expect(reading.status).toBe("stale");
    if (reading.status !== "stale") throw new Error("expected stale");
    expect(reading.age).toBe(12 * 60 * 60 * 1000);
    expect(reading.maxAge).toBe(60 * 1000);
  });

  it("a `now` earlier than the signal's own capturedAt is a clock inconsistency, never treated as fresh", () => {
    const laterCapturedAt = capturedAt("2026-09-19T11:59:00Z", NOW); // valid relative to NOW
    const signal = createSignal({
      id: "sig-1",
      kind: "market.price",
      value: 101.5,
      source: { kind: "system", system: "pricing-feed" },
      capturedAt: laterCapturedAt,
      confidence: confidence(0.95),
    });

    // Read with an EARLIER "now" than the signal's own capturedAt — a
    // caller-side inconsistency, e.g. reusing a stale clock reading.
    const earlierNow = capturedAt("2026-09-19T11:30:00Z", NOW);
    const reading = signal.read(millis(24 * 60 * 60 * 1000), earlierNow);
    expect(reading.status).toBe("clock-inconsistency");

    // ageOf/isFresh agree directly, independent of Signal.read.
    const age = ageOf(laterCapturedAt, earlierNow);
    expect(age.kind).toBe("clock-inconsistency");
    expect(isFresh(age, millis(24 * 60 * 60 * 1000))).toBe(false);
  });

  it("isFresh is never true for a clock-inconsistent age, no matter how generous the maxAge", () => {
    expect(isFresh({ kind: "clock-inconsistency" }, millis(Number.MAX_SAFE_INTEGER))).toBe(false);
  });
});
