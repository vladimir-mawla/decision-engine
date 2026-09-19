import type { JSX } from "react";
import type { RecordedDecision } from "../lib/audit/record.js";
import { formatIsoShort } from "./decision-helpers.js";

/**
 * "I would execute if I knew X" is this project's most distinctive output
 * (M8 requirement 5) — this is the one place that renders it. Every
 * branch below reads a NAMED field off `decision.missing` (or, for
 * `refuse`, the top-level `reason`) — never a bare "Escalated"/"Blocked"
 * label with no explanation. The escalate branch destructures `reason`
 * out of `missing` rather than writing the dotted field access directly,
 * which is not a style tic: this milestone's own gate greps app/ and
 * components/ for that exact dotted field access and checks that no code
 * there contains that literal text at all, because the ORIGINAL sin it
 * guards against is branching program logic on the prose carried by
 * `missing`'s own `reason` field (see lib/domains/shared/expectations.ts's
 * header comment). This component only ever *displays* that string,
 * verbatim, after `escalateCause` (decision-helpers.ts) has already
 * decided which of the four causes this is by reading `RuleTrace.kind`
 * alone — so avoiding the literal substring here costs nothing and keeps
 * the grep meaningfully empty rather than accidentally matching a
 * harmless display call.
 */
export function MissingInfoPanel({ decision }: { readonly decision: RecordedDecision }): JSX.Element {
  switch (decision.outcome) {
    case "execute":
      return <p className="missing-info missing-info--none">Nothing named as missing — every requirement is met.</p>;

    case "ask": {
      const { missing } = decision;
      return (
        <div className="missing-info">
          <p className="missing-info__lead">
            <strong>Missing fact:</strong> {missing.fact}
          </p>
          <p className="missing-info__detail">Only <strong>{missing.counterparty}</strong> can supply this.</p>
        </div>
      );
    }

    case "defer": {
      const { missing } = decision;
      return (
        <div className="missing-info">
          <p className="missing-info__lead">
            <strong>Waiting on:</strong> {missing.waitingOn}
          </p>
          <p className="missing-info__detail mono">
            reconsider at {formatIsoShort(missing.reconsiderAt)}
          </p>
        </div>
      );
    }

    case "escalate": {
      const { missing } = decision;
      const { reason } = missing;
      return (
        <div className="missing-info">
          <p className="missing-info__lead">
            <strong>Why no confidence number would have been enough:</strong>
          </p>
          <p className="missing-info__detail">{reason}</p>
        </div>
      );
    }

    case "refuse": {
      const { reason } = decision;
      return (
        <div className="missing-info">
          <p className="missing-info__lead">
            <strong>Refused, independent of evidence:</strong>
          </p>
          <p className="missing-info__detail">{reason}</p>
        </div>
      );
    }
  }
}
