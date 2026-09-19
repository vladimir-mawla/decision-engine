import { ageOf, isFresh, type Age, type CapturedAt, type Milliseconds } from "./time.js";
import type { Confidence } from "../contracts/confidence.js";
import type { Requirement, Supplier } from "./requirement.js";
import type { Signal } from "./signal.js";

/**
 * A Gap is a structured, named record of "this requirement is not
 * currently satisfied, and here is exactly why" — the mechanism behind
 * `missing-information-is-named-never-implied`. There is deliberately no
 * "generic unmet requirement" catch-all variant: every Gap says which of
 * the three ways a requirement can fail to be satisfied actually happened,
 * because M4 (and a human reading an audit trail) needs that distinction
 * to decide what to do next, not just that "something" is missing:
 *
 * - `absent`           — no signal of the required kind exists at all
 *   among what was supplied. Nothing to point to; carries only the
 *   requirement and its supplier.
 * - `stale`            — a signal of the right kind exists, but every
 *   candidate is older than the requirement's `maxAge`. THIS IS THE CASE
 *   THAT PROVES "a stale signal counts as missing, not present" — the
 *   signal is right there in `available`, and it still produces a Gap,
 *   never a satisfied requirement. Carries the freshest candidate found
 *   (for the audit trail — "here's what we found, and it wasn't fresh
 *   enough") plus its actual age.
 * - `below-confidence` — a fresh signal of the right kind exists, but its
 *   own confidence doesn't clear `requirement.minConfidence`. Carries the
 *   signal and its actual confidence, for the same reason as `stale`.
 *
 * Each variant carries `requirement` and `supplier` so a consumer never
 * has to re-derive "who could resolve this" from the requirement
 * separately — see requirement.ts's own note on why `supplier` is
 * deliberately shaped to map directly onto lib/contracts's
 * MissingFact/MissingTime/MissingJudgment.
 */
export type Gap =
  | { readonly reason: "absent"; readonly requirement: Requirement; readonly supplier: Supplier }
  | {
      readonly reason: "stale";
      readonly requirement: Requirement;
      readonly supplier: Supplier;
      readonly signal: Signal;
      readonly age: Milliseconds;
    }
  | {
      readonly reason: "below-confidence";
      readonly requirement: Requirement;
      readonly supplier: Supplier;
      readonly signal: Signal;
      readonly actualConfidence: Confidence;
    };

/**
 * DELIBERATE DESIGN CHOICE — low confidence is a Gap, not a "low-confidence
 * presence": a candidate signal that IS fresh but falls short of
 * `minConfidence` produces a `below-confidence` Gap, exactly like an
 * absent or stale one, rather than being handed back to the caller as
 * "present, just weak" for the caller to decide what to do with. Reasoning:
 *
 *   1. Symmetry with staleness. The milestone brief calls out "a stale
 *      signal counts as missing, not present" as the one invariant to get
 *      unmistakably right. Low confidence is the same shape of problem —
 *      the evidence exists, but doesn't clear the bar this requirement
 *      set — and treating it differently (as a value the caller must
 *      still remember to double-check) would reopen exactly the crack
 *      that rule exists to close for the freshness axis.
 *   2. It keeps `analyzeGaps`'s contract simple and total: a Requirement is
 *      either satisfied (produces no Gap) or it isn't (produces exactly
 *      one Gap naming why). A third bucket — "satisfied-but-flagged" —
 *      would force every caller (M4 today, anything later) to handle two
 *      different shapes of "kind of satisfied", which is precisely the
 *      "pile of conditionals" this milestone's brief warns a bad Requirement
 *      model would force onto M4.
 *   3. It does not throw away information: `below-confidence` still
 *      carries the actual signal and its actual confidence (unlike
 *      `absent`, which has nothing to point to), so a caller that wants to
 *      report "we saw X, at 40% confidence, but needed 80%" — as opposed
 *      to "we saw nothing" — still can, from the Gap alone.
 */
interface Candidate {
  readonly signal: Signal;
  readonly age: Age;
}

function candidatesFor(
  requirement: Requirement,
  available: readonly Signal[],
  now: CapturedAt,
): readonly Candidate[] {
  return available
    .filter((signal) => signal.kind === requirement.signalKind)
    .map((signal) => ({ signal, age: ageOf(signal.capturedAt, now) }));
}

/**
 * Pure function of (requirements, available signals, now) — no hidden
 * clock read, no mutation of its inputs, same three arguments in always
 * produce the same Gaps out. That purity is what lets this be tested
 * exhaustively without the decision engine (M4) existing yet, and it is
 * what lets M4 later call this once per decision and trust the result
 * without re-deriving any of this logic itself.
 *
 * For each requirement, among the signals whose `kind` matches:
 *   1. If any candidate is BOTH fresh (per `requirement.maxAge`) AND meets
 *      `requirement.minConfidence` — the requirement is satisfied, no Gap.
 *   2. Else if any candidate is fresh (but none meet the confidence bar) —
 *      exactly one `below-confidence` Gap, for the fresh candidate with
 *      the highest confidence (the closest miss, most useful to surface).
 *   3. Else if any candidate exists at all (none are fresh) — exactly one
 *      `stale` Gap, for the most recently captured candidate (the
 *      freshest failure, i.e. the strongest case that still isn't good
 *      enough).
 *   4. Else (no candidate of this kind at all) — exactly one `absent` Gap.
 *
 * A clock-inconsistent candidate (see time.ts) is never treated as fresh,
 * so it can only ever contribute to case 3 or 4, never case 1 or 2 — a
 * signal whose own timestamp cannot be trusted relative to `now` can never
 * count as satisfying evidence.
 */
export function analyzeGaps(
  requirements: readonly Requirement[],
  available: readonly Signal[],
  now: CapturedAt,
): readonly Gap[] {
  const gaps: Gap[] = [];

  for (const requirement of requirements) {
    const candidates = candidatesFor(requirement, available, now);

    const fresh = candidates.filter((c) => isFresh(c.age, requirement.maxAge));
    const satisfying = fresh.filter((c) => c.signal.confidence >= requirement.minConfidence);

    if (satisfying.length > 0) {
      continue; // requirement met — no Gap.
    }

    if (fresh.length > 0) {
      const closest = fresh.reduce((best, c) =>
        c.signal.confidence > best.signal.confidence ? c : best,
      );
      gaps.push({
        reason: "below-confidence",
        requirement,
        supplier: requirement.supplier,
        signal: closest.signal,
        actualConfidence: closest.signal.confidence,
      });
      continue;
    }

    if (candidates.length > 0) {
      const mostRecent = candidates.reduce((best, c) => {
        if (c.age.kind === "clock-inconsistency") return best;
        if (best.age.kind === "clock-inconsistency") return c;
        return c.age.ms < best.age.ms ? c : best;
      });
      const age: Milliseconds = mostRecent.age.kind === "elapsed" ? mostRecent.age.ms : (0 as Milliseconds);
      gaps.push({
        reason: "stale",
        requirement,
        supplier: requirement.supplier,
        signal: mostRecent.signal,
        age,
      });
      continue;
    }

    gaps.push({ reason: "absent", requirement, supplier: requirement.supplier });
  }

  return gaps;
}
