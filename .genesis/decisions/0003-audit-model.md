# ADR 0003 — The audit trail: what gets disclosed, what replay needs, and what is deliberately not attempted

- **Date:** 2026-09-19
- **Status:** accepted
- **Phase / milestone:** M5 (BUILD) — `lib/audit/`

## Context

M4 gave `decide(action, signals, requirements, prohibitions, now)` as a pure
function returning `EvidencedDecision | InputRejected`. M5's job, per the
brief, is a full audit trail per decision — inputs, signals, reasoning,
outcome — that is **replayable**: the same recorded inputs fed back through
`decide()` must reproduce the same outcome. M4's own next-action note
anticipated a thin wrapper (`{ id, recordedAt, rule }` around
`EvidencedDecision`). That undersold the actual problem: two of `decide()`'s
own inputs are not plain data, and naively wrapping them would either fail
to record enough to replay, or accidentally violate M3's own value-hiding
guarantee for `Signal`.

## Decision 1 — VALUE_DISCLOSURE: record Signal metadata, not the signal object, and never the value by default

M3's `Signal` deliberately hides `value` in a closure; `JSON.stringify`,
`{...signal}`, `Reflect.ownKeys`, and a spread all agree it isn't there —
only `id`, `kind`, `source`, `capturedAt`, and `confidence` are real own
properties. The milestone brief's own lean was: *record what the decision
actually read, not the signal objects*. Investigating what `decide()`
actually reads settled this more precisely than the lean states it:
**`decide()` never calls `Signal.read()` at all.** `analyzeGaps`,
`findSatisfaction`, and `aggregateConfidence` (the only places `lib/decide`
touches a `Signal`) read `signal.kind`, `signal.capturedAt`, and
`signal.confidence` directly — never `.value`. The disclosed value has
**zero influence** on which of the five outcomes `decide()` returns.

So this ADR sharpens the brief's lean rather than merely adopting it:
what a decision actually reads, in the decision-relevant sense, is
**metadata**, not the value. `lib/audit/snapshot.ts`'s `SignalSnapshot`
captures exactly that (`id`/`kind`/`source`/`capturedAt`/`confidence`) via
plain property access — no special API needed, because M3's encapsulation
already keeps `value` out of it. `recordDecision` (`record.ts`) builds
every `AuditRecord` from `SignalSnapshot`s only; a record's evidence never
contains a raw value, by construction, not by best-effort redaction.

Disclosing the actual value remains possible, deliberately, through
exactly one named function: `discloseSignalValue(signal, maxAge, now)`
(`disclose.ts`), which calls `Signal.read()` once and returns the reading.
Nothing in `recordDecision` or `replay` ever calls it. This satisfies the
brief's requirement that disclosure be "a named, intentional act with a
clear API, never an incidental side effect of serialization": there is
exactly one call site in this package that can leak a value, it is
grep-able, and a caller who wants a human-legible trail including the
actual evidence value must opt in explicitly, case by case.

**Where this disagrees with the brief's own phrasing, and why:** the brief
says record "what the decision actually read." Read strictly, that is
metadata — zero bytes of value. A human auditor still often wants the
value for sanity-checking ("was the claimed identity actually `true`?"),
but disclosing it unconditionally would make every recorded decision leak
whatever the domain's signals carry (see Decision 4, SENSITIVE_DATA) for a
benefit `decide()` itself never needed. Splitting the two — metadata always,
value only on named request — resolves the tension the brief itself flags
without weakening replay (Decision 2 shows why metadata suffices) or
silently over-disclosing.

## Decision 2 — REPLAY_SHAPE: `replay(record, prohibitions)`, and why metadata-only signals are enough

```ts
function replay(record: DecisionAuditRecord, prohibitions: readonly Prohibition[]): ReplayResult
```

The signature names, explicitly, the one thing beyond the record itself
that replay needs: the prohibition set (Decision 3). Nothing else is
implicit — `record.now` is reused (never `systemNow()`), and the record's
own evidence snapshot is reconstructed via `fromSignalSnapshot`, never
fetched from anywhere ambient.

