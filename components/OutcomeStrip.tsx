import type { JSX } from "react";
import { ALL_DOMAINS } from "../lib/domains/index.js";
import type { DomainCase } from "../lib/domains/types.js";
import { recordDecision } from "../lib/audit/record.js";
import { replay } from "../lib/audit/replay.js";
import { DecisionCard } from "./DecisionCard.js";

/** Server Component — see EscalateGallery.tsx's header comment on why replay() (node:util) is only ever called from a file like this one. */

const ALL_CASES: readonly DomainCase[] = ALL_DOMAINS.flatMap((domain) => domain.cases);

function requireCase(id: string): DomainCase {
  const found = ALL_CASES.find((c) => c.id === id);
  if (found === undefined) {
    throw new Error(`OutcomeStrip: expected a domain case with id "${id}"`);
  }
  return found;
}

/** One real example each of the four non-escalate outcomes — escalate has its own four-way gallery (components/EscalateGallery.tsx). Picked from three different domains so this strip isn't read as "one domain's story." */
const STRIP_CASE_IDS = [
  "moderation-m1-clean-hide", // execute
  "refund-r2-ask-order-number", // ask
  "deploy-d3-defer-canary-window", // defer
  "moderation-m6-legal-takedown", // refuse
] as const;

export function OutcomeStrip(): JSX.Element {
  return (
    <div className="card-grid">
      {STRIP_CASE_IDS.map((id) => {
        const domainCase = requireCase(id);
        const record = recordDecision(
          {
            action: domainCase.action,
            requirements: domainCase.requirements,
            signals: domainCase.signals,
            prohibitions: domainCase.prohibitions,
            now: domainCase.now,
          },
          `strip:${domainCase.id}`,
          domainCase.now,
        );
        if (record.kind !== "decision") {
          return null;
        }
        const replayResult = replay(record, domainCase.prohibitions, domainCase.signals);
        return (
          <DecisionCard
            key={domainCase.id}
            record={record}
            title={domainCase.title}
            narrative={domainCase.narrative}
            reversibilityRationale={domainCase.reversibilityRationale}
            replayVerified={replayResult.matches && replayResult.ruleSetMatches}
            compact
          />
        );
      })}
    </div>
  );
}
