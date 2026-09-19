import type { RuleTrace } from "../lib/audit/rule.js";
import type { AuditRecord, DecisionAuditRecord } from "../lib/audit/record.js";
import { requiredConfidence } from "../lib/cost-model/requiredConfidence.js";
import type { Reversibility } from "../lib/cost-model/reversibility.js";
import type { CostOfBeingWrong } from "../lib/cost-model/cost.js";

/**
 * Shared, framework-free presentation logic for the M8 demo UI. This file
 * is imported by BOTH a Server Component (the static "at rest" gallery in
 * app/page.tsx) and a Client Component (components/StakesExplorer.tsx),
 * so — like every module under lib/ this project already keeps isomorphic
 * — it must never import anything Node-only. It doesn't: everything below
 * is arithmetic, string formatting, and reading already-computed fields
 * off a RuleTrace/AuditRecord. See lib/audit/replay.ts's own "node:util"
 * import for the ONE place in this whole project that isn't isomorphic,
 * and why that one stays server-only (app/page.tsx's own header comment).
 */

export type EscalateCause = "human" | "value-rejected" | "cost-ceiling" | "insufficient-now";

/**
 * The mandatory M8 requirement (`.genesis/PLAN.md`'s M8 row, "Escalate
 * legibility"): four mechanically distinct escalate causes, told apart by
 * `RuleTrace.kind` plus its `cleared`/`saturated` fields — NEVER by reading
 * the prose carried by `missing`'s own `reason` field. This mirrors
 * `lib/domains/shared/expectations.ts`'s `matchesExpectedOutcome` exactly
 * (that function takes a case's *declared* expectation and a RuleTrace;
 * this one derives the cause from a RuleTrace alone, which is what a UI
 * rendering an arbitrary decision actually has).
 *
 * Returns `null` for an `escalate` whose RuleTrace is one of the
 * project's other, defensive-only causes (`no-requirements`,
 * `internal-inconsistency`, `internal-error`) — none of the 23 real
 * domain cases in `lib/domains` ever produce one of those, but a UI that
 * silently mapped them to one of the four headline causes would be
 * fabricating a story the engine never told. Callers render a fifth,
 * honest "needs review" presentation for that case instead (see
 * `components/OutcomeBadge.tsx`).
 */
export function escalateCause(rule: RuleTrace): EscalateCause | null {
  if (rule.kind === "gap" && rule.supplierKind === "human") return "human";
  if (rule.kind === "value-rejected") return "value-rejected";
  if (rule.kind === "confidence-bar" && !rule.cleared && rule.saturated) return "cost-ceiling";
  if (rule.kind === "confidence-bar" && !rule.cleared && !rule.saturated) return "insufficient-now";
  return null;
}

export function isDecisionRecord(record: AuditRecord): record is DecisionAuditRecord {
  return record.kind === "decision";
}

/** The confidence bar this action's stakes demand — always computable from `reversibility`/`costOfBeingWrong` alone, regardless of which RuleTrace actually fired (a prohibition or a gap can resolve a decision before the bar is ever checked, but the bar itself is still a real, displayable fact about the stakes). */
export function confidenceBarFor(reversibility: Reversibility, cost: CostOfBeingWrong): number {
  return requiredConfidence(reversibility, cost);
}

const REVERSIBILITY_LABEL: Readonly<Record<Reversibility, string>> = {
  "reversible-no-trace": "Reversible — no trace",
  "reversible-with-cost": "Reversible — with cost",
  "reversible-with-delay": "Reversible — with delay",
  irreversible: "Irreversible",
};

export function reversibilityLabel(level: Reversibility): string {
  return REVERSIBILITY_LABEL[level];
}

const REVERSIBILITY_SHORT: Readonly<Record<Reversibility, string>> = {
  "reversible-no-trace": "No trace",
  "reversible-with-cost": "With cost",
  "reversible-with-delay": "With delay",
  irreversible: "Irreversible",
};

export function reversibilityShort(level: Reversibility): string {
  return REVERSIBILITY_SHORT[level];
}

export function formatUsd(amount: number): string {
  const hasFraction = Math.abs(amount % 1) > 1e-9;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(amount);
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** Non-negative age in milliseconds. Display-only: never fed back into decide() — the engine's own age math (lib/signals/time.ts) is untouched by this. */
export function ageMs(capturedAt: string, now: string): number {
  return Math.max(0, Date.parse(now) - Date.parse(capturedAt));
}

export function formatDuration(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 60) return `${minutes.toFixed(0)}m ago`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)}h ago`;
  const days = hours / 24;
  return `${days.toFixed(1)}d ago`;
}

export function formatIsoShort(iso: string): string {
  try {
    return new Date(iso).toISOString().replace(".000Z", "Z").replace("T", " ");
  } catch {
    return iso;
  }
}
