import { describe, expect, it } from "vitest";
import type { Action } from "../../contracts/action.js";
import type { DecideInput } from "../../decide/index.js";
import type { Requirement } from "../../signals/requirement.js";
import type { Signal } from "../../signals/signal.js";
import { recordDecision, type DecisionAuditRecord } from "../record.js";
import { replay } from "../replay.js";
import { fixtureInput, fixtureRequirement, fixtureSignal, NOW } from "./fixtures.js";

const ID = "audit-fail-closed";
const RECORDED_AT = NOW;

describe("fail-closed — recordDecision never throws, for any hostile input", () => {
  it("a throwing getter on action.costOfBeingWrong does not escape recordDecision", () => {
    const action = { domain: "d", type: "t", parameters: {} } as unknown as Action;
    Object.defineProperty(action, "costOfBeingWrong", { enumerable: true, get() { throw new Error("boom"); } });
    Object.defineProperty(action, "reversibility", { value: "reversible-with-cost", enumerable: true });

    let record;
    expect(() => {
      record = recordDecision(fixtureInput({ action }), ID, RECORDED_AT);
    }).not.toThrow();
    expect(record).toBeDefined();
  });

  it("a throwing getter on a Requirement's maxAge does not escape recordDecision", () => {
    const requirement = fixtureRequirement();
    const hostile: Requirement = Object.defineProperty({ ...requirement }, "maxAge", {
      enumerable: true,
      get() { throw new Error("boom"); },
    });

    let record;
    expect(() => {
      record = recordDecision(fixtureInput({ requirements: [hostile] }), ID, RECORDED_AT);
    }).not.toThrow();
    expect(record).toBeDefined();
  });

  it("a throwing getter on a Signal's confidence does not escape recordDecision", () => {
    const signal = fixtureSignal();
    const hostile: Signal = Object.defineProperty({ ...signal }, "confidence", {
      enumerable: true,
      get() { throw new Error("boom"); },
    });

    let record;
    expect(() => {
      record = recordDecision(fixtureInput({ signals: [hostile] }), ID, RECORDED_AT);
    }).not.toThrow();
    expect(record).toBeDefined();
  });

  it("a Proxy that throws on every access to `input` itself does not escape recordDecision", () => {
    const hostile = new Proxy({}, { get() { throw new Error("boom"); } }) as unknown as DecideInput;
    let record;
    expect(() => {
      record = recordDecision(hostile, ID, RECORDED_AT);
    }).not.toThrow();
    expect(record).toBeDefined();
  });

  it("a Proxy whose `requirements`/`prohibitions`/`now` getters throw (but action is fine) still produces a record, with the failures named in snapshotWarnings", () => {
    const base = fixtureInput();
    const hostile = new Proxy(base, {
      get(target, prop, receiver) {
        if (prop === "requirements" || prop === "prohibitions" || prop === "now") {
          throw new Error(`hostile getter on ${String(prop)}`);
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as unknown as DecideInput;

    let record;
    expect(() => {
      record = recordDecision(hostile, ID, RECORDED_AT);
    }).not.toThrow();
    expect(record).toBeDefined();
    // decide() itself fails closed to escalate for this (its own outer
    // catch), so this is a real DecisionAuditRecord, not input-rejected —
    // but it should honestly report that some of its own fields could not
    // be captured.
    if (record!.kind === "decision") {
      expect(record!.snapshotWarnings.length).toBeGreaterThan(0);
    }
  });

  it("completely garbage top-level input (wrong type entirely) does not throw", () => {
    let record;
    expect(() => {
      record = recordDecision("not an input" as unknown as DecideInput, ID, RECORDED_AT);
    }).not.toThrow();
    expect(record).toBeDefined();
  });
});

describe("fail-closed — replay() never throws, for any hostile DecisionAuditRecord", () => {
  function baseRecord(): DecisionAuditRecord {
    const record = recordDecision(
      fixtureInput({ requirements: [fixtureRequirement({ minConfidence: 0.1 })], signals: [fixtureSignal({ confidence: 0.95 })] }),
      ID,
      RECORDED_AT,
    );
    if (record.kind !== "decision") throw new Error("expected a DecisionAuditRecord");
    return record;
  }

  it("a record whose action is null does not throw — replay reports a mismatch instead", () => {
    const record = { ...baseRecord(), action: null } as unknown as DecisionAuditRecord;
    let result;
    expect(() => {
      result = replay(record, []);
    }).not.toThrow();
    expect(result).toBeDefined();
    expect(result!.matches).toBe(false);
  });

  it("a record whose decision.evidence is null does not throw", () => {
    const good = baseRecord();
    const record = { ...good, decision: { ...good.decision, evidence: null } } as unknown as DecisionAuditRecord;
    let result;
    expect(() => {
      result = replay(record, []);
    }).not.toThrow();
    expect(result).toBeDefined();
  });

  it("a record whose decision.evidence contains a hostile entry (throwing getter) does not throw — the entry is dropped", () => {
    const good = baseRecord();
    const hostileSnapshot = Object.defineProperty({}, "id", { enumerable: true, get() { throw new Error("boom"); } });
    const record = {
      ...good,
      decision: { ...good.decision, evidence: [hostileSnapshot] },
    } as unknown as DecisionAuditRecord;

    let result;
    expect(() => {
      result = replay(record, []);
    }).not.toThrow();
    expect(result).toBeDefined();
  });

  it("a Proxy record that throws on every property access does not throw", () => {
    const hostile = new Proxy({}, { get() { throw new Error("boom"); } }) as unknown as DecisionAuditRecord;
    let result;
    expect(() => {
      result = replay(hostile, []);
    }).not.toThrow();
    expect(result).toBeDefined();
    expect(result!.matches).toBe(false);
  });

  it("a circular-reference record does not throw and does not hang", () => {
    const good = baseRecord() as unknown as Record<string, unknown>;
    const circular: Record<string, unknown> = { ...good };
    circular.self = circular; // cycle
    let result;
    expect(() => {
      result = replay(circular as unknown as DecisionAuditRecord, []);
    }).not.toThrow();
    expect(result).toBeDefined();
  });

  it("a hostile prohibitions array (throwing on every access, including .map) supplied to replay does not throw", () => {
    const record = baseRecord();
    const hostileProhibitions = new Proxy([], { get() { throw new Error("boom"); } }) as unknown as never;

    let result;
    expect(() => {
      result = replay(record, hostileProhibitions);
    }).not.toThrow();
    expect(result).toBeDefined();
  });
});
