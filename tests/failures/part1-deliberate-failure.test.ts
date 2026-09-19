import { describe, expect, it } from "vitest";
import { decide } from "../../lib/decide/decide.js";
import { recordDecision } from "../../lib/audit/record.js";
import { replay } from "../../lib/audit/replay.js";
import { requiredConfidence, REQUIRED_CONFIDENCE_TEST_ONLY } from "../../lib/cost-model/requiredConfidence.js";
import { checkHumanSupplierAgainstSatisfyingSignal } from "../../lib/signals/index.js";
import { HOURS, makeAction, makeInput, makeRequirement, makeSignal, mustCapturedAt, NOW } from "./helpers.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * PART ONE — THE DELIBERATE FAILURE TEST: "Confidence that lies"
 * ══════════════════════════════════════════════════════════════════════
 *
 * WHY THIS WEAKNESS, AND WHY IT IS THE SHARPEST ONE AVAILABLE
 * ─────────────────────────────────────────────────────────────────────
 * Every gate this engine has — requiredConfidence's bar, aggregateConfidence's
 * min, isBarSaturated's ceiling — is a function of a NUMBER a signal reports
 * about itself: `Signal.confidence`. Nothing in lib/signals or lib/decide
 * ever asks "is this number well-calibrated" or "who is asserting it, and
 * should THEIR 0.99 be worth as much as anyone else's 0.99". The engine's own
 * source code says this explicitly, twice, and in both places DELIBERATELY
 * chooses not to close the gap:
 *
 *   - lib/decide/stakes.ts (isBarSaturated's doc comment): "a reader could
 *     disagree with tying this distinction to cost-saturation specifically
 *     (rather than, say, whether the limiting signal's own provenance kind
 *     could ever be trusted at this stake level — a counterparty self-report
 *     is never going to satisfy an irreversible seven-figure action, no
 *     matter its stated confidence). That alternative ... was not chosen."
 *   - lib/signals/provenance.ts: a `counterparty` signal is documented as
 *     "Least trustworthy on its own ... exactly the kind of claim a decision
 *     must not treat as free evidence" — and then nothing downstream ever
 *     discounts it. `requiredConfidence`, `aggregateConfidence`, and
 *     `isBarSaturated` all take `action.reversibility`/`action.costOfBeingWrong`
 *     and a signal's bare `.confidence` number — never `.source.kind` — as
 *     their only inputs.
 *
 * So this is not a hypothetical: the project's own design docs already name
 * the exact scenario below as a known, considered, and deliberately
 * unaddressed gap. That is what makes it the sharpest available failure,
 * over the other candidates (a mislabelled `supplier`, an under-declared
 * cost, a missing prohibition): those are all AUTHOR mistakes the engine
 * could, in principle, be argued to have no duty to catch. This one is
 * different — it is a property of the MECHANISM itself, present even when
 * every domain author does everything else right.
 *
 * THE CONCRETE BREAK
 * ─────────────────────────────────────────────────────────────────────
 * An irreversible, $50,000-cost-of-being-wrong action (a payout to a newly
 * added payee — wiring money to a bank account that, once paid, cannot be
 * clawed back if the payee turns out to be fraudulent) is used below as
 * the WORKED CASE. It is illustrative, not the boundary of what breaks —
 * it is this project's own headline (reversibility, cost) pair
 * (requiredConfidence.ts's header comment), which is exactly why it is
 * kept below and why it grounds the argument concretely rather than
 * abstractly. THE REAL CEILING, stated honestly further down, is far
 * stronger than "$50,000 can slip through." The ONLY evidence is a single
 * signal, self-reported by the payee's own onboarding flow
 * (`Provenance.kind: "counterparty"` — the party the decision is ABOUT,
 * not an independent verifier), claiming "identity verified" at confidence
 * 0.99. In this scenario the payee is lying: the identity was never really
 * verified, and the 0.99 is fabricated (or the verifying system was
 * compromised, or simply mis-calibrated) — the engine has no way to know
 * this and no code path that would ever ask.
 *
 * requiredConfidence("irreversible", $50,000) ≈ 0.978 (this project's own
 * documented worked example, requiredConfidence.ts's header comment). A
 * bare, self-reported 0.99 clears that bar with room to spare. Nothing else
 * gates this action — no prohibition, no human-supplier requirement, no
 * value constraint — so decide() has exactly one thing to look at, and it
 * looks at it exactly as designed: the number, taken at face value.
 *
 * THE REAL CEILING — WHY $50,000 UNDERSTATES ITS OWN WEAKNESS
 * ─────────────────────────────────────────────────────────────────────
 * `requiredConfidence` clamps its result to `MAX_BAR = 0.99`
 * (requiredConfidence.ts) for every reversibility level, at every cost —
 * the curve asymptotes toward 0.99 and is explicitly never allowed past
 * it. That means there is no dollar amount, however large, at which the
 * bar can rise past what a bare, self-reported 0.99 already clears: the
 * $50,000 figure above is not where this breaks, it is merely where this
 * project's own worked example happens to sit on a curve that was already
 * flat by then. The honest statement of this weakness is therefore not
 * "a $50,000 irreversible action can slip through on a lying signal" — it
 * understates the actual ceiling — it is: **no stake is high enough to
 * stop a signal that claims 0.99.** "THE REAL CEILING" test below proves
 * this directly at $5,000,000 — a hundred times the worked case's cost —
 * getting the identical result, so the claim is demonstrated, not merely
 * asserted.
 */
describe("PART ONE — deliberate failure: a fabricated 0.99 clears the bar exactly like a real one", () => {
  const action = makeAction({
    domain: "payments",
    type: "payout.newPayee",
    parameters: { payeeId: "payee-77213", amountUsd: 50_000 },
    cost: 50_000,
    reversibility: "irreversible",
  });

  const requirement = makeRequirement({
    signalKind: "payee.identity.verified",
    description: "the newly added payee's identity has been verified",
    minConfidence: 0.5,
    maxAgeMs: 24 * HOURS,
    supplier: { kind: "counterparty", party: "the payee's onboarding flow" },
  });

  // The lie: a bare self-report, at a confidence that (per this project's
  // own worked example) is specifically high enough to clear an
  // irreversible $50,000 bar — 0.99 against a bar of ~0.978.
  const fabricatedSignal = makeSignal({
    id: "sig-payee-self-report",
    kind: "payee.identity.verified",
    value: "verified",
    source: { kind: "counterparty", party: "payee-77213" },
    confidence: 0.99,
    capturedAtIso: mustCapturedAt(NOW, NOW),
  });

  const input = makeInput({
    action,
    requirements: [requirement],
    signals: [fabricatedSignal],
    now: NOW,
  });

  it("THE BREAK: the engine confidently executes an irreversible $50,000 action on one lying self-report", () => {
    const bar = requiredConfidence("irreversible", action.costOfBeingWrong);
    // Matches this project's own documented worked example almost exactly
    // (requiredConfidence.ts: "≈ 0.978"), confirming this isn't a contrived
    // number chosen to make the point work — it's the project's own
    // headline case for this reversibility/cost pair.
    expect(bar).toBeCloseTo(0.978, 2);

    const decision = decide(input);

    // decide() never throws, never asks "who is this confidence from" —
    // it executes. This IS the failure, demonstrated concretely: a lie,
    // dressed up as a number above the bar, is functionally
    // indistinguishable to this engine from the truth.
    expect(decision.outcome).toBe("execute");
    if (decision.outcome === "execute") {
      expect(decision.confidence).toBeGreaterThanOrEqual(decision.confidenceBar);
      expect(decision.confidence).toBeCloseTo(0.99, 5);
    }
  });

  it("WHAT THE AUDIT TRAIL PRESERVES: the fact that the sole evidence was a bare self-report survives, unflagged, in the record", () => {
    const record = recordDecision(input, "audit-payee-77213", NOW);
    expect(record.kind).toBe("decision");
    if (record.kind !== "decision") return;

    expect(record.decision.outcome).toBe("execute");
    // The provenance kind (`"counterparty"`) IS preserved verbatim in the
    // evidence snapshot — a human reviewer who later reads this record CAN
    // reconstruct "this executed on a bare self-report from the party it
    // concerned, nothing else corroborated it." That reconstruction is
    // possible. It is just never performed automatically by anything in
    // this codebase.
    expect(record.decision.evidence).toHaveLength(1);
    expect(record.decision.evidence[0]?.source).toEqual({ kind: "counterparty", party: "payee-77213" });
    expect(record.decision.evidence[0]?.confidence).toBeCloseTo(0.99, 5);

    // The RuleTrace names the mechanism (confidence-bar, cleared) but has
    // NO field anywhere that names provenance trustworthiness — confirming
    // structurally, not just by reading the source, that nothing in this
    // record's own shape could have flagged the lie even in principle.
    expect(record.rule.kind).toBe("confidence-bar");
    if (record.rule.kind === "confidence-bar") {
      expect(record.rule.cleared).toBe(true);
      expect(Object.keys(record.rule)).not.toContain("sourceKind");
      expect(Object.keys(record.rule)).not.toContain("provenanceTrust");
    }
  });

  it("WHAT REPLAY DOES AND DOES NOT CATCH: replay reproduces the same wrong answer exactly — reproducibility is not the same as correctness", () => {
    const record = recordDecision(input, "audit-payee-77213", NOW);
    if (record.kind !== "decision") throw new Error("expected a decision record");

    const result = replay(record, []);
    // Full, exact replay: `matches: true`. Replay's job is "does decide()
    // reproduce its own recorded output from its own recorded input" — it
    // says nothing at all about whether that output was ever right. A
    // perfectly self-consistent audit trail and a perfectly wrong decision
    // are not in tension with each other anywhere in this system.
    expect(result.matches).toBe(true);
    expect(result.replayed).toEqual(record.decision);
  });

  it("WHAT NOTHING CATCHES, STATED PLAINLY: the identical action executes on the identical confidence regardless of whether the source is a human reviewer or the payee itself", () => {
    const humanVerifiedSignal = makeSignal({
      id: "sig-human-review",
      kind: "payee.identity.verified",
      value: "verified",
      source: { kind: "human", who: "compliance-reviewer-ok" },
      confidence: 0.99,
      capturedAtIso: mustCapturedAt(NOW, NOW),
    });

    const decisionFromSelfReport = decide(input);
    const decisionFromHumanReview = decide(
      makeInput({ action, requirements: [requirement], signals: [humanVerifiedSignal], now: NOW }),
    );

    // Same outcome, same confidence, same confidenceBar — decide() is
    // provably blind to the one distinction (who is vouching for this
    // number) that would actually separate the honest case from the
    // fabricated one. This is the concrete, structural proof that "the
    // engine cannot tell a well-calibrated 0.99 from a fabricated one" is
    // not editorializing — it is a property of decide()'s own inputs.
    expect(decisionFromSelfReport.outcome).toBe(decisionFromHumanReview.outcome);
    if (decisionFromSelfReport.outcome === "execute" && decisionFromHumanReview.outcome === "execute") {
      expect(decisionFromSelfReport.confidence).toBe(decisionFromHumanReview.confidence);
      expect(decisionFromSelfReport.confidenceBar).toBe(decisionFromHumanReview.confidenceBar);
    }
  });

  it("THE REAL CEILING: the identical fabricated 0.99 still executes at $5,000,000 — a hundred times the worked case's cost — because requiredConfidence never rises past MAX_BAR", () => {
    // $5,000,000, matching the independent verification's own figure: a
    // deliberately extreme cost, chosen to demonstrate the ceiling is not
    // "somewhere past $50,000" but genuinely nowhere — no cost this
    // project's model can express raises the bar past a bare 0.99.
    const extremeAction = makeAction({
      domain: "payments",
      type: "payout.newPayee",
      parameters: { payeeId: "payee-77213", amountUsd: 5_000_000 },
      cost: 5_000_000,
      reversibility: "irreversible",
    });

    const extremeBar = requiredConfidence("irreversible", extremeAction.costOfBeingWrong);
    // Clamped to the documented ceiling, not just "close to" $50,000's bar
    // — this IS the same number, exactly, not a coincidentally similar one.
    expect(extremeBar).toBe(REQUIRED_CONFIDENCE_TEST_ONLY.MAX_BAR);
    expect(extremeBar).toBeCloseTo(0.99, 10);

    const extremeInput = makeInput({
      action: extremeAction,
      requirements: [requirement],
      signals: [fabricatedSignal],
      now: NOW,
    });

    const decision = decide(extremeInput);
    // Same fabricated signal, a hundred times the cost, identical result:
    // the $50,000 worked case above was never the ceiling, only a
    // convenient point on a curve that had already gone flat.
    expect(decision.outcome).toBe("execute");
    if (decision.outcome === "execute") {
      expect(decision.confidence).toBeCloseTo(0.99, 5);
      expect(decision.confidenceBar).toBe(REQUIRED_CONFIDENCE_TEST_ONLY.MAX_BAR);
    }
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════
 * PART ONE, CONTINUED — THE BLINDNESS IS SYMMETRIC ACROSS PROVENANCE KINDS
 * ══════════════════════════════════════════════════════════════════════
 *
 * The describe block above frames the gap around a `counterparty`
 * self-report — the party the decision is ABOUT, vouching for itself. An
 * independent verification showed the exact same gap applies, with equal
 * force, to a `human`-sourced signal: a hand-built `Signal` merely
 * claiming `Provenance.kind: "human"`, with no actual reviewer behind it
 * anywhere, satisfies a `human`-supplier `Requirement` for a $1,000,000
 * irreversible action exactly as a genuine human review would.
 *
 * WHY THIS IS A MATERIALLY WORSE STATEMENT THAN "beware counterparty
 * self-reports", NOT A NARROWER ONE: a reader of Part One's original
 * framing could reasonably conclude "so require a `human`-sourced signal
 * for anything this sensitive, and the gap closes." That conclusion is
 * false. `human`-supplier `Requirement`s exist precisely to force a real
 * person into the loop for calls no confidence number should settle
 * (requirement.ts's own `Supplier` doc: `reason` is "why no confidence
 * number would suffice"). But nothing anywhere checks that the `who`
 * string on a `human`-sourced `Signal` names an actual person who did
 * anything — the same way nothing checks that a `system`-sourced
 * signal's `system` string names a system that actually ran, or that a
 * `derived` signal's `rule`/`inputs` correspond to a derivation that
 * really happened.
 *
 * THE GENERAL RULE (stated once, not enumerated per kind): `Provenance`
 * (lib/signals/provenance.ts) is RECORDED METADATA, not an authenticated
 * claim. Every one of its four variants — `counterparty`, `system`,
 * `human`, `derived` — carries nothing but plain strings (`party`,
 * `system`, `who`, `rule`/`inputs`) that whoever builds the `Signal`
 * simply writes down; nothing in `lib/signals`, `lib/decide`, or
 * `lib/audit` ever verifies any of them against an actual actor, system,
 * or derivation. `checkHumanSupplierAgainstSatisfyingSignal` (lib/signals/
 * supplier-plausibility.ts) is the one narrow, honest, opt-in exception —
 * and even it only catches the ONE mechanically self-contradictory
 * combination (a `human`-supplier requirement satisfied by a
 * `counterparty`-sourced signal). It says nothing at all when the
 * signal's own `source.kind` already says `"human"`, because there is
 * nothing mechanically contradictory left to catch — the field simply is
 * whatever the caller wrote into it. So the field that looks the most
 * unforgeable — "the source itself claims to BE a human" — is exactly as
 * self-declared as every other field on every other `Provenance` kind.
 *
 * CHECKED, NOT ASSUMED, FOR `system` AND `derived`: reading
 * provenance.ts's own type confirms the identical shape — `system` is a
 * bare `{ kind: "system"; system: string }` and `derived` is
 * `{ kind: "derived"; rule: string; inputs: readonly string[] }`, with no
 * variant anywhere carrying a signature, a token, or any other field an
 * authentication mechanism could check. A project-wide search for
 * anything resembling authentication of a provenance field (an allowlist
 * of real system names, a registry of real reviewers, anything checking
 * `who`/`system`/`rule` against a source of truth) turns up nothing in
 * `lib/` or `app/` — the only code that ever reads `source.kind` at all
 * is the precedence/gap machinery deciding WHICH requirement a signal
 * could satisfy, never whether the claim itself is real.
 */
describe("PART ONE, CONTINUED — a fabricated human-sourced signal satisfies a human-supplier requirement exactly like a genuine review", () => {
  const crossBorderAction = makeAction({
    domain: "payments",
    type: "transfer.crossBorder",
    parameters: { transferId: "xfer-90210", amountUsd: 1_000_000 },
    cost: 1_000_000,
    reversibility: "irreversible",
  });

  const humanSignOffRequirement = makeRequirement({
    signalKind: "compliance.crossBorderSignOff",
    description: "a human compliance reviewer has signed off on this cross-border transfer",
    minConfidence: 0.9,
    maxAgeMs: 24 * HOURS,
    supplier: {
      kind: "human",
      reason: "no automated signal can establish that a human actually reviewed this transfer",
    },
  });

  // The lie: nobody named "compliance-reviewer-jsmith" reviewed anything.
  // This `Signal` was hand-built, exactly like the payee self-report
  // above, and its `source.kind: "human"` is just as self-declared as the
  // payee's `source.kind: "counterparty"` was.
  const fabricatedHumanSignal = makeSignal({
    id: "sig-fake-compliance-signoff",
    kind: "compliance.crossBorderSignOff",
    value: "approved",
    source: { kind: "human", who: "compliance-reviewer-jsmith" },
    confidence: 0.99,
    capturedAtIso: mustCapturedAt(NOW, NOW),
  });

  it("THE SYMMETRIC BREAK: a hand-built human-sourced signal, with no actual reviewer behind it, clears a $1,000,000 irreversible human-supplier requirement exactly as a genuine review would", () => {
    const bar = requiredConfidence("irreversible", crossBorderAction.costOfBeingWrong);
    expect(bar).toBeGreaterThan(0.9);

    const decision = decide(
      makeInput({
        action: crossBorderAction,
        requirements: [humanSignOffRequirement],
        signals: [fabricatedHumanSignal],
        now: NOW,
      }),
    );

    // decide() never asks "did this reviewer actually exist" — it treats
    // the human-supplier requirement as satisfied because a fresh,
    // confident-enough signal of the matching kind exists, full stop.
    expect(decision.outcome).toBe("execute");
    if (decision.outcome === "execute") {
      expect(decision.confidence).toBeCloseTo(0.99, 5);
    }

    // Changing NOTHING but the fabricated name produces an identical
    // result — decide() has no way to prefer one unverified `who` string
    // over another, because it never looks at the string's truth, only
    // its presence.
    const differentlyFabricatedSignal = makeSignal({
      id: "sig-fake-compliance-signoff-2",
      kind: "compliance.crossBorderSignOff",
      value: "approved",
      source: { kind: "human", who: "an-entirely-different-name-nobody-configured-either" },
      confidence: 0.99,
      capturedAtIso: mustCapturedAt(NOW, NOW),
    });
    const decisionRelabeled = decide(
      makeInput({
        action: crossBorderAction,
        requirements: [humanSignOffRequirement],
        signals: [differentlyFabricatedSignal],
        now: NOW,
      }),
    );
    expect(decisionRelabeled.outcome).toBe(decision.outcome);
  });

  it("THE ONE CHECK THAT EXISTS DOES NOT CATCH THIS: checkHumanSupplierAgainstSatisfyingSignal only flags a counterparty-sourced signal, never a fabricated human-sourced one", () => {
    // This is the one narrow, opt-in mechanical check this project ships
    // for exactly this hazard class (supplier-plausibility.ts). It fires
    // when a human-supplier requirement is satisfied by a
    // counterparty-sourced signal — a real, mechanical self-contradiction.
    // It has nothing to say when the signal already claims `kind: "human"`,
    // because nothing about that combination is mechanically
    // self-contradictory on its face — which is exactly why the
    // fabrication above sails through undetected.
    const hazard = checkHumanSupplierAgainstSatisfyingSignal(humanSignOffRequirement, fabricatedHumanSignal);
    expect(hazard).toBeNull();

    // For contrast, the ONE case this check does catch: the mirror-image,
    // mechanically-contradictory combination from Part One's original
    // framing (a counterparty self-report satisfying a human-supplier
    // requirement).
    const counterpartySignal = makeSignal({
      id: "sig-counterparty-claims-signoff",
      kind: "compliance.crossBorderSignOff",
      value: "approved",
      source: { kind: "counterparty", party: "the transferring customer" },
      confidence: 0.99,
      capturedAtIso: mustCapturedAt(NOW, NOW),
    });
    const caughtHazard = checkHumanSupplierAgainstSatisfyingSignal(humanSignOffRequirement, counterpartySignal);
    expect(caughtHazard).not.toBeNull();
    expect(caughtHazard?.kind).toBe("human-supplier-satisfied-by-counterparty-claim");
  });
});

/**
 * THE HONEST ACCOUNT (restated in code, not just prose, per the milestone
 * brief's own framing — "what happens when it does"):
 *
 *   - What breaks: decide() executes an irreversible $50,000 action whose
 *     only evidence is a fabricated/self-reported confidence value.
 *   - What the audit trail preserves: the exact signal, its confidence, its
 *     `Provenance` (including `kind: "counterparty"`), the rule that fired,
 *     and a byte-for-byte replayable record. Everything a human would need
 *     to RECOGNIZE the problem is there, verbatim, if they go looking.
 *   - What nothing catches: nothing goes looking automatically. There is no
 *     code path anywhere in lib/decide or lib/audit that treats a
 *     `counterparty`-sourced signal differently from a `human`- or
 *     `system`-sourced one when computing or checking confidence. Replay
 *     confirms self-consistency, not correctness — a wrong decision replays
 *     exactly as cleanly as a right one.
 *   - This is not a bug in the sense of "the code disagrees with its own
 *     spec" (see the historical defects in Part Two for that category) — it
 *     is a property the spec itself has, argued about candidly in the
 *     source (stakes.ts, provenance.ts) and never closed. The honest answer
 *     is "nothing catches this, and here is the evidence trail that would
 *     let a human find it later" — which is exactly what this test proves,
 *     concretely, rather than asserts.
 */
