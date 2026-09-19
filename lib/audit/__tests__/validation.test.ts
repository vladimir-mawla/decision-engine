import { describe, expect, it } from "vitest";
import { recordDecision } from "../record.js";
import { parseAuditRecord } from "../validation.js";
import { fixtureInput, fixtureRequirement, fixtureSignal, NOW } from "./fixtures.js";

const ID = "audit-validation";
const RECORDED_AT = NOW;
const VALIDATE_NOW = NOW;

describe("parseAuditRecord — round-trips a real record through JSON", () => {
  it("a decision record survives JSON.stringify/JSON.parse and re-parses to an equal value", () => {
    const record = recordDecision(
      fixtureInput({ requirements: [fixtureRequirement({ minConfidence: 0.1 })], signals: [fixtureSignal({ confidence: 0.95 })] }),
      ID,
      RECORDED_AT,
    );
    const raw = JSON.parse(JSON.stringify(record));
    const parsed = parseAuditRecord(raw, VALIDATE_NOW);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toEqual(record);
    }
  });

  it("a refuse record (rule kind 'prohibition') round-trips too", () => {
    const record = recordDecision(
      fixtureInput({ prohibitions: [{ id: "p", reason: "categorically forbidden", matches: () => true }] }),
      ID,
      RECORDED_AT,
    );
    const raw = JSON.parse(JSON.stringify(record));
    const parsed = parseAuditRecord(raw, VALIDATE_NOW);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(record);
  });

  it("a RejectedAuditRecord round-trips too", () => {
    const record = recordDecision(null as never, ID, RECORDED_AT);
    const raw = JSON.parse(JSON.stringify(record));
    const parsed = parseAuditRecord(raw, VALIDATE_NOW);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(record);
  });
});

describe("parseAuditRecord — fail closed on hostile/malformed input, never throws", () => {
  it("null", () => {
    let result;
    expect(() => { result = parseAuditRecord(null, VALIDATE_NOW); }).not.toThrow();
    expect(result!.ok).toBe(false);
  });

  it("undefined", () => {
    let result;
    expect(() => { result = parseAuditRecord(undefined, VALIDATE_NOW); }).not.toThrow();
    expect(result!.ok).toBe(false);
  });

  it("a bare string / number / array", () => {
    for (const raw of ["not a record", 42, []]) {
      let result;
      expect(() => { result = parseAuditRecord(raw, VALIDATE_NOW); }).not.toThrow();
      expect(result!.ok).toBe(false);
    }
  });

  it("missing fields", () => {
    let result;
    expect(() => { result = parseAuditRecord({ kind: "decision" }, VALIDATE_NOW); }).not.toThrow();
    expect(result!.ok).toBe(false);
  });

  it("a throwing getter on a top-level field", () => {
    const hostile = { schemaVersion: 1 };
    Object.defineProperty(hostile, "id", { enumerable: true, get() { throw new Error("boom"); } });
    let result;
    expect(() => { result = parseAuditRecord(hostile, VALIDATE_NOW); }).not.toThrow();
    expect(result!.ok).toBe(false);
  });

  it("a Proxy that throws on every property access", () => {
    const hostile = new Proxy({}, { get() { throw new Error("boom"); } });
    let result;
    expect(() => { result = parseAuditRecord(hostile, VALIDATE_NOW); }).not.toThrow();
    expect(result!.ok).toBe(false);
  });

  it("a circular reference does not throw and does not hang", () => {
    const circular: Record<string, unknown> = { kind: "decision", schemaVersion: 1, id: "x", recordedAt: NOW };
    circular.self = circular;
    let result;
    expect(() => { result = parseAuditRecord(circular, VALIDATE_NOW); }).not.toThrow();
    expect(result!.ok).toBe(false); // missing other required fields, but critically: no throw, no hang.
  });

  it("a large (~10MB) payload does not throw and returns promptly", () => {
    const huge = { kind: "decision", schemaVersion: 1, id: "x", recordedAt: NOW, padding: "x".repeat(10 * 1024 * 1024) };
    const start = Date.now();
    let result;
    expect(() => { result = parseAuditRecord(huge, VALIDATE_NOW); }).not.toThrow();
    expect(Date.now() - start).toBeLessThan(1000);
    expect(result!.ok).toBe(false); // still missing required fields; the point is it doesn't throw or hang.
  });

  it("a record from a 'future version' with unknown fields does not throw — rejected as unsupported, not guessed at", () => {
    const future = {
      kind: "decision",
      schemaVersion: 2,
      id: "x",
      recordedAt: NOW,
      somethingThisParserHasNeverSeen: { nested: true },
    };
    let result;
    expect(() => { result = parseAuditRecord(future, VALIDATE_NOW); }).not.toThrow();
    expect(result!.ok).toBe(false);
    if (!result!.ok) {
      expect(result!.error.kind).toBe("unsupported-schema-version");
    }
  });

  it("extra, unrecognized fields on an otherwise well-formed v1 record are ignored, not rejected", () => {
    const record = recordDecision(fixtureInput(), ID, RECORDED_AT);
    const raw = { ...JSON.parse(JSON.stringify(record)), futureField: { nested: "ignored" } };
    const result = parseAuditRecord(raw, VALIDATE_NOW);
    expect(result.ok).toBe(true);
  });

  it("an unknown record `kind` fails closed with a structured error, not a throw", () => {
    let result;
    expect(() => {
      result = parseAuditRecord({ kind: "something-else", schemaVersion: 1, id: "x", recordedAt: NOW }, VALIDATE_NOW);
    }).not.toThrow();
    expect(result!.ok).toBe(false);
    if (!result!.ok) expect(result!.error.kind).toBe("unknown-record-kind");
  });
});
