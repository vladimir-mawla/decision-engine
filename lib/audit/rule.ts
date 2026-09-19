import { parseConfidence } from "../contracts/confidence.js";
import { requiredConfidence } from "../cost-model/requiredConfidence.js";
import { analyzeGaps } from "../signals/gap.js";
import type { Supplier } from "../signals/requirement.js";
import {
  aggregateConfidence,
  findProhibition,
  findSatisfaction,
  isBarSaturated,
  selectWinningGap,
  type DecideInput,
} from "../decide/index.js";

/**
 * "A record names ... the exact rule that fired" (M5 brief). `decide()`
 * itself (lib/decide/decide.ts, frozen) returns only an outcome plus prose
 * (`reason`/`missing.reason`) — enough for a human, not enough for a
 * program to name *which* branch of ADR 0002's six decisions actually
 * produced it, or which specific signal/requirement/prohibition was
 * decisive. `deriveRule` recovers that by re-running the SAME public,
 * pure, already-tested building blocks `decide.ts` itself calls
 * (`findProhibition`, `analyzeGaps`, `selectWinningGap`,
 * `aggregateConfidence`, `isBarSaturated`, `requiredConfidence`) in the
 * same order — never by re-implementing their logic, and never by editing
 * `lib/decide/**` (frozen for this milestone). Because every one of those
 * functions is pure and `decide()` calls them on the exact same
 * `DecideInput`, `deriveRule(input)` and `decide(input)` are guaranteed to
 * agree on which branch fired — see
 * `__tests__/rule.test.ts`'s "agrees with decide()" property test, which
 * checks this across many generated cases rather than asserting it once.
 *
 * FAIL CLOSED, independently of decide()'s own guarantee: `deriveRule`
 * wraps its entire body in one try/catch, exactly like `decide()`'s own
 * outer guard, and returns `{ kind: "internal-error" }` rather than
 * throwing for any hostile input. This is a SEPARATE guarantee from
 * `decide()`'s — `deriveRule` is only ever called (see `record.ts`) after
 * `decide()` has already returned a real `EvidencedDecision` for this same
 * `input`, but it re-reads `input` independently and must not assume that
 * make it safe to skip its own defense.
 */
export type RuleTrace =
  | { readonly kind: "prohibition"; readonly prohibitionId: string; readonly reason: string }
  | {
      readonly kind: "gap";
      readonly gapReason: "absent" | "stale" | "below-confidence";
      readonly supplierKind: Supplier["kind"];
      readonly requirementSignalKind: string;
      /** `null` only for an `absent` gap — there is genuinely no signal to point to. */
      readonly signalId: string | null;
    }
  | { readonly kind: "no-requirements" }
  | { readonly kind: "internal-inconsistency"; readonly requirementSignalKind: string }
  | {
      readonly kind: "confidence-bar";
      readonly cleared: boolean;
      readonly saturated: boolean;
      readonly requirementSignalKind: string;
      readonly limitingSignalId: string;
      readonly bar: number;
      readonly aggregate: number;
    }
  | { readonly kind: "internal-error" };

export function deriveRule(input: DecideInput): RuleTrace {
  try {
    const { action, requirements, signals, prohibitions, now } = input;

    const prohibition = findProhibition(action, prohibitions);
    if (prohibition !== null) {
      return { kind: "prohibition", prohibitionId: prohibition.id, reason: prohibition.reason };
    }

    const gaps = analyzeGaps(requirements, signals, now);
    if (gaps.length > 0) {
      const winner = selectWinningGap(gaps);
      if (winner === null) {
        return { kind: "internal-error" };
      }
      return {
        kind: "gap",
        gapReason: winner.reason,
        supplierKind: winner.supplier.kind,
        requirementSignalKind: winner.requirement.signalKind,
        signalId: winner.reason === "absent" ? null : winner.signal.id,
      };
    }

    if (requirements.length === 0) {
      return { kind: "no-requirements" };
    }

    const aggregate = aggregateConfidence(requirements, signals, now);
    if (aggregate === null) {
      const suspect = requirements.find((r) => findSatisfaction(r, signals, now) === null);
      return {
        kind: "internal-inconsistency",
        requirementSignalKind: suspect === undefined ? "unknown" : suspect.signalKind,
      };
    }

    const bar = parseConfidence(requiredConfidence(action.reversibility, action.costOfBeingWrong));
    if (!bar.ok) {
      return { kind: "internal-error" };
    }

    return {
      kind: "confidence-bar",
      cleared: aggregate.confidence >= bar.value,
      saturated: isBarSaturated(action),
      requirementSignalKind: aggregate.limiting.requirement.signalKind,
      limitingSignalId: aggregate.limiting.signal.id,
      bar: bar.value,
      aggregate: aggregate.confidence,
    };
  } catch {
    return { kind: "internal-error" };
  }
}
