import { describe, expect, it } from "vitest";
import { parseProvenance, parseSignal } from "../validation.js";
import { parseCapturedAt } from "../time.js";
import { analyzeGaps } from "../gap.js";
import { fixtureRequirement, NOW } from "./fixtures.js";

/**
 * Every one of these is a documented fail-closed case from the milestone
 * brief. Each must come back as a typed error or a structured Gap — never
 * an unhandled throw — and this file asserts `.not.toThrow()` alongside
 * the typed result for every case, not just the result.
 */
describe("fail-closed: unknown provenance", () => {
  it("rejects a provenance kind that isn't one of the four known ones, without throwing", () => {
    expect(() => parseProvenance({ kind: "vibes", detail: "trust me" })).not.toThrow();
    const result = parseProvenance({ kind: "vibes", detail: "trust me" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown-provenance-kind");
  });

  it("rejects a missing kind entirely, without throwing", () => {
    const result = parseProvenance({ party: "customer" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown-provenance-kind");
  });

  it("rejects a `derived` provenance whose inputs are missing, without throwing", () => {
    const result = parseProvenance({ kind: "derived", rule: "risk-score" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "invalid-field", field: "inputs" });
  });
});

describe("fail-closed: an unparseable timestamp", () => {
  it.each([
    ["not a string at all", 12345],
    ["a bare date with no time", "2026-09-19"],
    ["a locale-ambiguous string", "09/19/2026"],
    ["garbage text", "not a timestamp"],
    ["a calendar-invalid instant", "2026-13-40T00:00:00Z"],
  ])("rejects %s, without throwing", (_label, raw) => {
    expect(() => parseCapturedAt(raw, NOW)).not.toThrow();
    const result = parseCapturedAt(raw, NOW);
    expect(result.ok).toBe(false);
  });
});

describe("fail-closed: a future-dated observation (clock skew)", () => {
  it("rejects a capturedAt strictly after the constructing clock's now, without throwing", () => {
    const oneSecondAfterNow = "2026-09-19T12:00:01.000Z";
    expect(() => parseCapturedAt(oneSecondAfterNow, NOW)).not.toThrow();
    const result = parseCapturedAt(oneSecondAfterNow, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("future-dated");
  });

  it("accepts a capturedAt exactly equal to now — simultaneity is not skew", () => {
    const result = parseCapturedAt(NOW, NOW);
    expect(result.ok).toBe(true);
  });

  it("a full end-to-end parseSignal rejects a future-dated signal from untrusted input", () => {
    const raw = {
      id: "sig-1",
      kind: "customer.identity.verified",
      value: true,
      source: { kind: "system", system: "identity-service" },
      capturedAt: "2026-09-19T12:00:01.000Z", // 1s after NOW
      confidence: 0.9,
    };
    expect(() => parseSignal(raw, NOW)).not.toThrow();
    const result = parseSignal(raw, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-captured-at");
      if (result.error.kind === "invalid-captured-at") {
        expect(result.error.detail.kind).toBe("future-dated");
      }
    }
  });
});

describe("fail-closed: confidence outside 0..1", () => {
  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects confidence %p in a full signal payload, without throwing",
    (badConfidence) => {
      const raw = {
        id: "sig-1",
        kind: "customer.identity.verified",
        value: true,
        source: { kind: "system", system: "identity-service" },
        capturedAt: "2026-09-19T11:00:00.000Z",
        confidence: badConfidence,
      };
      expect(() => parseSignal(raw, NOW)).not.toThrow();
      const result = parseSignal(raw, NOW);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("invalid-confidence");
    },
  );
});

describe("fail-closed: a requirement naming a signal kind that does not exist", () => {
  it("gap analysis reports an absent gap rather than throwing on an unrecognized signalKind", () => {
    const requirement = fixtureRequirement({ signalKind: "domain.that.was.never.registered.anywhere" });
    expect(() => analyzeGaps([requirement], [], NOW)).not.toThrow();
    const gaps = analyzeGaps([requirement], [], NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("absent");
  });

  it("an empty requirements list against an empty signal set is not an error — it is just no gaps", () => {
    expect(() => analyzeGaps([], [], NOW)).not.toThrow();
    expect(analyzeGaps([], [], NOW)).toEqual([]);
  });
});
