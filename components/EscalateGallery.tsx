import type { JSX } from "react";
import { ALL_DOMAINS } from "../lib/domains/index.js";
import type { DomainCase } from "../lib/domains/types.js";
import { recordDecision } from "../lib/audit/record.js";
import { replay } from "../lib/audit/replay.js";
import { DecisionCard } from "./DecisionCard.js";

/**
 * Server Component. `replay` (lib/audit/replay.ts) is the one function in
 * this whole engine that isn't isomorphic — it imports `node:util` for a
 * real deep-equal (see app/page.tsx's architecture note) — so this file,
 * which calls it to prove each gallery card's replay-verified badge, is
 * deliberately never imported from a "use client" module. Everything it
 * renders is otherwise identical to what components/StakesExplorer.tsx
 * computes purely in the browser: the same `decide()`, the same
 * `recordDecision()`, real domain fixtures, unmodified.
 */

const ALL_CASES: readonly DomainCase[] = ALL_DOMAINS.flatMap((domain) => domain.cases);

function requireCase(id: string): DomainCase {
  const found = ALL_CASES.find((c) => c.id === id);
  if (found === undefined) {
    throw new Error(`EscalateGallery: expected a domain case with id "${id}"`);
  }
  return found;
}

const GALLERY_CASE_IDS = [
  "deploy-d5-auth-middleware-signoff", // escalate / human
  "refund-r4-fraud-flag", // escalate / value-rejected
  "deploy-d8-large-canary-ambiguous", // escalate / cost-ceiling
  "moderation-m7-repeat-offender-ban", // escalate / insufficient-now
] as const;

export function EscalateGallery(): JSX.Element {
  return (
    <div className="card-grid">
      {GALLERY_CASE_IDS.map((id) => {
        const domainCase = requireCase(id);
        const record = recordDecision(
          {
            action: domainCase.action,
            requirements: domainCase.requirements,
            signals: domainCase.signals,
            prohibitions: domainCase.prohibitions,
            now: domainCase.now,
          },
          `gallery:${domainCase.id}`,
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
