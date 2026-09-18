import type { CostOfBeingWrong } from "../cost-model/cost.js";
import type { Reversibility } from "../cost-model/reversibility.js";

/**
 * The action a domain is proposing. Deliberately thin: a domain (refund
 * approval, code deploy, content moderation — all M6) contributes only
 * this shape plus signals (M3); it never contributes outcome logic.
 *
 * There is no "value" or "amount" field here. That's deliberate, not an
 * oversight: this project's central modelling rule is that the cost of
 * being wrong is not the value of the action (see lib/cost-model/cost.ts),
 * and the cleanest way to make that rule impossible to violate by accident
 * is to never give Action a face-value field that costOfBeingWrong could be
 * casually copied from. If a domain needs to display or log the action's
 * face value, that belongs in `parameters` (untyped, domain-owned), not
 * promoted to a first-class field that the decision layer could reach for.
 */
export interface Action<TParameters = Readonly<Record<string, unknown>>> {
  readonly domain: string;
  readonly type: string;
  readonly parameters: TParameters;
  readonly costOfBeingWrong: CostOfBeingWrong;
  readonly reversibility: Reversibility;
}
