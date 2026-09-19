import type { JSX } from "react";
import type { DecisionAuditRecord } from "../lib/audit/record.js";
import type { ValueConstraint } from "../lib/signals/constraint.js";
import { describeRule } from "../lib/domains/shared/expectations.js";
import { formatIsoShort, formatPercent } from "./decision-helpers.js";
import { ReplayIcon } from "./icons.js";

function describeConstraint(constraint: ValueConstraint): string {
  switch (constraint.op) {
    case "equals":
      return `must equal ${JSON.stringify(constraint.value)}`;
    case "lte":
      return `must be ≤ ${constraint.value}`;
    case "gte":
      return `must be ≥ ${constraint.value}`;
    case "in":
      return `must be one of ${JSON.stringify(constraint.values)}`;
  }
}

function durationLabel(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 48) return `${hours.toFixed(hours < 1 ? 2 : 0)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

interface AuditTrailProps {
  readonly record: DecisionAuditRecord;
  /** `null` when this rendering never asked the server to verify replay (the client-side interactive widget — see components/StakesExplorer.tsx's own header comment on why). `true`/`false` when a server-side replay() actually ran (lib/audit/replay.ts, which is why this check happens server-side: it is the one function in this project that isn't isomorphic). */
  readonly replayVerified: boolean | null;
}

/**
 * "A record names ... the exact rule that fired" (M5 brief) — this is
 * where that record becomes legible to a stranger: which rule fired
 * (`RuleTrace`, described by the SAME `describeRule` the M6 demo script
 * uses, imported rather than re-derived, so this can never say something
 * different from `npm run demo:domains`'s own output), every requirement
 * this decision was evaluated against, and how many prohibitions were
 * checked before evidence was ever read.
 */
export function AuditTrail({ record, replayVerified }: AuditTrailProps): JSX.Element {
  return (
    <div className="audit-trail">
      <dl className="audit-trail__meta">
        <div>
          <dt>record id</dt>
          <dd className="mono">{record.id}</dd>
        </div>
        <div>
          <dt>recorded at</dt>
          <dd className="mono">{formatIsoShort(record.recordedAt)}</dd>
        </div>
        <div>
          <dt>rule fired</dt>
          <dd>{describeRule(record.rule)}</dd>
        </div>
        <div>
          <dt>prohibitions checked</dt>
          <dd className="mono">{record.prohibitionIds.length}</dd>
        </div>
      </dl>

      {replayVerified !== null && (
        <p className={`audit-trail__replay audit-trail__replay--${replayVerified ? "ok" : "fail"}`}>
          <ReplayIcon className="audit-trail__replay-icon" />
          {replayVerified
            ? "Replayed server-side: feeding the recorded inputs back through decide() reproduces this exact decision."
            : "Replay did not reproduce this decision exactly — see the demo script's own documented limitation for value-constraint cases."}
        </p>
      )}

      <details className="audit-trail__requirements">
        <summary>{record.requirements.length} requirement{record.requirements.length === 1 ? "" : "s"} this decision was evaluated against</summary>
        <ul>
          {record.requirements.map((requirement) => (
            <li key={requirement.signalKind}>
              <span className="mono audit-trail__req-kind">{requirement.signalKind}</span>
              <span className="audit-trail__req-desc">{requirement.description}</span>
              <span className="mono audit-trail__req-bar">
                {"≥"}{formatPercent(requirement.minConfidence, 0)} · fresh {"≤"}{durationLabel(requirement.maxAge)}
                {requirement.valueConstraint ? ` · ${describeConstraint(requirement.valueConstraint)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
