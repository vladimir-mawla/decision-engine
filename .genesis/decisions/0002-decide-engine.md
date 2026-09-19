# ADR 0002 — The decision engine: precedence, prohibition, aggregation, and time

- **Date:** 2026-09-19
- **Status:** accepted
- **Phase / milestone:** M4 (BUILD) — `lib/decide/`

## Context

M1 gave the five outcomes and the cost model; M3 gave typed signals, gap
analysis, and a supplier taxonomy (`counterparty` / `time` / `human`)
deliberately shaped to map onto ADR 0001's `MissingFact` / `MissingTime` /
`MissingJudgment`. M4's job is `decide(action, signals)`: map an action plus
its evidence to exactly one of the five outcomes, applying the
irreversibility × cost asymmetry. If M3's abstraction is as clean as it
looks, this should be a small, legible mapping — and it turned out to be:
`lib/decide/` is nine small modules (~500 lines including comments), most of
which are a single pure function. The one place real complexity accumulated
is `decide.ts`'s own control flow, and even there it is a straight-line
sequence of named cases, not a pile of conditionals — each of the six
decisions below owns exactly one branch.

Six design decisions had to be made deliberately, each with a comment a
reader could disagree with. This ADR is where they are argued once, together
— the code comments (linked below) argue each individually at its point of
use.

## Decisions

### 1. Precedence among simultaneous gaps — `human > counterparty > time`

(`lib/decide/precedence.ts`) If a **human** must judge something, that
dominates — no counterparty answer or elapsed time removes the need for a
human's sign-off once one is required. Between **counterparty** and
**time**: the counterparty can act *now*; time cannot be hurried. Asking is
therefore more actionable than waiting, so it wins the tie. Ties within the
same supplier kind break by first occurrence in the `requirements` array —
deterministic, no invented secondary sort key.

*Disagree here:* one could argue that if both a fact and time are missing,
and the time component resolves regardless of the answer, waiting is "free"
and asking is the unnecessary step. This project takes the position that an
unnecessary `ask` costs one exchange, while an unnecessary `defer` costs a
full wait *plus* the same exchange afterward.

### 2. `refuse` gets its own cause: `Prohibition`, checked before evidence

(`lib/decide/prohibition.ts`) A `Prohibition` is a named rule that matches an
`Action` alone — no signals, no confidence, structurally incapable of being
"resolved" by better evidence, because it was never a question about
evidence. `decide()` calls `findProhibition` as literally the first thing it
does; nothing under it touches `requirements` or `signals`. Proven, not just
asserted: `__tests__/prohibition.test.ts` passes a `signals` array wrapped in
a `Proxy` that throws on every property access, and confirms decide() still
returns `refuse` without the thrown error ever surfacing — the only way that
test can pass is if `signals` is never read at all when a prohibition fires.
A hostile (throwing) `matches` predicate fails closed to "matches" (refuse),
never to "doesn't apply."

### 3. No gaps, confidence below the bar: two escalate reasons

(`lib/decide/stakes.ts`, `lib/decide/reasons.ts`) Both are `escalate`, but
the `MissingJudgment.reason` text distinguishes them.

