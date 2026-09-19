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
  unreachableBarReason,
  humanGapReason,
  insufficientNowReason,
  internalErrorReason,
  internalInconsistencyReason,
  noRequirementsReason,
  unusableInputReason,
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
 * The result of `decide()` when there was never a real `Decision` to make
 * at all — `input` itself was missing (`null`/`undefined`), or its
 * `action` field could not even be read without throwing (a hostile
 * getter, or a `Proxy` that throws on every access). This is deliberately
 * NOT a `Decision`: every one of the five outcomes in
 * `lib/contracts/decision.ts` (frozen) requires a real `action: Action`,
 * and there is no honest `Action` to put there — fabricating a
 * placeholder would misrepresent what was evaluated (see the FAIL CLOSED
 * comment below for the full reasoning on why this is a separate case
 * from an ordinary fail-closed `escalate`).
 *
 * `outcome: "input-rejected"` is intentionally not one of
 * `"execute" | "ask" | "defer" | "escalate" | "refuse"` — a caller
 * switching over `Decision.outcome` elsewhere in this codebase (M6/M5)
 * cannot mistake this for a real outcome, and
 * `__tests__/no-outcome-without-signals.test.ts`'s structural scan (which
 * only matches those five literal strings) correctly does not flag this
 * object literal as "constructing a Decision outside evidence.ts" —
 * because it isn't one. `evidence: []` is included (rather than omitted)
 * only so every value `decide()` can return shares an `evidence` field of
 * the same type, letting callers read `.evidence`/`.outcome` on the
 * union without narrowing first; it is always `[]` here because when
 * `input` itself is unusable, `input.signals` is never reached either.
 */
export interface InputRejected {
  readonly outcome: "input-rejected";
  /** Why nothing could be evaluated — never the message from the thrown error itself (that could be anything, including something misleading), always this module's own honest account. */
  readonly reason: string;
  readonly evidence: readonly Signal[];
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
 * INVARIANT no-outcome-without-signals: every path that produces a real
 * `Decision` funnels through one of the `to*Decision` builders in
 * evidence.ts, each of which REQUIRES an `evidence` argument — this
 * function never writes any of the five sanctioned Decision-outcome
 * literals itself (execute / ask / defer / escalate / refuse — see
 * `__tests__/no-outcome-without-signals.test.ts`, whose structural scan
 * checks for exactly those five). `evidence` is always either
 * `input.signals` verbatim (the exact array this function actually
 * examined) or `[]` (when a prohibition fired and `input.signals` was
 * never even read, or when `input` was rejected before anything was read
 * at all — see DECISION 2 below and `InputRejected` above).
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
 *
 * THE DEFECT THIS FIXES (M4 independent verification, FIX 1): the
 * try/catch above used to be the ENTIRE story, and the `catch` block built
 * its escalate fallback by re-reading `input.action` — i.e. it read
 * `input` again, inside the handler that exists specifically because
 * reading `input` could throw. When `input` itself was the hostile thing
 * (`null`, `undefined`, or a `Proxy` whose `get` trap throws on every
 * property, including `action`), that second read threw INSIDE the catch,
 * and there was nothing left to catch it — `decide(null)` and
 * `decide(undefined)` threw `TypeError: Cannot read properties of
 * null/undefined (reading 'action')` straight out of the function, which
 * directly falsified this comment's own claim that `decide()` never
 * throws. The fix: read `input.action` exactly ONCE, defensively, before
 * either try block runs, and capture it in a local (`action`) that the
 * later fallback reads instead of ever touching `input` a second time.
 *
 * WHAT "NO USABLE ACTION" SHOULD EVEN MEAN: once `action` cannot be
 * obtained at all, there is no honest `Decision` to return — every one of
 * the five outcomes (lib/contracts/decision.ts, frozen) requires a real
 * `action: Action`, and fabricating a placeholder Action to force this
 * into, say, `escalate` would be worse than admitting failure plainly: a
 * consumer (an audit trail, a UI) would see a normal-looking `escalate`
 * with a made-up action and reasonably assume SOME action was actually
 * evaluated. It wasn't. So this is not folded into the existing
 * fail-closed `escalate` path at all — it is its own `InputRejected`
 * result (see above), with no `action` field, that cannot be confused
 * with a real Decision.
 */
export function decide(input: DecideInput): EvidencedDecision | InputRejected {
  // Read `input.action` exactly once, before either try block below, and
  // never again. `input` may be `null`, `undefined`, or a hostile object
  // whose `action` getter throws — any of those makes THIS read throw,
  // and only this read; nothing downstream re-reads `input` to build a
  // fallback, which is the actual fix for the defect described above.
  let action: DecideInput["action"];
  try {
    action = input.action;
  } catch {
    return { outcome: "input-rejected", reason: unusableInputReason(), evidence: [] };
  }

  // `action` present but not actually an Action-shaped value (e.g. a
  // string, per the pre-existing "completely garbage top-level inputs"
  // fail-closed test) still goes through the ordinary escalate path below
  // — decideInner already fails closed on that. Only the two cases where
  // there is NOTHING there at all (missing key, or an explicit null/
  // undefined input) are rejected up front, because there is then
  // nothing later to even attempt reading defensively.
  if (action === null || action === undefined) {
    return { outcome: "input-rejected", reason: unusableInputReason(), evidence: [] };
  }

  try {
    return decideInner(input);
  } catch {
    // `action` was captured above, BEFORE decideInner ran — never
    // re-read from `input` here. Embedding this reference does not
    // itself read any of the action's own fields (a hostile getter on,
    // say, `action.costOfBeingWrong` is simply never invoked by this
    // line), so this cannot throw a second time the way the original
    // defect did.
    return toEscalateDecision(
      action,
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
  // FIX 2 (M4 verification): this used to be worded as "unreachable ...
  // permanently" — see reasons.ts's costCeilingReason doc comment for why
  // that overclaimed and what the honest version says instead.
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
