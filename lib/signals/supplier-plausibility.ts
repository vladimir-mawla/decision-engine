import type { Requirement } from "./requirement.js";
import type { Signal } from "./signal.js";

/**
 * FIX 2 / M6 — see requirement.ts's "HAZARD FOR M6 DOMAIN AUTHORS" comment
 * on `Supplier` for the full reasoning. Short version: nothing validates
 * that a Requirement's declared `supplier` matches its real nature, no
 * general mechanical check for that can honestly exist, and this file is
 * the one narrow exception — not a general validator, and not wired into
 * `analyzeGaps` by default.
 *
 * `Supplier`'s `human` variant carries an explicit, checkable claim in its
 * own `reason` field: "no automated signal can establish this." That claim
 * is contradicted, on its own terms, if the signal that actually goes on
 * to satisfy the requirement turns out to have `Provenance.kind ===
 * "counterparty"` — a bare, unverified self-report from the very party the
 * decision is about. If a counterparty's own say-so were enough, the
 * requirement's `human` label was never true in the first place; either
 * the label is wrong (should have been `counterparty`) or the requirement
 * is silently accepting weaker evidence than its own stated supplier
 * implies it needs. Either way, this is a fact the requirement's own words
 * expose about its own outcome — not a guess about what the domain author
 * meant.
 *
 * WHAT THIS DOES NOT CHECK (stated plainly, not glossed over):
 *   - The `counterparty` <-> `time` mislabelling directions: there is no
 *     property of a `counterparty`- or `time`-supplier requirement that a
 *     satisfying signal's provenance could honestly contradict the way
 *     `human`'s claim can, so no equivalent check is offered for them.
 *   - The `absent`-Gap case: when nothing at all was supplied, there is no
 *     signal to compare the declared supplier against.
 *   - Whether `human` was the RIGHT label to begin with. A requirement
 *     correctly labelled `human` and correctly satisfied by, say, a
 *     `system`-provenance signal (an automated check a human reviewer
 *     configured and trusts) passes this check cleanly — this function
 *     proves nothing about correctness, only catches one specific,
 *     mechanical self-contradiction.
 *
 * Opt-in by design: whether "human supplier satisfied by a counterparty
 * claim" should block a decision, downgrade its confidence, or merely be
 * logged is a policy call this milestone does not own (that's M4's or a
 * domain's call) — so this returns a typed result for the caller to act
 * on, rather than throwing or silently folding into `analyzeGaps`'s Gap
 * union.
 */
export interface SupplierPlausibilityHazard {
  readonly kind: "human-supplier-satisfied-by-counterparty-claim";
  readonly requirement: Requirement;
  readonly signal: Signal;
}

/**
 * Checks the one honest partial case described above. Returns the hazard
 * when `requirement.supplier.kind === "human"` and `signal.source.kind ===
 * "counterparty"`; returns `null` in every other case, including when the
 * requirement's supplier is `human` but the signal's provenance is
 * anything other than `counterparty` — that combination is NOT flagged,
 * because nothing about it is mechanically contradictory.
 *
 * Callers decide when to call this — typically once M4 has determined
 * `signal` is what actually satisfied `requirement` (fresh and confident
 * enough per `analyzeGaps`'s own rules), or a domain's own test suite
 * exercising its Requirements against representative Signals.
 */
export function checkHumanSupplierAgainstSatisfyingSignal(
  requirement: Requirement,
  signal: Signal,
): SupplierPlausibilityHazard | null {
  if (requirement.supplier.kind !== "human") return null;
  if (signal.source.kind !== "counterparty") return null;
  return {
    kind: "human-supplier-satisfied-by-counterparty-claim",
    requirement,
    signal,
  };
}