**CORRECTED by FIX 2, M4 independent verification (2026-09-19).** This
section originally argued for an **unreachable** ("stop trying, ownership
moves to a human permanently") reason, distinct from
**complete-but-insufficient** ("a human decides today"), with `unreachable`
defined as `requiredConfidence(rev, cost) >= requiredConfidence(rev,
WORST_CASE_COST)`. The independent verification swept every reversibility
level and found that condition first fires at:

| level | "unreachable" from |
|---|---|
| reversible-no-trace | ~$1,800 |
| reversible-with-cost | ~$20,000 |
| reversible-with-delay | ~$500,000 |
| irreversible | ~$1,000,000 |

An ordinary $1,800 action on the *most forgiving* reversibility tier told an
operator that ownership of the call moves to a human **permanently**. That
is a behavioural bug wearing a principled distinction, and investigating it
confirmed the distinction as originally worded does not hold: `Confidence`
is capped at 1.0 (`lib/contracts/confidence.ts`) and every
`requiredConfidence` bar is capped below that, at 0.99
(`requiredConfidence.ts`'s "why the bar never hits 1.0"). Under
min-aggregation (decision 4), a single signal reporting confidence 1.0
always clears any bar this model can produce. **Nothing in this model is
ever truly unreachable by evidence — the original "unreachable" claim was
false at every cost, not just at the low end the sweep happened to probe.**
This ADR previously carried a "note on what this deliberately does NOT
mean" that already half-noticed this (see git history) but still concluded
the operational meaning was "a human owns this call, permanently" — that
conclusion did not follow from the premise, and is retracted here.

What `requiredConfidence(rev, cost) >= requiredConfidence(rev,
WORST_CASE_COST)` actually, honestly detects: this reversibility level's
bar has hit **its own ceiling** — a larger stated cost-of-being-wrong cannot
push the bar any higher than it already is. That is a true and useful fact
(it tells a reader "don't bother re-arguing the stakes, the model already
assumes the worst"), but it is a *different* claim from "no evidence could
ever clear this," and conflating the two was the defect.

**Resolution chosen: reframe, not collapse.** The two-way distinction
between "the bar has hit its cost ceiling" and "the bar still has headroom"
is kept — it remains genuinely useful information about *why* more stated
cost won't change the outcome — but the prose and the function name were
corrected to say only what is computed, never the retracted unreachability
claim:

- **`costCeilingReason`** (renamed from `unreachableBarReason`) — the bar
  has already reached this reversibility level's ceiling; raising the
  stated cost further cannot raise it any higher. Explicitly disclaims
  "no confidence value could ever clear this" in its own text, and no
  longer says "permanently."
- **`insufficientNowReason`** (unchanged name, wording lightly tightened)
  — the bar still has headroom; this evidence, today, doesn't clear it, but
  better evidence could, later.

Collapsing to a single escalate reason was considered and rejected: the
"cost ceiling reached" fact remains true and remains something a reader can
act on differently (arguing the cost is understated is pointless once the
ceiling is hit; better evidence is not). Tightening the condition to some
stricter, genuinely-unreachable test was also considered and rejected — no
sound definition of "unreachable by evidence" exists in this model, because
`Confidence`'s and `requiredConfidence`'s own caps guarantee execute is
never mathematically foreclosed. Reframing preserves the useful part of the
original distinction while retracting the false part.

A reader could reasonably want a different ceiling test entirely (e.g. tied
to the limiting signal's own provenance kind); that was considered and
rejected because it would need a second policy constant this project does
not otherwise have, reopening invariant 3.

### 4. Aggregation: `min`, with the limiting signal recorded

(`lib/decide/aggregate.ts`) A decision is only as confident as its weakest
necessary evidence. An average lets strong evidence mask a weak link; a
product compounds every requirement's uncertainty and has no single signal
to blame when asked "why this number." `min` names a **specific limiting
signal** — `Aggregate.limiting` — which is what makes the resulting
explanation concrete rather than statistical, and it is exactly what every
`escalate`/`execute` reason text (`reasons.ts`) reports by name.

### 5. `reconsiderAt` — derived from `requirement.maxAge`, always

(`lib/decide/reconsider.ts`) M3 deliberately does not supply this (it is a
scheduling policy, not a fact about the requirement). The one field
guaranteed present on every `time`-supplier Gap, regardless of *why* it's
unmet (`absent` / `stale` / `below-confidence`), is `requirement.maxAge` —
the domain's own stated refresh cadence. `reconsiderAt = now + maxAge`.
Anchoring instead to a stale candidate's own `capturedAt` was considered and
rejected: that instant is already in the past once a signal is stale, and it
does not exist at all for an `absent` Gap.

### 6. Clock-inconsistency — escalates instead of an honest-but-impossible defer

(`decide.ts`'s `decideFromGap`, `reasons.ts`'s `clockInconsistencyReason`) A
future-dated observation is not "we don't have good data yet" — the age is
*unknowable*, which could mean a broken clock, a replay, or corrupted data.
It is never treated as fresh (inherited from M3). M4 adds: when the
precedence-winning Gap is `stale` with `age.kind === "clock-inconsistency"`
**and** its supplier is `time`, `decide()` cannot honestly compute
`reconsiderAt` (decision 5 has no trustworthy anchor), so it escalates
instead of deferring on a guess. For `counterparty`/`human` suppliers, the
anomaly does not block anything that field-wise depends on age, so `ask`/
`escalate` proceed normally — the special handling is scoped exactly to
where an honest answer is impossible, not applied as a blanket override.

## Two more named failure modes, beyond the six

- **Zero requirements declared.** `execute` on no stated evidence would be
  exactly the fail-open default this project rejects — `decide()` escalates
  instead (`reasons.ts`'s `noRequirementsReason`).
- **Internal inconsistency between `analyzeGaps` and this module's own
  satisfaction check.** `findSatisfaction` (`satisfaction.ts`) mirrors
  `analyzeGaps`'s "satisfied" test but additionally rejects non-finite
  confidence values (`Number.isFinite`) — `analyzeGaps`'s bare `>=` check
  does not. A hand-built signal claiming `confidence: Infinity` clears
  `>= minConfidence` (so `analyzeGaps` reports no Gap) but is rejected by
  `findSatisfaction` — a genuine, constructible disagreement between the two
  modules. `decide()` fails closed to `escalate` rather than trusting either
  side (`internalInconsistencyReason`); see
  `__tests__/escalate.test.ts`'s "internal inconsistency" case.

## Invariants (the four that "finally apply" at M4)

- **`no-outcome-without-signals`** — `lib/decide/evidence.ts` is the ONLY
  file that writes an `outcome: "..."` object literal; every one of its five
  builder functions requires an `evidence` parameter with no default.
  `decide.ts` never constructs a Decision literal itself
  (`__tests__/no-outcome-without-signals.test.ts` greps for this). Evidence
  is always either `input.signals` verbatim or `[]` when a prohibition fired
  and signals were genuinely never read.
- **`missing-information-is-named-never-implied`** — every `ask` names the
  requirement's own `description`; every `defer` names `supplier.waitingOn`
  and a `reconsiderAt` traced to `maxAge`; every `escalate` states, in prose,
  which of the (now four) distinct reasons applies.
- **`confidence-bar-is-a-function-not-a-constant`** —
  `__tests__/no-bare-threshold.test.ts` greps `lib/decide/` for any bare
  fractional literal used in a comparison; every bar in this package comes
  from `requiredConfidence` (directly in `decide.ts`, or via two
  `requiredConfidence` calls compared to each other in `stakes.ts`).
- **`no-unreplayable-decision`** — `decide()` takes `now` as an explicit
  argument and never reads `Date.now()`/`systemNow()`/`Math.random()`
  (grepped in `__tests__/determinism.test.ts`), plus a behavioral test
  running identical inputs twice and deep-equaling the results.

## Consequences

- Positive: the six decisions are each independently testable and
  independently arguable — a reviewer who disagrees with, say, decision 3's
  cost-ceiling definition can replace `isBarSaturated` without touching
  precedence, prohibition, or aggregation. This is exactly what let FIX 2
  (M4 verification) correct that decision's own wording without touching
  the other five.
- Negative / cost: `decide()`'s `DecideInput` is larger than the brief's
  `decide(action, signals)` shorthand (it also needs `requirements` and
  `prohibitions`) — every caller (M6's domains) must supply all four fields
  explicitly, including an empty `prohibitions: []` when a domain has none,
  rather than a convenient default.
- The outer `try/catch` in `decide()` (fail-closed audit) means a genuine
  bug elsewhere in this file would be silently downgraded to `escalate`
  rather than surfaced as a crash during development — mitigated by keeping
  the six decision modules small enough that `npm test` catches logic errors
  before they'd ever need to be caught by the outer guard in practice.

## Alternatives rejected

- **A single risk score with a threshold** for decision 3/4 — already
  rejected at the project level (0001); repeated here because it is
  specifically the temptation this milestone's aggregation and bar-check
  logic could have reintroduced through the back door.
- **Wiring `checkHumanSupplierAgainstSatisfyingSignal` (M3, opt-in) into
  `decide()`** — considered, not done. M3's own documentation states this
  check is deliberately not wired into `analyzeGaps` because whether to
  block, downgrade, or merely log the hazard it detects is a policy call
  outside M3's scope. M4 does not resolve that policy call either; wiring it
  in silently would have made a judgment call this ADR does not actually
  argue for. Left as a deliberate omission — see the M4 final report.
