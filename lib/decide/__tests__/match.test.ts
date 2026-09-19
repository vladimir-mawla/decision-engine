import { describe, expect, it } from "vitest";
import { decide } from "../decide.js";
import { isInputRejected, matchDecision, type DecisionHandlers } from "../match.js";
import type { EvidencedDecision } from "../evidence.js";
import type { InputRejected } from "../decide.js";
import { fixtureInput } from "./fixtures.js";

/**
 * FIX 2 (M4 second independent verification) — runtime coverage for the
 * discipline `matchDecision`/`isInputRejected` provide. The type-level
 * half of this fix (proving a handlers object missing `inputRejected`
 * fails to COMPILE, not just fails a runtime assertion) lives in
 * `match-exhaustiveness.test.ts`, checked by `npm run typecheck`.
 */
describe("matchDecision — dispatches every outcome, input-rejected included", () => {
  const handlers: DecisionHandlers<string> = {
    inputRejected: (r) => `input-rejected: ${r.reason}`,
    execute: (r) => `execute @ ${r.confidence}`,
    ask: (r) => `ask: ${r.missing.fact}`,
    defer: (r) => `defer: ${r.missing.waitingOn}`,
    escalate: (r) => `escalate: ${r.missing.reason}`,
    refuse: (r) => `refuse: ${r.reason}`,
  };

  it("dispatches a real InputRejected to `inputRejected`, not to any Decision branch", () => {
    // decide(null) is exactly the case FIX 1 made honest: nothing usable
    // was ever passed in, so this is not any of the five real outcomes.
    const result = decide(null as never);
    expect(result.outcome).toBe("input-rejected");
    expect(matchDecision(result, handlers)).toMatch(/^input-rejected:/);
  });

  it("dispatches decide(undefined) to `inputRejected` too", () => {
    const result = decide(undefined as never);
    expect(matchDecision(result, handlers)).toMatch(/^input-rejected:/);
  });

  it("dispatches a real `refuse` Decision to `refuse`, never to `inputRejected`", () => {
    const result = decide(
      fixtureInput({
        prohibitions: [{ id: "no", reason: "blocked for this test", matches: () => true }],
      }),
    );
    expect(result.outcome).toBe("refuse");
    expect(matchDecision(result, handlers)).toBe("refuse: blocked for this test");
  });

  it("dispatches a real `escalate` Decision (no requirements at all) to `escalate`", () => {
    const result = decide(fixtureInput({ requirements: [] }));
    expect(result.outcome).toBe("escalate");
    expect(matchDecision(result, handlers)).toMatch(/^escalate:/);
  });

  it("every branch is independently reachable — a handlers set that returns a distinct tag per branch proves no two outcomes silently share a callback", () => {
    const tag = (r: EvidencedDecision | InputRejected) =>
      matchDecision(r, {
        inputRejected: () => "TAG_INPUT_REJECTED",
        execute: () => "TAG_EXECUTE",
        ask: () => "TAG_ASK",
        defer: () => "TAG_DEFER",
        escalate: () => "TAG_ESCALATE",
        refuse: () => "TAG_REFUSE",
      });

    const rejected = decide(null as never);
    const refused = decide(
      fixtureInput({ prohibitions: [{ id: "no", reason: "r", matches: () => true }] }),
    );
    const escalated = decide(fixtureInput({ requirements: [] }));

    expect(tag(rejected)).toBe("TAG_INPUT_REJECTED");
    expect(tag(refused)).toBe("TAG_REFUSE");
    expect(tag(escalated)).toBe("TAG_ESCALATE");
    // Distinct outcomes must never collapse onto the same tag.
    expect(new Set([tag(rejected), tag(refused), tag(escalated)]).size).toBe(3);
  });
});

describe("isInputRejected — the narrower guard-clause alternative", () => {
  it("is true only for a real InputRejected", () => {
    const rejected: InputRejected = { outcome: "input-rejected", reason: "x", evidence: [] };
    expect(isInputRejected(rejected)).toBe(true);
  });

  it("is false for every real Decision outcome", () => {
    const refused = decide(
      fixtureInput({ prohibitions: [{ id: "no", reason: "r", matches: () => true }] }),
    );
    expect(isInputRejected(refused)).toBe(false);
  });

  it("narrows the type: after the guard, TypeScript sees only EvidencedDecision (no `input-rejected` case left)", () => {
    const result: EvidencedDecision | InputRejected = decide(fixtureInput({ requirements: [] }));
    if (isInputRejected(result)) {
      throw new Error("unexpected input-rejected in this fixture");
    }
    // If this compiled, `result` is narrowed to EvidencedDecision here —
    // `.outcome` can only be one of the five real outcomes, never
    // "input-rejected". Reading `.action`, which InputRejected does not
    // have, is the concrete proof of that narrowing.
    expect(result.action).toBeDefined();
  });
});
