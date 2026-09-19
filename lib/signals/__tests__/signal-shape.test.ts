import { describe, expect, it } from "vitest";
import { createSignal, type Signal, type SignalParams } from "../signal.js";
import { capturedAt, confidence, millis, NOW } from "./fixtures.js";

/**
 * "A signal cannot be constructed without provenance, freshness and
 * confidence — a compile error." `createSignal` takes one params object
 * (`SignalParams`) with `source`, `capturedAt`, and `confidence` all
 * required, non-optional fields — omitting any one of them is a
 * structural type error, proven below the same way
 * lib/contracts/__tests__/decision-shape.test.ts proves an `ask` without a
 * named fact does not compile: a documented `@ts-expect-error` on the
 * exact line that omits the field.
 */
describe("Signal — cannot be constructed without provenance, freshness, or confidence", () => {
  const base = {
    id: "sig-1",
    kind: "customer.identity.verified",
    value: true,
  };

  it("omitting `source` (provenance) does not compile", () => {
    // @ts-expect-error — SignalParams.source is required; this object omits it.
    const params: SignalParams<boolean> = {
      ...base,
      capturedAt: capturedAt("2026-09-19T11:00:00Z"),
      confidence: confidence(0.9),
    };
    void params;
  });

  it("omitting `capturedAt` (freshness) does not compile", () => {
    // @ts-expect-error — SignalParams.capturedAt is required; this object omits it.
    const params: SignalParams<boolean> = {
      ...base,
      source: { kind: "system", system: "identity-service" },
      confidence: confidence(0.9),
    };
    void params;
  });

  it("omitting `confidence` does not compile", () => {
    // @ts-expect-error — SignalParams.confidence is required; this object omits it.
    const params: SignalParams<boolean> = {
      ...base,
      source: { kind: "system", system: "identity-service" },
      capturedAt: capturedAt("2026-09-19T11:00:00Z"),
    };
    void params;
  });

  it("a `derived` provenance without recording its inputs does not compile", () => {
    const params: SignalParams<boolean> = {
      ...base,
      // @ts-expect-error — the `derived` Provenance variant requires `inputs` (the ids of the signals it was computed from); this object omits it.
      source: { kind: "derived", rule: "risk-score-v2" },
      capturedAt: capturedAt("2026-09-19T11:00:00Z"),
      confidence: confidence(0.9),
    };
    void params;
  });

  it("all four fields present compiles and constructs a real Signal", () => {
    const signal: Signal<boolean> = createSignal({
      ...base,
      source: { kind: "system", system: "identity-service" },
      capturedAt: capturedAt("2026-09-19T11:00:00Z"),
      confidence: confidence(0.9),
    });
    expect(signal.id).toBe("sig-1");
    expect(signal.source).toEqual({ kind: "system", system: "identity-service" });
  });

  it("a stale reading has no `.value` field at all — narrowing is required to reach it", () => {
    const signal = createSignal({
      ...base,
      source: { kind: "system", system: "identity-service" },
      capturedAt: capturedAt("2026-09-19T00:00:00Z"),
      confidence: confidence(0.9),
    });
    const reading = signal.read(millis(1000), NOW);
    expect(reading.status).toBe("stale");
    if (reading.status === "fresh") {
      // Only reachable after narrowing to "fresh" — this is the branch
      // that has a `.value` field at all. The `stale` and
      // `clock-inconsistency` variants structurally do not have one.
      expect(reading.value).toBe(true);
    } else {
      // @ts-expect-error — `reading` is narrowed to the non-"fresh" union member here, which has no `value` field.
      expect(reading.value).toBeUndefined();
    }
  });
});
