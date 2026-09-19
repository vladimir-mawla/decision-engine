import type { JSX } from "react";
import type { DecisionAuditRecord } from "../lib/audit/record.js";
import { OutcomeBadge, outcomeKind, visualFor } from "./OutcomeBadge.js";
import { ConfidenceMeter } from "./ConfidenceMeter.js";
import { EvidenceList } from "./EvidenceList.js";
import { MissingInfoPanel } from "./MissingInfoPanel.js";
import { AuditTrail } from "./AuditTrail.js";
import { confidenceBarFor, formatUsd, reversibilityLabel } from "./decision-helpers.js";

interface DecisionCardProps {
  readonly record: DecisionAuditRecord;
  readonly title: string;
  readonly narrative?: string;
  readonly reversibilityRationale?: string;
  /** `null` (default): no server replay ran for this rendering (the client-side interactive widget). `true`/`false`: a server-side `replay()` actually ran — see AuditTrail's own note on why that check is server-only. */
  readonly replayVerified?: boolean | null;
  /** Collapses evidence/audit into a <details> and drops the narrative — used by the gallery and the outcome strip, where several cards sit side by side. */
  readonly compact?: boolean;
}

/**
 * The one composed rendering of a full decision: outcome, its confidence
 * vs. the bar its stakes demand, the evidence read, the named missing
 * information, and the audit trail behind it — everything M8's brief
 * requires on one screen, in one component, reused by the interactive
 * stakes explorer, the four-escalate-causes gallery, and the other-
 * outcomes strip so all three never drift out of sync with each other.
 */
export function DecisionCard({
  record,
  title,
  narrative,
  reversibilityRationale,
  replayVerified = null,
  compact = false,
}: DecisionCardProps): JSX.Element {
  const { action, decision, rule } = record;
  const kind = outcomeKind(decision.outcome, rule);
  const { blurb } = visualFor(kind);
  const bar = confidenceBarFor(action.reversibility, action.costOfBeingWrong);
  const confidence = rule.kind === "confidence-bar" ? rule.aggregate : decision.outcome === "execute" ? decision.confidence : null;

  const evidenceAndAudit = (
    <>
      <section className="decision-card__section">
        <h4 className="decision-card__subhead">Evidence read</h4>
        <EvidenceList evidence={decision.evidence} now={record.now} />
      </section>
      <section className="decision-card__section">
        <h4 className="decision-card__subhead">Audit record</h4>
        <AuditTrail record={record} replayVerified={replayVerified} />
      </section>
    </>
  );

  return (
    <article className={`decision-card outcome-${kind}${compact ? " decision-card--compact" : ""}`}>
      <header className="decision-card__header">
        <OutcomeBadge outcome={decision.outcome} rule={rule} size={compact ? "sm" : "lg"} />
        <span className="mono decision-card__action">
          {action.domain}/{action.type}
        </span>
      </header>

      <h3 className="decision-card__title">{title}</h3>
      <p className="decision-card__blurb">{blurb}</p>
      {!compact && narrative && <p className="decision-card__narrative">{narrative}</p>}

      <section className="decision-card__stakes">
        <div className="decision-card__stake">
          <span className="decision-card__stake-label">Reversibility</span>
          <span className="decision-card__stake-value">{reversibilityLabel(action.reversibility)}</span>
        </div>
        <div className="decision-card__stake">
          <span className="decision-card__stake-label">Cost of being wrong</span>
          <span className="mono decision-card__stake-value">{formatUsd(action.costOfBeingWrong)}</span>
        </div>
      </section>

      {!compact && reversibilityRationale && (
        <p className="decision-card__rationale">{reversibilityRationale}</p>
      )}

      <ConfidenceMeter confidence={confidence} bar={bar} kind={kind} />

      <section className="decision-card__section">
        <h4 className="decision-card__subhead">Missing information</h4>
        <MissingInfoPanel decision={decision} />
      </section>

      {compact ? (
        <details className="decision-card__details">
          <summary>Evidence & audit trail</summary>
          {evidenceAndAudit}
        </details>
      ) : (
        evidenceAndAudit
      )}
    </article>
  );
}
