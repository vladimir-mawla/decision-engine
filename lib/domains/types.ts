import type { Action } from "../contracts/action.js";
import type { Prohibition } from "../decide/prohibition.js";
import type { Requirement } from "../signals/requirement.js";
import type { Signal } from "../signals/signal.js";
import type { CapturedAt } from "../signals/time.js";

/**
 * The one thing every M6 domain contributes, per ADR 0001's own framing
 * (repeated in `.genesis/PLAN.md`'s M6 row): "realistic synthetic data ...
 * as signals and an action's cost/reversibility, never their own outcome
 * logic." A `DomainCase` is exactly that and nothing more — an `Action`,
 * the `Requirement`s and `Prohibition`s that apply to it, the `Signal`s
 * available when it was decided, and `now`. There is no `decide()`-shaped
 * function anywhere in `lib/domains/` — every case is handed, unmodified,
 * to the real `decide()`/`recordDecision()`/`replay()` in the frozen
 * engine (`lib/decide`, `lib/audit`), by the demo script and by this
 * package's own tests alike.
 *
 * `expected` is this case's OWN claim about what `decide()` should return
 * — asserted by `RuleTrace.kind` and structured fields, never by
 * string-matching the `reason` text inside `missing` (the binding constraint from
 * ADR 0001's amendment). `cause` on `escalate` names WHICH of the (now
 * four) mechanically distinct escalate causes this case is expected to hit,
 * so a demo/test failure says "expected human-gap, got value-rejected"
 * instead of a bare "expected escalate, got escalate."
 */
export type ExpectedOutcome =
  | { readonly outcome: "execute" }
  | { readonly outcome: "ask" }
  | { readonly outcome: "defer" }
  | {
      readonly outcome: "escalate";
      readonly cause: "human" | "value-rejected" | "cost-ceiling" | "insufficient-now";
    }
  | { readonly outcome: "refuse" };

export interface DomainCase {
  /** Stable, human-legible id, e.g. "refund-r4-fraud-flag". Used by the demo and by tests to name failures precisely. */
  readonly id: string;
  /** One line, shown by the demo as the case's headline. */
  readonly title: string;
  /** A few sentences of realistic context — the demo prints this so a stranger can follow along without reading the fixture. */
  readonly narrative: string;
  /**
   * Why this action was assigned the reversibility level it carries —
   * argued, not asserted. The demo prints this alongside the outcome so
   * the reversibility argument is legible, not buried in a code comment
   * only a reader of the source would see.
   */
  readonly reversibilityRationale: string;
  readonly action: Action;
  readonly requirements: readonly Requirement[];
  readonly prohibitions: readonly Prohibition[];
  readonly signals: readonly Signal[];
  readonly now: CapturedAt;
  readonly expected: ExpectedOutcome;
}

export interface Domain {
  readonly name: string;
  readonly description: string;
  readonly cases: readonly DomainCase[];
}
