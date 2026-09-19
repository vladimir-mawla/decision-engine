import type { CapturedAt } from "../signals/time.js";
import type { Requirement } from "../signals/requirement.js";
import type { Signal } from "../signals/signal.js";
import type { Confidence } from "../contracts/confidence.js";
import { findSatisfaction, type Satisfaction } from "./satisfaction.js";
import { parseConfidence } from "../contracts/confidence.js";

/**
 * DECISION 4 — how confidence aggregates.
 *
 * Chosen: **min**. A decision is only as confident as its weakest necessary
 * evidence — if any one required fact is shaky, the decision built on top
 * of it is exactly that shaky, no matter how strong every other requirement
 * looks. The alternative most tempting to reach for, an average, lets
 * strong evidence mask a weak link: five requirements at 0.99 confidence
 * and one at 0.40 average to ~0.93, which reads as "highly confident"
 * while one necessary fact is barely better than a coin flip. A product
 * (multiplying all the confidences together) is defensible too — it
 * compounds every requirement's uncertainty rather than only the worst
 * one — but it punishes a decision with many requirements even when every
 * one of them is individually strong (ten requirements at 0.97 each
 * multiply out to ~0.74, which undersells evidence that is, item by item,
 * excellent), and worse, it has no single signal to point to when asked
 * "why only 0.74" — the answer is "all of them, a little," which is not
 * the kind of concrete explanation this project's audit trail (M5) needs.
 *
 * `min` has the property this project cares about most: it names a
 * **specific limiting signal**. "This decision's confidence is 0.62
 * because `customer.dispute-history` is only 0.62 confident" is a sentence
 * a reviewer can act on (go look at that one signal); "this decision's
 * confidence is 0.62 on average across four signals" is not. That
 * specificity is worth more than the extra strictness a product would add,
 * and it is recorded explicitly below as `Aggregate.limiting` rather than
 * left for a reader to re-derive from the full signal list.
 */
export interface Aggregate {
  readonly confidence: Confidence;
  readonly limiting: Satisfaction;
  readonly satisfactions: readonly Satisfaction[];
}

/**
 * `null` means at least one requirement has no satisfying signal — decide()
 * should never call this in that state (it only aggregates once
 * `analyzeGaps` has already reported zero Gaps for `requirements`), but
 * this function stays honest about its own precondition rather than
 * fabricating a confidence for a requirement it can't actually find
 * evidence for. If `requirements` is empty, there is nothing to aggregate
 * over at all — also `null`; decide.ts treats an empty requirement set as
 * its own named case (see decide.ts), never as "confidence 1.0 by default".
 */
export function aggregateConfidence(
  requirements: readonly Requirement[],
  available: readonly Signal[],
  now: CapturedAt,
): Aggregate | null {
  if (requirements.length === 0) return null;

  const satisfactions: Satisfaction[] = [];
  for (const requirement of requirements) {
    const satisfaction = findSatisfaction(requirement, available, now);
    if (satisfaction === null) return null;
    satisfactions.push(satisfaction);
  }

  // FIX 4 (M4 independent verification): documenting the tie-break this
  // `reduce` already had, in the same voice precedence.ts uses for its own
  // (DECISION 1's) tie-break, so a reader can tell a decision from an
  // oversight. When two or more requirements are satisfied at EXACTLY the
  // same confidence, the strict `<` means the first-occurring one in
  // `satisfactions` (which mirrors `requirements`'s own order — see the
  // loop above) keeps `worst`, so it is the one named as `limiting` — a
  // later candidate at an equal confidence never displaces it. This is
  // deterministic (decide() always calls this with the same `requirements`
  // array in the same order for the same input — no-unreplayable-decision)
  // without inventing a second sort key requirement.ts and this project's
  // other tie-breaks never asked for. It only matters for *which* signal
  // gets named in the reason text — the aggregate `confidence` value
  // itself is identical either way when confidences tie.
  const limiting = satisfactions.reduce((worst, candidate) =>
    candidate.confidence < worst.confidence ? candidate : worst,
  );

  // limiting.confidence is already a validated Confidence (findSatisfaction
  // only accepts finite, in-range values as candidates — see
  // satisfaction.ts's isUsableConfidence), but re-validating through
  // parseConfidence here rather than a direct brand assertion keeps this
  // module honest with the same discipline lib/contracts/validation.ts
  // uses: the ONE place a number becomes a Confidence is a real
  // parseConfidence call, never a shortcut cast to that branded type (see
  // brand-casts.test.ts, which scans for and rejects exactly that
  // shortcut).
  const parsed = parseConfidence(limiting.confidence);
  if (!parsed.ok) {
    // Structurally unreachable — findSatisfaction already required
    // isUsableConfidence — but fail closed rather than assume it: return
    // null so decide() treats this exactly like "cannot aggregate", never
    // like "confidence 1.0".
    return null;
  }

  return { confidence: parsed.value, limiting, satisfactions };
}
