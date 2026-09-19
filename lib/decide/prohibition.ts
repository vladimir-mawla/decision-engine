import type { Action } from "../contracts/action.js";

/**
 * DECISION 2 — `refuse` needs its own cause, distinct from "confidence too
 * low" (that is `escalate`, ADR 0001). `refuse` means *this action should
 * not happen regardless of who asks or how certain anyone is* — so M4 needs
 * a concept that forbids an action outright, independent of evidence.
 *
 * A `Prohibition` is exactly that: a named, domain-declared rule that either
 * matches an action or doesn't, with no reference to signals, confidence, or
 * requirements anywhere in its shape. That absence is deliberate and is the
 * whole point — a `Prohibition` cannot be satisfied by better evidence
 * because it was never a question about evidence in the first place (e.g.
 * "this system never approves refunds against a frozen account", "this
 * system never auto-deploys to the payments service on a Friday"). If a rule
 * needs a signal to decide whether it applies, it isn't a prohibition, it's
 * a Requirement (lib/signals/requirement.ts) whose absence should produce a
 * Gap — mixing the two would let "we don't have enough information yet"
 * quietly become indistinguishable from "this must never happen," which is
 * exactly the collapse ADR 0001 warns against.
 *
 * `matches` is a predicate over `Action` alone — not `(action, signals)` —
 * so it is structurally impossible to write a Prohibition that needs
 * evidence to evaluate. `decide()` calls `findProhibition` as the FIRST
 * thing it does, before `requirements`/`signals` are read at all (see
 * decide.ts and `__tests__/prohibition.test.ts`, which proves this with a
 * signals array that throws on every access and is never touched when a
 * prohibition fires).
 */
export interface Prohibition {
  /** Stable identifier for this rule, so an audit trail (M5) can name *which* rule fired, not just that one did. */
  readonly id: string;
  /** Why this action should never happen — becomes `RefuseDecision.reason` verbatim. */
  readonly reason: string;
  /** Whether this rule forbids the given action. Pure predicate over Action alone — no signals, no confidence. */
  readonly matches: (action: Action) => boolean;
}

/**
 * Checks `action` against every prohibition, in order, and returns the first
 * match (or `null` if none apply).
 *
 * FAIL-CLOSED under a hostile `matches`: a caller-supplied predicate is
 * exactly the kind of thing that can throw for reasons that have nothing to
 * do with whether the action is actually prohibited (a bug in a domain's own
 * rule, a hostile object masquerading as an Action). Per this project's
 * fail-closed rule (see lib/cost-model's resolveReversibility/
 * resolveCostOfBeingWrong), "cannot be determined" must resolve to the
 * *safer* outcome, not the more permissive one — so a `matches` that throws
 * is treated as a match, not as "doesn't apply." Refusing an action we
 * can't even evaluate safely is the conservative failure; silently letting
 * it through because the check blew up is not.
 */
export function findProhibition(
  action: Action,
  prohibitions: readonly Prohibition[],
): Prohibition | null {
  for (const prohibition of prohibitions) {
    let matched: boolean;
    try {
      matched = prohibition.matches(action);
    } catch {
      matched = true; // fail closed: a check that couldn't run is treated as a match.
    }
    if (matched) return prohibition;
  }
  return null;
}
