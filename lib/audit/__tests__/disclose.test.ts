import { describe, expect, it } from "vitest";
import { discloseSignalValue } from "../disclose.js";
import type { Provenance } from "../../signals/provenance.js";
import { fixtureSignal, millis, NOW } from "./fixtures.js";

/**
 * discloseSignalValue is the ONE named, intentional act that reveals a
 * Signal's value in this package. These tests exist to prove exactly
 * that: it is opt-in (nothing else in lib/audit calls it — see
 * record.test.ts's and replay-property.test.ts's own assertions that a
 * normal record/replay cycle never surfaces a raw value), and it is
 * honest about freshness exactly like Signal.read already is.
 */
describe("discloseSignalValue — the one deliberate value-disclosure act", () => {
  it("a fresh disclosure carries the real value, age, and confidence", () => {
    const source: Provenance = { kind: "system", system: "balance-service" };
    const maxAge = millis(24 * 60 * 60 * 1000);
    const signal = fixtureSignal({ id: "d1", kind: "customer.balance", value: 42, confidence: 0.8, source });
    const disclosure = discloseSignalValue(signal, maxAge, NOW);

    expect(disclosure.signalId).toBe("d1");
    expect(disclosure.signalKind).toBe("customer.balance");
    // SWEEP FINDING (see this milestone's audit fix report): `source`,
    // `requestedMaxAge`, and `disclosedAt` were never asserted anywhere
    // in this file — a mutation that replaced all three with fixed,
    // wrong values in disclose.ts survived every test here before these
    // three lines existed.
    expect(disclosure.source).toEqual(source);
    expect(disclosure.requestedMaxAge).toBe(maxAge);
    expect(disclosure.disclosedAt).toBe(NOW);
    expect(disclosure.reading.status).toBe("fresh");
    if (disclosure.reading.status === "fresh") {
      expect(disclosure.reading.value).toBe(42);
      expect(disclosure.reading.confidence).toBe(signal.confidence);
    }
  });

  it("a stale disclosure carries no value at all — the same discipline SignalReading enforces everywhere else", () => {
    const signal = fixtureSignal({
      id: "d2",
      value: "should never appear",
      capturedAtIso: new Date(Date.parse(NOW) - 48 * 60 * 60 * 1000).toISOString(),
    });
    const disclosure = discloseSignalValue(signal, millis(60 * 60 * 1000), NOW);

    expect(disclosure.reading.status).toBe("stale");
    expect("value" in disclosure.reading).toBe(false);
  });

  it("the caller states maxAge and now explicitly — disclosure adds no second, hidden freshness policy", () => {
    const signal = fixtureSignal({ id: "d3", capturedAtIso: new Date(Date.parse(NOW) - 30 * 60 * 1000).toISOString() });
    const generous = discloseSignalValue(signal, millis(60 * 60 * 1000), NOW);
    const strict = discloseSignalValue(signal, millis(10 * 60 * 1000), NOW);

    expect(generous.reading.status).toBe("fresh");
    expect(strict.reading.status).toBe("stale");
  });
});
