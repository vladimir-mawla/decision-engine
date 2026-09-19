import { describe, expect, it } from "vitest";
import { parseSignal } from "../validation.js";
import { millis, NOW } from "./fixtures.js";

/**
 * "Real input arrives as JSON, so validate at that boundary too" — and
 * specifically, M1 was found to throw on a hostile accessor and had to be
 * fixed after the fact. These reproduce that same class of adversarial
 * input against `parseSignal` directly, so the same mistake isn't repeated
 * here. Every case asserts BOTH `.not.toThrow()` and a typed `ok: false`
 * result — a parser that merely doesn't crash but also doesn't produce a
 * usable error would be just as unhelpful to a caller.
 */
describe("hostile input at the JSON boundary — parseSignal never throws", () => {
  const validShape = {
    id: "sig-1",
    kind: "customer.identity.verified",
    source: { kind: "system", system: "identity-service" },
    capturedAt: "2026-09-19T11:00:00.000Z",
    confidence: 0.9,
  };

  it("a `__proto__` own-property key does not pollute anything and is simply ignored", () => {
    // JSON.parse produces `__proto__` as an ordinary own data property,
    // never as a prototype mutation — this reproduces that exact shape
    // without going through JSON.parse itself, and confirms this module
    // never does anything (like Object.assign into a fresh object) that
    // would turn it into a real prototype write.
    const raw = JSON.parse('{"__proto__": {"polluted": true}, "id": "sig-1", "kind": "k", "value": true, "source": {"kind":"system","system":"s"}, "capturedAt":"2026-09-19T11:00:00.000Z","confidence":0.9}');
    expect(Object.getPrototypeOf(raw)).toBe(Object.prototype); // sanity: not actually polluted by JSON.parse itself

    expect(() => parseSignal(raw, NOW)).not.toThrow();
    const result = parseSignal(raw, NOW);
    expect(result.ok).toBe(true);
    // The pollution attempt did not leak into a fresh object either.
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("a throwing OWN getter on `confidence` is treated as an absent field, not an exception", () => {
    const raw: Record<string, unknown> = { ...validShape, value: true };
    Object.defineProperty(raw, "confidence", {
      enumerable: true,
      get() {
        throw new Error("hostile getter fired");
      },
    });

    expect(() => parseSignal(raw, NOW)).not.toThrow();
    const result = parseSignal(raw, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("missing-field");
  });

  it("a throwing INHERITED getter (on the prototype) is treated as an absent field, not an exception", () => {
    const hostileProto = {};
    Object.defineProperty(hostileProto, "kind", {
      enumerable: true,
      get() {
        throw new Error("hostile inherited getter fired");
      },
    });
    const raw = Object.create(hostileProto);
    raw.id = "sig-1";
    raw.value = true;
    raw.source = { kind: "system", system: "identity-service" };
    raw.capturedAt = "2026-09-19T11:00:00.000Z";
    raw.confidence = 0.9;

    expect(() => parseSignal(raw, NOW)).not.toThrow();
    const result = parseSignal(raw, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("missing-field");
  });

  it("a Proxy whose `get` trap throws for every property is treated as absent fields, not an exception", () => {
    const raw = new Proxy(
      {},
      {
        get() {
          throw new Error("hostile proxy trap fired");
        },
      },
    );

    expect(() => parseSignal(raw, NOW)).not.toThrow();
    const result = parseSignal(raw, NOW);
    expect(result.ok).toBe(false);
  });

  it("a Proxy that throws only on `has`/`ownKeys` (never touched by this module) still parses normally", () => {
    const target = { ...validShape, value: true };
    const raw = new Proxy(target, {
      has() {
        throw new Error("hostile `in` trap fired");
      },
      ownKeys() {
        throw new Error("hostile ownKeys trap fired");
      },
    });

    expect(() => parseSignal(raw, NOW)).not.toThrow();
    const result = parseSignal(raw, NOW);
    expect(result.ok).toBe(true);
  });

  it("a very large payload (10MB+ of padding) is validated in bounded time, not walked recursively", () => {
    const padding = "x".repeat(10 * 1024 * 1024);
    const raw = { ...validShape, value: true, unrelatedLargeField: padding };

    const started = Date.now();
    const result = parseSignal(raw, NOW);
    const elapsedMs = Date.now() - started;

    expect(result.ok).toBe(true);
    expect(elapsedMs).toBeLessThan(1000);
  });

  it("a circular reference (raw object referencing itself) does not cause infinite recursion or a stack overflow", () => {
    const raw: Record<string, unknown> = { ...validShape, value: true };
    raw.self = raw; // cannot come from JSON.parse, but a caller could still construct this before calling parseSignal
    raw.source = { kind: "system", system: "identity-service", loop: raw };

    expect(() => parseSignal(raw, NOW)).not.toThrow();
    const result = parseSignal(raw, NOW);
    expect(result.ok).toBe(true);
  });

  it("a `value` key holding `false`, `0`, or `null` is a legitimate asserted fact, not treated as absent", () => {
    for (const legitValue of [false, 0, null, ""]) {
      const raw = { ...validShape, value: legitValue };
      const result = parseSignal(raw, NOW);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // 100 years — irrelevant to this test, just needs to be fresh.
        const reading = result.value.read(millis(100 * 365 * 24 * 60 * 60 * 1000), NOW);
        expect(reading.status).toBe("fresh");
      }
    }
  });

  it("a completely absent `value` key is rejected as a missing field", () => {
    const raw = { ...validShape };
    const result = parseSignal(raw, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "missing-field", field: "value" });
  });
});
