import type { Action } from "../contracts/action.js";
import { parseConfidence, type Confidence } from "../contracts/confidence.js";
import { requiredConfidence } from "../cost-model/requiredConfidence.js";
import { analyzeGaps, type Gap } from "../signals/gap.js";
import type { Requirement } from "../signals/requirement.js";
import type { Signal } from "../signals/signal.js";
import type { CapturedAt } from "../signals/time.js";
import { aggregateConfidence } from "./aggregate.js";
import { deriveReconsiderAt } from "./reconsider.js";
import {
  toAskDecision,
  toDeferDecision,
  toEscalateDecision,
  toExecuteDecision,
  toRefuseDecision,
  type EvidencedDecision,
} from "./evidence.js";
import { findProhibition, type Prohibition } from "./prohibition.js";
import { selectWinningGap } from "./precedence.js";
import {
  clockInconsistencyReason,
  humanGapReason,
  insufficientNowReason,
  internalErrorReason,
  internalInconsistencyReason,
  noRequirementsReason,
  unreachableBarReason,
} from "./reasons.js";
import { findSatisfaction } from "./satisfaction.js";
import { isBarSaturated } from "./stakes.js";

/**
 * `decide()`'s complete input, gathered in one place so the function itself
 * can be a pure function of a single argument (see the header comment
 * below on `no-unreplayable-decision`). Every field is required — no
 * defaults, no optional `prohibitions?` that would silently mean "none
 * declared" versus "none apply after checking" (missing-information-is-
 * named-never-implied applies to decide()'s own inputs, not only its
 * outputs: a caller must say, explicitly, "here are the prohibitions, and
 * there are zero of them" by passing `[]`, rather than omitting the field).
 */
export interface DecideInput {
  readonly action: Action;
  readonly requirements: readonly Requirement[];
  readonly signals: readonly Signal[];
  readonly prohibitions: readonly Prohibition[];
  readonly now: CapturedAt;
}

/**
 * `decide(action, signals)`, per the milestone brief's demo command, maps
 * an action plus its evidence to exactly one of the five outcomes —
 * expanded here to `decide(input)` because M3's gap analysis needs
 * `requirements` too, and DECISION 2 needs `prohibitions`. `now` is an
 * explicit argument, never read from the wall clock internally (no
 * ambient `Date.now`, no call into lib/signals's own real-clock
 * touchpoint) — see `__tests__/determinism.test.ts`'s grep proof and its
 * "same input twice, same output" test, which is this project's concrete stand-in for
 * `no-unreplayable-decision`: the same `DecideInput` value, passed twice,
 * must deep-equal itself in the output, because nothing in this function
 * reads any clock, RNG, or ambient state that isn't part of `input`.
 *
 * INVARIANT no-outcome-without-signals: every return path below funnels
 * through one of the `to*Decision` builders in evidence.ts, each of which
 * REQUIRES an `evidence` argument — this function never writes an
 * `{ outcome: ... }` object literal itself (see
 * `__tests__/no-outcome-without-signals.test.ts`). `evidence` is always
 * either `input.signals` verbatim (the exact array this function actually
 * examined) or `[]` (when a prohibition fired and `input.signals` was
 * never even read — see DECISION 2 below and its dedicated proof test).
 *
 * FAIL CLOSED: the entire body runs inside a try/catch. A hostile Action,
 * Requirement, Signal, or Prohibition (an own or inherited getter that
 * throws when read — the same class of hazard lib/contracts/validation.ts
 * and lib/signals/validation.ts already defend against at the JSON
 * boundary) can make almost any expression in this file throw. Rather than
 * defensively re-wrapping every single field read (which lib/signals/gap.ts
 * and lib/cost-model do not do either, because they trust an already-
 * validated Signal/Action), this function wraps its ENTIRE decision logic
 * once and fails closed to `escalate` on any unexpected exception — see
 * `__tests__/fail-closed.test.ts`. `decide()` itself never throws, for any
 * input.
 */
export function decide(input: DecideInput): EvidencedDecision {
  try {
    return decideInner(input);
  } catch {
    return toEscalateDecision(
      input.action,
      { kind: "human-judgment", reason: internalErrorReason() },
      [],
    );
  }
}

