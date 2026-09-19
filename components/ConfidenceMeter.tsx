import type { JSX } from "react";
import { formatPercent } from "./decision-helpers.js";
import type { OutcomeKind } from "./OutcomeBadge.js";

interface ConfidenceMeterProps {
  /** The aggregate confidence `decide()` actually reached, or `null` when aggregation never ran (a prohibition or a gap resolved this decision before the confidence bar was ever checked). */
  readonly confidence: number | null;
  /** requiredConfidence(reversibility, cost) — always computable, shown even when `confidence` is null, because the bar is a fact about the stakes, not about whether evidence happened to reach it. */
  readonly bar: number;
  readonly kind: OutcomeKind;
}

/**
 * A horizontal meter: a filled track for the aggregate confidence actually
 * reached (min-aggregated across every requirement — lib/decide/aggregate.ts),
 * plus a marker for the bar that confidence had to clear
 * (lib/cost-model/requiredConfidence.ts). Both numbers are real outputs of
 * the engine, formatted here, never invented for display.
 */
export function ConfidenceMeter({ confidence, bar, kind }: ConfidenceMeterProps): JSX.Element {
  const barPct = Math.min(100, Math.max(0, bar * 100));
  const confPct = confidence === null ? null : Math.min(100, Math.max(0, confidence * 100));

  return (
    <div className="confidence-meter">
      <div className="confidence-meter__track">
        {confPct !== null && (
          <div
            className={`confidence-meter__fill confidence-meter__fill--${kind}`}
            style={{ width: `${confPct}%` }}
          />
        )}
        <div className="confidence-meter__bar-marker" style={{ left: `${barPct}%` }} title={`required bar: ${formatPercent(bar, 2)}`} />
      </div>
      <div className="confidence-meter__labels">
        <span className="mono">
          {confidence === null ? "confidence — not evaluated" : `confidence ${formatPercent(confidence, 2)}`}
        </span>
        <span className="mono confidence-meter__bar-label">bar {formatPercent(bar, 2)}</span>
      </div>
    </div>
  );
}
