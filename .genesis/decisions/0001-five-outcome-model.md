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
- **escalate** — not a confidence problem at all. The cost of being wrong, given how irreversible the action
  is, exceeds what *any* confidence number could justify — so ownership of the call moves to a **human**,
  regardless of how good the evidence looks.
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

<!-- Copy this file to NNNN-<slug>.md for each irreversible decision.
     Then add a one-line pointer in wiki/index.md if it becomes something later milestones need to find. -->
