import type {
  EvidencedAskDecision,
  EvidencedDecision,
  EvidencedDeferDecision,
  EvidencedEscalateDecision,
  EvidencedExecuteDecision,
  EvidencedRefuseDecision,
} from "./evidence.js";
import type { InputRejected } from "./decide.js";

/**
 * FIX 2 (M4 second independent verification) — the discipline that makes
 * "narrow `input-rejected` first" the EASY path, not merely the
 * documented one. See `decide.ts`'s header comment on `decide()` for the
 * full "why this is a real risk": TypeScript accepts, with zero
 * `--strict` errors, a call site that narrows on the five real outcomes
 * and treats everything else — silently including `input-rejected` — as
 * safe to proceed on. That is the opposite of this project's fail-closed
 * default, and the return type alone (`EvidencedDecision | InputRejected`)
 * cannot be changed to prevent it: exhaustiveness over a union is a
 * caller-side discipline TypeScript only enforces when the caller opts
 * in (e.g. a `switch` with no `default` over a fully-covered union, or —
 * what this file provides — a handlers object with required properties).
 *
 * `matchDecision` takes one callback per outcome, including
 * `inputRejected`, as REQUIRED properties (no `?`, no default, no
 * catch-all). Omitting any one of them — `inputRejected` included — is a
 * TypeScript compile error at the call site: `Property 'inputRejected'
 * is missing in type '{ execute: ...; ask: ...; ... }'`. See
 * `__tests__/match-exhaustiveness.test.ts` for the type-level proof
 * (a `@ts-expect-error` that `npm run typecheck` enforces).
 *
 * Prefer this over a bare `switch (result.outcome)` / `if` chain from M5
 * onward. A switch can always be extended later with a silently-wrong
 * `default` branch that swallows a case nobody meant to swallow —
 * `matchDecision` gives a caller no such escape hatch: every branch has
 * to be named, every time.
 *
 * Each handler's parameter type is one of evidence.ts's named
 * `Evidenced*Decision` aliases, rather than a locally-written
 * `Extract<EvidencedDecision, { <the discriminant field>: "escalate" }>`
 * — deliberately: writing that discriminant as a literal here would
 * (correctly, for real Decision construction) trip
 * `__tests__/no-outcome-without-signals.test.ts`'s structural scan for
 * that exact text anywhere under lib/decide/ outside evidence.ts, even
 * though this usage would be type-level narrowing, not construction.
 * Rather than special-case that scan for "this literal doesn't count",
 * this file simply never writes the literal.
 */
export interface DecisionHandlers<R> {
  readonly inputRejected: (result: InputRejected) => R;
  readonly execute: (result: EvidencedExecuteDecision) => R;
  readonly ask: (result: EvidencedAskDecision) => R;
  readonly defer: (result: EvidencedDeferDecision) => R;
  readonly escalate: (result: EvidencedEscalateDecision) => R;
  readonly refuse: (result: EvidencedRefuseDecision) => R;
}

/**
 * Dispatches `decide()`'s full result — `EvidencedDecision | InputRejected`
 * — to exactly one of `handlers`'s six callbacks. `input-rejected` is
 * checked FIRST and separately (it is not a member of the
 * `EvidencedDecision` union at all, so it cannot be reached by the
 * `switch` below), matching the discipline `decide()`'s own doc comment
 * requires: input-rejected before any other outcome matching.
 */
export function matchDecision<R>(
  result: EvidencedDecision | InputRejected,
  handlers: DecisionHandlers<R>,
): R {
  if (result.outcome === "input-rejected") {
    return handlers.inputRejected(result);
  }

  switch (result.outcome) {
    case "execute":
      return handlers.execute(result);
    case "ask":
      return handlers.ask(result);
    case "defer":
      return handlers.defer(result);
    case "escalate":
      return handlers.escalate(result);
    case "refuse":
      return handlers.refuse(result);
  }
}

/**
 * A narrower alternative to `matchDecision` for the one idiom that
 * genuinely doesn't need all six branches at once: an early return /
 * guard clause, e.g. `if (isInputRejected(result)) return handleBad(result);`
 * followed by ordinary code that only ever sees a real `EvidencedDecision`.
 * Still puts `input-rejected` first, but — unlike `matchDecision` — does
 * nothing to stop WHATEVER COMES AFTER the guard from later missing one
 * of the five real outcomes with a careless `if`/`else`. `matchDecision`
 * remains the preferred discipline for that reason; this is here for the
 * narrower case where a guard clause reads more naturally.
 */
export function isInputRejected(result: EvidencedDecision | InputRejected): result is InputRejected {
  return result.outcome === "input-rejected";
}
