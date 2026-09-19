import { ageOf, isFresh, type CapturedAt } from "../signals/time.js";
import type { Requirement } from "../signals/requirement.js";
import type { Signal } from "../signals/signal.js";
import type { Confidence } from "../contracts/confidence.js";
import { checkValueConstraint } from "../signals/constraint.js";

/**
 * The signal that actually satisfies a Requirement, once one exists. `Gap`
 * (lib/signals/gap.ts) tells us a requirement is UNMET and why; it has no
 * equivalent for the met case — `analyzeGaps` just omits the Gap. M4 still
 * needs to know, for a *met* requirement, which signal met it and at what
 * confidence, in order to aggregate (DECISION 4) — so this module answers
 * that half of the question, mirroring `analyzeGaps`'s own candidate
 * selection exactly (see the note on `findSatisfaction` below) so the two
 * never disagree about what counts as "satisfied."
 */
export interface Satisfaction {
  readonly requirement: Requirement;
  readonly signal: Signal;
  readonly confidence: Confidence;
}

/**
 * A signal's own `confidence` field is supposed to already be a validated
 * `Confidence` (branded, [0,1]) by the time it reaches here — but a
 * hand-built object satisfying the `Signal` *shape* without going through
 * `createSignal`/`parseSignal` could still claim a non-finite value (`NaN`,
 * `Infinity`), and `NaN` is uniquely dangerous in comparisons: both
 * `NaN < x` and `NaN >= x` are `false`, so a naive confidence-bar check
 * would silently let a NaN-confidence signal "pass" a `< minConfidence`
 * rejection test that was supposed to filter it out. Guarding explicitly
 * here (rather than trusting every caller's Signal is honest) is this
 * module's contribution to "fail closed for any input, however hostile" —
 * see `__tests__/fail-closed.test.ts`.
 */
function isUsableConfidence(value: unknown): value is Confidence {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Finds the signal that satisfies `requirement`, if any, using the SAME
 * test `analyzeGaps` uses to decide a requirement needs no Gap: a candidate
 * signal of the right `kind`, fresh per `requirement.maxAge` (which also
 * excludes a clock-inconsistent candidate — see time.ts's `isFresh`), and
 * at or above `requirement.minConfidence`. Among multiple qualifying
 * candidates, the highest-confidence one is chosen — the strongest evidence
 * actually available for this requirement, the same "closest/strongest
 * candidate" instinct `analyzeGaps` uses for its own `below-confidence` Gap.
 *
 * This is deliberately NOT imported from gap.ts (whose `candidatesFor` is
 * private, and gap.ts is frozen for this milestone anyway) — duplicating
 * the five-line filter here is a smaller risk than either modifying a
 * frozen file or trying to reverse-engineer "satisfied" from the absence of
 * a Gap. `__tests__/satisfaction.test.ts` asserts the two modules actually
 * agree — `findSatisfaction` returns non-null if and only if `analyzeGaps`
 * produces no Gap for that requirement — so any future drift between them
 * fails loudly instead of silently.
 *
 * VALUE CONSTRAINTS (`.genesis/decisions/0004-value-constraints.md`): when
 * `requirement.valueConstraint` is declared, a candidate must ALSO clear it
 * to count as `best` — checked last, strictly after the fresh/confident
 * filter above, mirroring gap.ts's own ordering exactly. `checkValueConstraint`
 * itself is a shared, generic evaluator (not business logic specific to
 * this module), so it is imported rather than re-implemented — unlike the
 * fresh/confident filter, duplicating a call to a shared pure function
 * buys no independence, only drift risk.
 */
export function findSatisfaction(
  requirement: Requirement,
  available: readonly Signal[],
  now: CapturedAt,
): Satisfaction | null {
  let best: Signal | null = null;

  for (const signal of available) {
    if (signal.kind !== requirement.signalKind) continue;
    if (!isUsableConfidence(signal.confidence)) continue;

    const age = ageOf(signal.capturedAt, now);
    if (!isFresh(age, requirement.maxAge)) continue;
    if (signal.confidence < requirement.minConfidence) continue;

    if (requirement.valueConstraint !== undefined) {
      const check = checkValueConstraint(signal, requirement.valueConstraint, requirement.maxAge, now);
      if (!check.satisfied) continue;
    }

    if (best === null || signal.confidence > best.confidence) {
      best = signal;
    }
  }

  if (best === null) return null;
  return { requirement, signal: best, confidence: best.confidence };
}
