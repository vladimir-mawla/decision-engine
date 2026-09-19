# ADR 0001 — Five outcomes, distinguished by who or what supplies the missing thing

- **Date:** 2026-09-18
- **Status:** accepted
- **Phase / milestone:** G0.5 brainstorm, binds M1-M9

## Context

The brief asks for a decision layer that knows when it is allowed to act — judged on conceptual clarity,
technical depth ("a real system, not a prompt wrapper"), demo quality, failure thinking, and a two-year
thesis. It states its own thesis directly: binary allow/deny is the easy case; the actual product is the
middle. A design that reduces to `allow`/`deny` (or a single risk score thresholded into two buckets) is
indistinguishable from the "score with no mechanism" the brief disqualifies, no matter how the score is
computed. The decision that matters most, before any code is written, is not how to compute confidence —
it's how many distinct outcomes the system is even allowed to produce, and what makes each one different
from the others in a way a reviewer can check.

## Decision

The engine returns exactly one of five outcomes — `execute` · `ask` · `defer` · `escalate` · `refuse` — as
a discriminated union, never a boolean or a bare string. The five are not five points on one severity scale;
they are distinguished by **what is missing and who or what can supply it**:

- **execute** — nothing is missing that matters; evidence is sufficient and risk is within the tolerance
  that this action's reversibility and cost allow.
- **ask** — exactly one specific fact is missing, and the **counterparty** (the party making the request)
  can supply it. The decision must name that fact — "I would execute if I knew X" is the outcome itself,
  not a note attached to a refusal.
- **defer** — the missing thing is **time**. The answer may resolve on its own (a price settles, a status
  updates, a cooldown expires), and waiting costs less than acting wrong now. Nobody needs to be asked
  anything; the clock is the missing witness.
- **escalate** — ownership of the call moves to a **human**. Originally (and still, for its first and
  primary cause) this meant *not a confidence problem at all*: the cost of being wrong, given how
  irreversible the action is, exceeds what *any* confidence number could justify, regardless of how good
  the evidence looks. **Amended 2026-09-19 (`.genesis/decisions/0004-value-constraints.md`)** to cover a
  second, distinct cause: evidence that is present, fresh, and confident, but whose *value* affirmatively
  fails a declared constraint. See the amendment note below the Alternatives section — this second cause
  does **not** share the first one's "regardless of how good the evidence looks" character (it is entirely
  ABOUT how the evidence looks), and is kept mechanically distinguishable from the first at the audit layer
  even though both surface as `outcome: "escalate"` here.
- **refuse** — the action should not happen, period, independent of who is asking or how certain anyone is.
  No fact, no amount of waiting, and no human sign-off changes this outcome.

The distinguishing axis — counterparty / time / a human who must own it / nobody — is what keeps `ask`,
`defer`, and `escalate` from collapsing back into a single "not yet" bucket. Each one is actionable by a
different party, and the Decision object must say which.

## Consequences

- Positive: `ask` becomes genuinely actionable rather than a shrug, because it names the fact and implicitly
  the party who holds it; `defer` and `escalate` are distinguishable in the data even when their confidence
  scores look similar, because they encode *why* confidence alone couldn't decide; a two-outcome or
  three-outcome design cannot make the brief's central asymmetry claim (same confidence, different outcome
  depending on stake) visible, because that claim needs `execute` vs. `escalate` to differ while confidence
  is held constant — which requires both outcomes to exist as genuinely different destinations, not shades
  of the same one.
- Negative / cost: five outcomes is more surface area than two — every domain integration (M6) and every
  UI render (M8) has to handle all five, and the failure suite (M7) has to exercise all five under adversarial
  conditions, not just the two "obvious" ones.
- **Invariant added to context-graph.json:** `missing-information-is-named-never-implied` — a direct
  consequence of `ask`/`defer`/`escalate` being defined by *what* is missing; if the missing thing isn't
  named, the three outcomes are indistinguishable from each other and from a bare refusal.

## Alternatives rejected

- A binary `allow`/`deny` (or a scored threshold collapsed into two buckets) — why not: this is exactly the
  easy case the brief says is not the point; it cannot express "I'd execute if I knew X" as a first-class
  result, and it cannot show the irreversibility × cost asymmetry, since there's no room for the same
  confidence value to land in two different places depending on stakes.
