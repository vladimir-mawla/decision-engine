import type { JSX } from "react";
import type { SignalSnapshot } from "../lib/audit/snapshot.js";
import type { Provenance } from "../lib/signals/provenance.js";
import { ageMs, formatDuration, formatPercent } from "./decision-helpers.js";

function describeSource(source: Provenance): string {
  switch (source.kind) {
    case "counterparty":
      return `counterparty — ${source.party}`;
    case "system":
      return `system — ${source.system}`;
    case "human":
      return `human — ${source.who}`;
    case "derived":
      return `derived — ${source.rule}`;
  }
}

interface EvidenceListProps {
  readonly evidence: readonly SignalSnapshot[];
  readonly now: string;
}

/**
 * The evidence a decision actually read — metadata only (kind, source,
 * confidence, age), exactly what `lib/audit/snapshot.ts`'s own header
 * comment says is enough to explain (and replay) a decision without
 * disclosing any signal's real value. If `evidence` is empty, that's
 * itself meaningful (a prohibition or an unusable input never got as far
 * as reading any signal — lib/decide/decide.ts's own DECISION 2) and is
 * shown as a plain, honest empty state rather than hidden.
 */
export function EvidenceList({ evidence, now }: EvidenceListProps): JSX.Element {
  if (evidence.length === 0) {
    return (
      <p className="evidence-empty">
        No evidence was read for this decision — it was resolved before any signal was examined.
      </p>
    );
  }

  return (
    <ul className="evidence-list">
      {evidence.map((signal) => (
        <li key={signal.id} className="evidence-list__item">
          <span className="evidence-list__kind">{signal.kind}</span>
          <span className="evidence-list__source">{describeSource(signal.source)}</span>
          <span className="mono evidence-list__confidence">{formatPercent(signal.confidence, 0)}</span>
          <span className="mono evidence-list__age">{formatDuration(ageMs(signal.capturedAt, now))}</span>
        </li>
      ))}
    </ul>
  );
}
