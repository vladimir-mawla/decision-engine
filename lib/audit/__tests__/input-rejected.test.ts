import { describe, expect, it } from "vitest";
import type { DecideInput } from "../../decide/index.js";
import { recordDecision, type RejectedAuditRecord } from "../record.js";
import { replay } from "../replay.js";
import { NOW } from "./fixtures.js";

const ID = "audit-rejected";
const RECORDED_AT = NOW;

/**
 * DELIBERATE DECISION on `InputRejected` (see .genesis/decisions/0003-
 * audit-model.md's INPUT_REJECTED section): decide() never obtained a
 * usable action, so there was never a real Decision to audit — the
 * record says so plainly (`replayable: false`) rather than fabricating a
 * replayable-looking record for something that was never actually
 * decided.
 */
describe("recordDecision on InputRejected — honest about there being nothing to replay", () => {
  it("decide(null) records a RejectedAuditRecord, never a fabricated Decision", () => {
    const record = recordDecision(null as unknown as DecideInput, ID, RECORDED_AT);
    expect(record.kind).toBe("input-rejected");
    if (record.kind === "input-rejected") {
      expect(record.replayable).toBe(false);
      expect(record.evidence).toEqual([]);
      expect(record.reason.length).toBeGreaterThan(0);
    }
    expect("action" in record).toBe(false);
    expect("decision" in record).toBe(false);
  });

  it("decide(undefined) records a RejectedAuditRecord", () => {
    const record = recordDecision(undefined as unknown as DecideInput, ID, RECORDED_AT);
    expect(record.kind).toBe("input-rejected");
  });

  it("a Proxy that throws on every access records a RejectedAuditRecord, never throws", () => {
    const hostile = new Proxy({}, { get() { throw new Error("boom"); } }) as unknown as DecideInput;
    let record: unknown;
    expect(() => {
      record = recordDecision(hostile, ID, RECORDED_AT);
    }).not.toThrow();
    expect((record as RejectedAuditRecord).kind).toBe("input-rejected");
  });

  it("replay() cannot even be called on a RejectedAuditRecord — enforced by TypeScript, not a runtime check", () => {
    const record = recordDecision(null as unknown as DecideInput, ID, RECORDED_AT);
    expect(record.kind).toBe("input-rejected");
    if (record.kind === "input-rejected") {
      // @ts-expect-error — replay's signature requires a DecisionAuditRecord; a RejectedAuditRecord has no action/requirements/now to replay, so this must not typecheck.
      replay(record, []);
    }
  });
});
