import { expect } from "vitest";
import { decide, type DecideInput } from "../../decide/decide.js";
import { deriveRule } from "../../audit/rule.js";
import { recordDecision } from "../../audit/record.js";
import { replay } from "../../audit/replay.js";
import type { DomainCase } from "../types.js";
import { matchesExpectedOutcome, describeExpectedOutcome, describeRule } from "./expectations.js";

/** Builds the `DecideInput` the frozen engine expects, straight from a `DomainCase` — no transformation, no domain-side logic in between. */
export function toDecideInput(testCase: DomainCase): DecideInput {
  return {
    action: testCase.action,
    requirements: testCase.requirements,
    signals: testCase.signals,
    prohibitions: testCase.prohibitions,
    now: testCase.now,
  };
}

/**
 * The one assertion helper every per-domain test file uses. Runs a
 * `DomainCase` through the real, frozen `decide()`, asserts the outcome
 * AND the mechanical `RuleTrace` cause match what the case declares (never
 * a check of the `reason` text inside `missing`), then runs the full audit round trip
 * (`recordDecision` -> `replay`) and asserts it reproduces exactly —
 * `knownSignals` supplied so a case whose `execute`/`ask`/`defer` outcome
 * depends on a SATISFIED `valueConstraint` (see
 * `.genesis/decisions/0004-value-constraints.md`'s amendment) still
 * replays with full fidelity, not merely the documented `matches: false`
 * a metadata-only replay would otherwise, correctly, report.
 */
export function assertCaseDecidesAndReplaysAsExpected(testCase: DomainCase): void {
  const input = toDecideInput(testCase);

  const decision = decide(input);
  expect(decision.outcome, `${testCase.id}: outcome`).toBe(testCase.expected.outcome);

  const rule = deriveRule(input);
  expect(
    matchesExpectedOutcome(testCase.expected, rule),
    `${testCase.id}: expected ${describeExpectedOutcome(testCase.expected)}, but the rule that fired was ${describeRule(rule)} (${JSON.stringify(rule)})`,
  ).toBe(true);

  const record = recordDecision(input, `audit-${testCase.id}`, testCase.now);
  expect(record.kind, `${testCase.id}: recordDecision should produce a real decision record`).toBe("decision");
  if (record.kind !== "decision") return;

  const result = replay(record, testCase.prohibitions, testCase.signals);
  expect(result.ruleSetMatches, `${testCase.id}: replay should run against the same recorded prohibition set`).toBe(true);
  expect(result.matches, `${testCase.id}: replay (with the original signals supplied as knownSignals) should reproduce the recorded decision exactly`).toBe(true);
}