function decideInner(input: DecideInput): EvidencedDecision {
  const { action, requirements, signals, prohibitions, now } = input;

  // ── DECISION 2 — prohibition checked BEFORE any evidence is read. ──────
  // Nothing below this line touches `signals` or `requirements` unless
  // this check clears. See __tests__/prohibition.test.ts, which passes a
  // signals array that throws on every access and proves it is never
  // touched when a prohibition matches.
  const prohibition = findProhibition(action, prohibitions);
  if (prohibition !== null) {
    return toRefuseDecision(action, prohibition.reason, []);
  }

  const gaps = analyzeGaps(requirements, signals, now);

  if (gaps.length > 0) {
    return decideFromGap(action, gaps, signals, now);
  }

  // No gaps — every requirement is met. Two more cases beyond DECISION 3's
  // headline pair (see below): zero requirements at all is its own named
  // failure (never "confidence 1.0 by default"), and an internal
  // disagreement between analyzeGaps and this module's own satisfaction
  // check is failed closed rather than trusted either way.
  if (requirements.length === 0) {
    return toEscalateDecision(
      action,
      { kind: "human-judgment", reason: noRequirementsReason() },
      signals,
    );
  }

  const aggregate = aggregateConfidence(requirements, signals, now);
  if (aggregate === null) {
    const suspect = requirements.find((r) => findSatisfaction(r, signals, now) === null);
    return toEscalateDecision(
      action,
      {
        kind: "human-judgment",
        reason: suspect === undefined ? internalErrorReason() : internalInconsistencyReason(suspect),
      },
      signals,
    );
  }

  const bar = computeConfidenceBar(action);
  if (bar === null) {
    return toEscalateDecision(
      action,
      { kind: "human-judgment", reason: internalErrorReason() },
      signals,
    );
  }

  // ── DECISION 4 — aggregate (min) clears the bar, or it doesn't. ────────
  if (aggregate.confidence >= bar) {
    return toExecuteDecision(action, aggregate.confidence, bar, signals);
  }

  // ── DECISION 3 — escalate, but say which of the two situations this is.
  const reason = isBarSaturated(action)
    ? unreachableBarReason(aggregate.limiting, bar)
    : insufficientNowReason(aggregate.limiting, bar);
  return toEscalateDecision(action, { kind: "human-judgment", reason }, signals);
}

/**
 * `requiredConfidence` (lib/cost-model) returns a plain `number` — it is
 * not itself branded, because the cost model has no reason to depend on
 * lib/contracts's Confidence type. The ONE place that number becomes a
 * `Confidence` for use in a Decision is here, through `parseConfidence` —
 * never a shortcut brand assertion (see lib/contracts/__tests__/brand-casts.test.ts,
 * which scans lib/ for exactly that shortcut and fails the build if it
 * finds one outside confidence.ts). `requiredConfidence`'s own contract
 * guarantees a result in `[BASE_BAR, 0.99]` for every reversibility level,
 * so this should never fail — but "should never" is not "provably can't",
 * so the `null` path is handled by the caller rather than trusted away.
 */
function computeConfidenceBar(action: Action): Confidence | null {
  const bar = requiredConfidence(action.reversibility, action.costOfBeingWrong);
  const parsed = parseConfidence(bar);
  return parsed.ok ? parsed.value : null;
}

function decideFromGap(
  action: Action,
  gaps: readonly Gap[],
  signals: readonly Signal[],
  now: CapturedAt,
): EvidencedDecision {
  // ── DECISION 1 — precedence: human > counterparty > time. ──────────────
  const winner = selectWinningGap(gaps);
  if (winner === null) {
    // Unreachable: this function is only called with gaps.length > 0.
    return toEscalateDecision(
      action,
      { kind: "human-judgment", reason: internalErrorReason() },
      signals,
    );
  }

  switch (winner.supplier.kind) {
    case "human":
      return toEscalateDecision(
        action,
        { kind: "human-judgment", reason: humanGapReason(winner.supplier.reason) },
        signals,
      );

    case "counterparty":
      return toAskDecision(
        action,
        {
          kind: "fact",
          fact: winner.requirement.description,
          counterparty: winner.supplier.party,
        },
        signals,
      );

    case "time": {
      // ── DECISION 6 — an unusable (future-dated) clock reading blocks an
      // honest `defer`: there is no trustworthy age to derive a
      // `reconsiderAt` from, so this escalates instead of deferring on a
      // guess. See reconsider.ts and reasons.ts's clockInconsistencyReason.
      if (winner.reason === "stale" && winner.age.kind === "clock-inconsistency") {
        return toEscalateDecision(
          action,
          { kind: "human-judgment", reason: clockInconsistencyReason(winner.requirement) },
          signals,
        );
      }

      // ── DECISION 5 — reconsiderAt derived from requirement.maxAge, the
      // one real, always-present anchor across every Gap reason.
      return toDeferDecision(
        action,
        {
          kind: "time",
          waitingOn: winner.supplier.waitingOn,
          reconsiderAt: deriveReconsiderAt(now, winner.requirement.maxAge),
        },
        signals,
      );
    }
  }
}