`fromSignalSnapshot` reconstructs a `Signal` whose `value` is
`UNDISCLOSED_VALUE`, a unique, unmistakable sentinel — never the original
value, never `undefined`/`null` (which could be mistaken for a genuinely
asserted falsy fact). This is sound specifically because of Decision 1's
finding: since `decide()` never reads `.value`, a signal reconstructed from
metadata alone is **behaviorally identical**, for every purpose `decide()`
has, to the original. Replay therefore never needs the disclosed value at
all — the value-hiding problem and the replay problem turn out to be
independent, not in tension, once you notice which fields `decide()`
actually consults.

`recordDecision` is the *only* function that constructs an `AuditRecord`'s
`decision` field, and it always does so by calling `decide(input)` itself
— never by accepting an already-computed decision as a parameter. That is
the structural half of `no-unreplayable-decision` (see UNREPLAYABLE below).

## Decision 3 — PROHIBITIONS: record ids in order, require the caller to supply real predicates, detect a mismatch explicitly

`Prohibition.matches` is a function and cannot be serialized. A record
carries `prohibitionIds: readonly string[]` — the ids `decide()` was given,
**in the order they were given**, because `findProhibition` checks in
order and a reordering can change which rule fires first. Replay requires
the caller to supply `prohibitions: readonly Prohibition[]` — real
predicates, from whatever rule catalog is live at replay time. This is an
honest, stated limitation: **a record is only replayable relative to a
known set of rules**; it proves which rule fired, never what the full rule
set *was* at decide-time, beyond the ids it names.

`replay()` computes `ruleSetMatches` — whether the supplied ids, in order,
equal the recorded ones — and reports it **unconditionally**, independent
of whether the decision happens to come out the same. This is what makes a
different rule set *detectable* rather than silently divergent: even when
a changed prohibition coincidentally doesn't change the outcome (because it
never mattered for this action), `ruleSetMatches: false` still says
plainly "this did not replay under the recorded rules." Conflating "the
output looks the same" with "this proves what the record claims" would
have been the actual failure mode here.

## Decision 4 — SENSITIVE_DATA: never recorded by default; the limit stated honestly

Given Decision 1, the default `recordDecision` path never touches a
signal's value, so there is no generic redaction logic to get wrong (and
no way for it to silently miss a shape it wasn't told about) — the
strongest available guarantee, "doesn't collect it," rather than "collects
it and tries to scrub it well." The honest limit: **an audit record alone
cannot prove what a disclosed value actually was** — an auditor who wants
to check "the record says a `customer.identity.verified` signal at
confidence 0.92 satisfied this; was it actually `true`?" cannot answer that
from the record. They must call `discloseSignalValue` explicitly, against
the *original* signal (not a replay-reconstructed one, which only ever
returns `UNDISCLOSED_VALUE`) — and doing so is a value-revealing act with
its own accountability, deliberately not something this package hides
inside a convenience method. M6 will wire real domains (refund, deploy,
moderation) that plausibly carry customer data through signals; this
design means the audit trail itself is safe to store, forward, or log by
default, at the cost of being less immediately human-checkable without a
deliberate, separate disclosure step.

## Decision 5 — INPUT_REJECTED: a `RejectedAuditRecord`, explicitly not replayable

`decide()`'s `InputRejected` means nothing was ever evaluated — no
`Action`, so no honest `Decision`. Recording one still has value (an audit
trail of "we received garbage" is real information), but it cannot be
treated like a `DecisionAuditRecord`: there is no `action`/`requirements`/
`now` to replay. `RejectedAuditRecord` states `replayable: false` and a
`replayNote` explaining why, and `replay()`'s parameter type only accepts
`DecisionAuditRecord` — calling it on a `RejectedAuditRecord` is a
TypeScript compile error (`__tests__/input-rejected.test.ts`'s
`@ts-expect-error` proves it), never a runtime discovery. No attempt is
made to serialize and "replay" the original hostile input (a throwing
Proxy cannot be safely stored at all) — this is a deliberate omission, not
an oversight.

## Decision 6 — UNREPLAYABLE: structurally impossible by construction, not merely checked

`recordDecision(input, id, recordedAt)` always computes
`decision = decide(input)` itself and stores exactly that; there is no
public function in this package that accepts an already-computed decision
and a *different* input and pairs them into a record. Combined with:

1. `decide()`'s own proven purity (`lib/decide/__tests__/determinism.test.ts`),
2. Decision 2's finding that metadata-only replay signals are behaviorally
   identical to the originals for every purpose `decide()` has, and
