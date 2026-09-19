import type { RuleTrace } from "../../audit/rule.js";
import type { ExpectedOutcome } from "../types.js";

/**
 * The ONE place in `lib/domains/**` that maps a case's declared
 * `ExpectedOutcome` onto the mechanical discriminator a consumer is
 * allowed to branch on. This is the binding constraint from ADR 0001's
 * amendment, made structural: every check below reads `RuleTrace.kind`
 * (and, for `escalate`, its sibling boolean fields `cleared`/`saturated`)
 * — never a string match against the `reason` text carried inside a
 * decision's `missing` field. One of this milestone's own required gates
 * greps `lib/domains/` and `scripts/` for that exact dotted field-access
 * pattern and must find nothing (deliberately not spelled out as a
 * literal code fragment in this comment either, for the same reason
 * `lib/domains/shared/fixtures.ts` avoids spelling out its own forbidden
 * cast pattern in prose) — this function is why the grep comes back
 * empty.
 *
 * `escalate` alone has four mechanically distinct causes at THIS layer,
 * even though `lib/contracts` (frozen) only ever sees one outcome string,
 * `"escalate"`:
 *   - `human`             — `RuleTrace.kind === "gap"` with `supplierKind
 *     === "human"`.
 *   - `value-rejected`    — `RuleTrace.kind === "value-rejected"` (ADR
 *     0004's own variant — never folded into `"gap"`).
 *   - `cost-ceiling`      — `RuleTrace.kind === "confidence-bar"`,
 *     `cleared === false`, `saturated === true`.
 *   - `insufficient-now`  — `RuleTrace.kind === "confidence-bar"`,
 *     `cleared === false`, `saturated === false`.
 */
export function matchesExpectedOutcome(expected: ExpectedOutcome, rule: RuleTrace): boolean {
  switch (expected.outcome) {
    case "execute":
      return rule.kind === "confidence-bar" && rule.cleared === true;
    case "ask":
      return rule.kind === "gap" && rule.supplierKind === "counterparty";
    case "defer":
      return rule.kind === "gap" && rule.supplierKind === "time";
    case "refuse":
      return rule.kind === "prohibition";
    case "escalate":
      switch (expected.cause) {
        case "human":
          return rule.kind === "gap" && rule.supplierKind === "human";
        case "value-rejected":
          return rule.kind === "value-rejected";
        case "cost-ceiling":
          return rule.kind === "confidence-bar" && rule.cleared === false && rule.saturated === true;
        case "insufficient-now":
          return rule.kind === "confidence-bar" && rule.cleared === false && rule.saturated === false;
      }
  }
}

/** A short, human-legible label for an expected outcome+cause — used by the demo and by test failure messages, never by any branching logic. */
export function describeExpectedOutcome(expected: ExpectedOutcome): string {
  if (expected.outcome !== "escalate") return expected.outcome;
  return `escalate (${expected.cause})`;
}

/** The same idea as `describeExpectedOutcome`, but derived from the ACTUAL `RuleTrace` returned by `deriveRule` — so the demo can print what really happened, not merely what was expected. */
export function describeRule(rule: RuleTrace): string {
  switch (rule.kind) {
    case "prohibition":
      return `prohibition "${rule.prohibitionId}" fired`;
    case "gap":
      return `${rule.gapReason} evidence for "${rule.requirementSignalKind}" (supplier: ${rule.supplierKind})`;
    case "value-rejected":
      return `value rejected for "${rule.requirementSignalKind}" (constraint: ${JSON.stringify(rule.constraint)})`;
    case "no-requirements":
      return "no requirements declared";
    case "internal-inconsistency":
      return `internal inconsistency for "${rule.requirementSignalKind}"`;
    case "confidence-bar":
      return rule.cleared
        ? `confidence ${rule.aggregate.toFixed(4)} cleared bar ${rule.bar.toFixed(4)} (limited by "${rule.requirementSignalKind}")`
        : `confidence ${rule.aggregate.toFixed(4)} did NOT clear bar ${rule.bar.toFixed(4)} (limited by "${rule.requirementSignalKind}", ${rule.saturated ? "ceiling reached" : "headroom remains"})`;
    case "internal-error":
      return "internal error (fail-closed)";
  }
}
