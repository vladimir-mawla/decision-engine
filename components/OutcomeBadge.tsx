import type { JSX } from "react";
import type { RuleTrace } from "../lib/audit/rule.js";
import type { Decision } from "../lib/contracts/decision.js";
import { escalateCause } from "./decision-helpers.js";
import {
  CheckIcon,
  QuestionIcon,
  ClockIcon,
  StopIcon,
  PersonIcon,
  ShieldSlashIcon,
  CeilingIcon,
  GaugeIcon,
  AlertIcon,
} from "./icons.js";

/**
 * The one function that turns {outcome, RuleTrace} into a rendering
 * "kind" — nine distinct kinds, not five, because `escalate` alone must
 * render as (at least) four visually and textually distinct things (M8's
 * mandatory "Escalate legibility" requirement). This is the single place
 * that decides which of those nine a given decision is, so OutcomeBadge,
 * ConfidenceMeter, and DecisionCard never each re-derive it separately and
 * risk disagreeing.
 */
export type OutcomeKind =
  | "execute"
  | "ask"
  | "defer"
  | "refuse"
  | "escalate-human"
  | "escalate-value"
  | "escalate-cost"
  | "escalate-insufficient"
  | "escalate-other";

export function outcomeKind(outcome: Decision["outcome"], rule: RuleTrace): OutcomeKind {
  if (outcome === "execute") return "execute";
  if (outcome === "ask") return "ask";
  if (outcome === "defer") return "defer";
  if (outcome === "refuse") return "refuse";
  const cause = escalateCause(rule);
  switch (cause) {
    case "human":
      return "escalate-human";
    case "value-rejected":
      return "escalate-value";
    case "cost-ceiling":
      return "escalate-cost";
    case "insufficient-now":
      return "escalate-insufficient";
    case null:
      return "escalate-other";
  }
}

interface Visual {
  readonly label: string;
  readonly blurb: string;
  readonly Icon: (props: { readonly className?: string }) => JSX.Element;
}

const VISUALS: Readonly<Record<OutcomeKind, Visual>> = {
  execute: {
    label: "Execute",
    blurb: "Evidence clears the bar this action's stakes demand.",
    Icon: CheckIcon,
  },
  ask: {
    label: "Ask",
    blurb: "One specific fact is missing, and the counterparty can supply it.",
    Icon: QuestionIcon,
  },
  defer: {
    label: "Defer",
    blurb: "Nothing to ask anyone — the missing thing is time.",
    Icon: ClockIcon,
  },
  refuse: {
    label: "Refuse",
    blurb: "Prohibited outright, independent of evidence or confidence.",
    Icon: StopIcon,
  },
  "escalate-human": {
    label: "Escalate — human sign-off",
    blurb: "A human must sign off on this, regardless of what the evidence shows.",
    Icon: PersonIcon,
  },
  "escalate-value": {
    label: "Escalate — evidence says no",
    blurb: "The evidence isn't missing — it arrived, and it said no.",
    Icon: ShieldSlashIcon,
  },
  "escalate-cost": {
    label: "Escalate — stakes at ceiling",
    blurb: "More cost cannot raise the bar further. Only better evidence helps.",
    Icon: CeilingIcon,
  },
  "escalate-insufficient": {
    label: "Escalate — needs better evidence",
    blurb: "The bar has headroom left; this evidence just doesn't clear it today.",
    Icon: GaugeIcon,
  },
  "escalate-other": {
    label: "Escalate — needs review",
    blurb: "A defensive, fail-closed case the engine couldn't resolve on its own.",
    Icon: AlertIcon,
  },
};

export function visualFor(kind: OutcomeKind): Visual {
  return VISUALS[kind];
}

interface OutcomeBadgeProps {
  readonly outcome: Decision["outcome"];
  readonly rule: RuleTrace;
  readonly size?: "sm" | "lg";
}

export function OutcomeBadge({ outcome, rule, size = "lg" }: OutcomeBadgeProps): JSX.Element {
  const kind = outcomeKind(outcome, rule);
  const { label, Icon } = visualFor(kind);
  return (
    <span className={`outcome-badge outcome-badge--${size} outcome-${kind}`}>
      <Icon className="outcome-badge__icon" />
      <span className="outcome-badge__label">{label}</span>
    </span>
  );
}
