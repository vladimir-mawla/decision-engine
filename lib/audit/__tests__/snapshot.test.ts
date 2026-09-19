import { describe, expect, it } from "vitest";
import { fromSignalSnapshot, toSignalSnapshot, UNDISCLOSED_VALUE } from "../snapshot.js";
import { fixtureSignal, millis, NOW } from "./fixtures.js";

describe("toSignalSnapshot — metadata only, never the value", () => {
  it("captures id/kind/source/capturedAt/confidence verbatim", () => {
    const signal = fixtureSignal({ id: "s1", kind: "customer.balance", confidence: 0.73 });
    const snapshot = toSignalSnapshot(signal);
    expect(snapshot).toEqual({
      id: "s1",
      kind: "customer.balance",
      source: signal.source,
      capturedAt: signal.capturedAt,
      confidence: signal.confidence,
    });
  });

  it("the snapshot has no `value` field, mirroring what JSON.stringify(signal) already gives you — M3's own encapsulation, not a new mechanism", () => {
    const signal = fixtureSignal({ value: { ssn: "000-00-0000" } });
    const snapshot = toSignalSnapshot(signal);
    expect("value" in snapshot).toBe(false);
    expect(JSON.parse(JSON.stringify(signal))).toEqual({
      id: signal.id,
      kind: signal.kind,
      source: signal.source,
      capturedAt: signal.capturedAt,
      confidence: signal.confidence,
    });
  });
});

describe("fromSignalSnapshot — reconstructs a Signal whose value is an unmistakable sentinel", () => {
  it("round-trips metadata exactly", () => {
    const original = fixtureSignal({ id: "s2", kind: "deploy.diff.risk", confidence: 0.55 });
    const snapshot = toSignalSnapshot(original);
    const reconstructed = fromSignalSnapshot(snapshot);

    expect(reconstructed.id).toBe(original.id);
    expect(reconstructed.kind).toBe(original.kind);
    expect(reconstructed.source).toEqual(original.source);
    expect(reconstructed.capturedAt).toBe(original.capturedAt);
    expect(reconstructed.confidence).toBe(original.confidence);
  });

  it("reading the reconstructed signal's value returns UNDISCLOSED_VALUE, never the original value, never undefined/null", () => {
    const original = fixtureSignal({ value: "the customer's actual SSN" });
    const reconstructed = fromSignalSnapshot(toSignalSnapshot(original));

    // A generous maxAge (10 years) so the reading is fresh and actually carries a value field.
    const freshReading = reconstructed.read(millis(10 * 365 * 24 * 60 * 60 * 1000), NOW);
    expect(freshReading.status).toBe("fresh");
    if (freshReading.status === "fresh") {
      expect(freshReading.value).toBe(UNDISCLOSED_VALUE);
      expect(freshReading.value).not.toBe("the customer's actual SSN");
    }
  });
});