3. lossless verbatim storage of `action`/`requirements`/`now` (all plain
   data, no functions, nothing lost in transcription),

replaying a `DecisionAuditRecord` against the *same* prohibition set is
guaranteed, by construction, to reproduce the recorded decision — there is
no code path that could produce a record decide() itself would disagree
with, for that same rule set. This is proved, not just hoped for, by
`__tests__/replay-property.test.ts`: 400 PRNG-generated cases (seeded,
reproducible), covering all five outcomes, each recorded and replayed with
the same reconstructed prohibitions — every single one deep-equals,
excluding `id`/`recordedAt` (the two fields `recordDecision` does not
derive from `input` at all, so a replay is never expected to reproduce
them; `Decision` itself carries no id/timestamp field to exclude).

What is *not* structurally guaranteed, and is stated honestly rather than
silently assumed: a record whose `action`/`requirements`/`decision` fields
have all been tampered with **consistently** (an attacker who re-runs
`decide()` themselves on a forged input and substitutes both the input and
the matching decision) would replay clean — `replay()` can only catch an
*inconsistent* tamper (one field changed without the others), which is
exactly what the milestone's own TESTS section asks for (a changed
confidence, cost, or swapped outcome). Cryptographic signing would close
this gap; it was not requested and is out of scope here (see
DELIBERATE_OMISSIONS in the M5 final report).

## Consequences

- Positive: the value-hiding tension the brief warned about turns out to
  be a non-problem for replay specifically, once `decide()`'s actual field
  usage is checked rather than assumed — this is the kind of thing that
  would have been easy to get wrong by reflexively recording "the signal"
  wholesale (M3's own encapsulation would have silently dropped the value
  anyway) or by reflexively disclosing it "to be safe" (leaking sensitive
  data for no decision-relevant reason).
- Negative / cost: a caller who wants a human-legible trail with real
  values must call `discloseSignalValue` themselves, per signal, and store
  the result separately if they want it persisted — this package does not
  offer a single "record with full disclosure" convenience function,
  deliberately, so that no future caller can reach for one shortcut that
  quietly reintroduces the exact incidental-leak failure mode this ADR
  closes.
- `RecordedDecision` (record.ts) intentionally duplicates
  `lib/decide/evidence.ts`'s `Evidenced*Decision` pattern one layer up
  (swapping `Signal[]` for `SignalSnapshot[]`) rather than trying to
  generically parameterize `EvidencedDecision` over its evidence type —
  `lib/decide/**` is frozen for this milestone, so the pattern is repeated,
  not shared, and a future milestone wanting to unify them would need to
  unfreeze M4.

## Alternatives rejected

- **Recording live `Signal` objects (or a "close enough" clone) inside the
  audit record** — rejected: closures cannot be serialized, and
  `structuredClone`/`JSON.stringify` already silently drop the value (M3's
  own verification), so this would produce a record whose apparent
  completeness ("it has the Signal!") is an illusion — worse than
  `SignalSnapshot`'s honest, explicit metadata-only shape.
- **Recording the disclosed value inline in every `AuditRecord`** —
  rejected per Decision 4: it is not needed for replay (Decision 2), and it
  would make every stored record a potential sensitive-data sink by
  default, for a benefit (human legibility) that a separate, opt-in
  function already provides without that cost.
- **Trying to serialize `Prohibition.matches` (e.g., by requiring domains
  to author rules as data — a DSL — instead of functions)** — rejected:
  `lib/decide/prohibition.ts` is frozen this milestone and its `Prohibition`
  shape is exactly `{ id, reason, matches: (action) => boolean }`;
  redesigning prohibitions as serializable data is an M4-scope change, not
  M5's to make. Recording ids and requiring the real predicate set at
  replay time is the honest alternative available without touching frozen
  code.
- **A single combined `AuditRecord` type instead of a `DecisionAuditRecord`
  / `RejectedAuditRecord` union** — rejected: `InputRejected` has no
  `action` to attach anything to, and forcing one shape would mean either
  fabricating a placeholder action (misrepresenting what was evaluated,
  the same mistake M4's own ADR 0002 refused to make for `decide()` itself)
  or making every field on the combined type optional, which would let a
  real decision's record accidentally look incomplete.
