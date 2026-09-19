import { describe, expect, it } from "vitest";
import { valueRejectionReason } from "../reasons.js";
import { fixtureRequirement } from "./fixtures.js";
import type { ConstraintFailure, ValueConstraint } from "../../signals/constraint.js";

/**
 * FIX 3 (independent verification follow-up): `reasons.ts`'s own doc
 * comment on `valueRejectionReason` explains, at length, why `"violated"`
 * and `"type-mismatch"` MUST render the exact same sentence — replay
 * (`lib/audit/replay.ts`) reconstructs a signal's value as
 * `UNDISCLOSED_VALUE`, which always re-derives `"type-mismatch"`
 * regardless of the original evaluation's real reason, so if this text
 * worded the two differently, every recorded value-rejection whose real
 * evaluation was `"violated"` would silently stop replaying — `matches`
 * would flip to `false` for records that used to replay exactly, with no
 * failing test anywhere pointing at why. That invariant was documented,
 * not pinned: nothing asserted it directly. This file is the direct
 * assertion, verified below by deliberately rewording one branch and
 * confirming the change is actually caught (see the sibling
 * demonstration in the FIX 3 commit message / report — done live against
 * this exact test, not merely asserted).
 */
describe("valueRejectionReason — 'violated' and 'type-mismatch' MUST render identical prose", () => {
  const requirement = fixtureRequirement({
    signalKind: "fraud.assessment",
    description: "the fraud assessment for this transfer",
  });
  const constraint: ValueConstraint = { op: "equals", value: "clear" };

  const violated: ConstraintFailure = { satisfied: false, reason: "violated" };
  const typeMismatch: ConstraintFailure = { satisfied: false, reason: "type-mismatch" };

  it("renders the exact same string for 'violated' and 'type-mismatch', for the same requirement and constraint", () => {
    expect(valueRejectionReason(requirement, constraint, violated)).toBe(
      valueRejectionReason(requirement, constraint, typeMismatch),
    );
  });

  it("this is a deliberate, narrow collapse — 'malformed' and 'unreadable' keep their OWN distinct wording, never merged with each other or with the two above", () => {
    const malformed: ConstraintFailure = { satisfied: false, reason: "malformed" };
    const unreadable: ConstraintFailure = { satisfied: false, reason: "unreadable" };

    const violatedText = valueRejectionReason(requirement, constraint, violated);
    const malformedText = valueRejectionReason(requirement, constraint, malformed);
    const unreadableText = valueRejectionReason(requirement, constraint, unreadable);

    expect(malformedText).not.toBe(violatedText);
    expect(unreadableText).not.toBe(violatedText);
    expect(malformedText).not.toBe(unreadableText);
  });

  it("holds across different requirements/constraints too, not just one fixed pair — the collapse is in the shape-selection logic, not a coincidence of one example", () => {
    const otherRequirement = fixtureRequirement({
      signalKind: "moderation.classification",
      description: "the moderation classification for this content",
    });
    const otherConstraint: ValueConstraint = { op: "in", values: ["safe", "low-risk"] };

    expect(valueRejectionReason(otherRequirement, otherConstraint, violated)).toBe(
      valueRejectionReason(otherRequirement, otherConstraint, typeMismatch),
    );
  });
});