- A single `defer-or-escalate` bucket for "not now" outcomes, on the theory that both mean "don't act yet" —
  why not: they hand the missing thing to different parties (time vs. a human) and imply completely different
  system behavior (wait and re-evaluate automatically, vs. stop and wait for a human decision that the system
  cannot make on its own no matter how long it waits) — merging them would hide exactly the distinction this
  ADR exists to state.

## Amendment — 2026-09-19: a sixth cause, given a fifth outcome's name (value constraints)

**Trigger.** `.genesis/decisions/0004-value-constraints.md` gives `decide()` its first real reason to read a
signal's *value* rather than only its metadata. That surfaces a case this ADR's original five outcomes did
not anticipate: evidence that is present, fresh, and confident enough to use — but whose value affirmatively
contradicts a declared constraint (the canonical example: a fraud assessment reading `FRAUDULENT`, not
merely `absent` or stale). This is not a missing-information case (nothing is missing — the opposite: the
evidence arrived and said no), so the `ask`/`defer`/`escalate`-via-gap machinery this ADR built for "what's
missing and who could supply it" does not apply to it at all.

**Why not `refuse`.** `refuse` is defined above as "independent of who is asking or how certain anyone is."
A value rejection is the opposite of that by construction: a *different* value for the *same* signal would
have produced a *different* outcome. Calling this `refuse` would silently stretch that outcome's meaning
to cover something its own definition explicitly excludes.

**Why not a clean, brand-new sixth outcome — the honest limitation.** The cleanest model, argued on the
merits alone, is a genuinely new outcome — distinguished from `ask`/`defer`/`escalate` by not being about
missing information at all, and distinguished from `refuse` by being evidence-dependent. That would mean
adding a sixth variant to `Decision` in `lib/contracts/decision.ts`. This milestone's own scope explicitly
freezes `lib/contracts/` (along with `lib/cost-model/` and `app/`) — the same kind of deliberate,
stated cross-milestone boundary this project has drawn before (see ADR 0003's note that unifying
`RecordedDecision` with `EvidencedDecision` "would need to unfreeze M4"). So the clean fix is named here,
honestly, as future work this ADR would bless — **not** implemented in this pass, and **not** smuggled in
under an existing outcome's name pretending nothing changed.

**What was actually done, within the frozen boundary.** `escalate` is amended (see the bullet above) to
cover two causes instead of one: the original cost-ceiling/insufficient-now cause, and this new
value-rejection cause. This is a real amendment to what `escalate` means — recorded here rather than left
implicit — not a reuse that pretends the definition never changed. Two things keep this from becoming the
"quiet stretch" this ADR would otherwise object to:

1. Both causes still share `escalate`'s one property that generalizes: **ownership of this specific call
   moves to a human**, and neither is a case `decide()` can autonomously resolve one way or the other,
   which is the load-bearing part of `escalate`'s contract as far as autonomy is concerned (see
   `.genesis/DONE.html`'s autonomy-level section: `escalate` hands control "to a human").
2. The two causes are kept MECHANICALLY distinguishable one layer up, in `lib/audit/rule.ts`'s `RuleTrace`
   (unfrozen for this change): a `"confidence-bar"` trace is the original cause; a `"value-rejected"` trace
   — its own variant, never folded into `"gap"` or `"confidence-bar"` — is the new one. A consumer that
   cares (a future M6 domain UI, M7's failure suite) can branch on `RuleTrace.kind`, never forced to parse
   `missing.reason` prose to tell the two apart.

**If a future milestone unfreezes `lib/contracts/`:** the recommended fix is to promote this into a true
sixth `Decision` variant (a plausible name: `reject`, paired conceptually with `execute` — both are
evidence-grounded, autonomous, content-of-the-evidence-determined answers, on opposite sides), carrying a
non-`missing` field naming the constraint and the requirement it failed. That would let `reject` become
autonomous (no human needed) rather than riding on `escalate`'s human-ownership default, which is arguably
the MORE honest autonomy story for this case: the evidence is clear and confident, so a human's sign-off
adds little the way it does for a genuinely ambiguous cost-ceiling escalate. This ADR does not make that
call now — it is flagged as the natural next amendment, not decided today, precisely so it isn't smuggled
in without its own argument.

<!-- Copy this file to NNNN-<slug>.md for each irreversible decision.
     Then add a one-line pointer in wiki/index.md if it becomes something later milestones need to find. -->
