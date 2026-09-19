# ADR 0004 — Value constraints: the content of evidence finally affects the outcome

- **Date:** 2026-09-19
- **Status:** accepted
- **Phase / milestone:** post-M5, independent verification follow-up — `lib/signals/`, `lib/decide/`,
  `lib/audit/`

## Context

An independent verification of the engine found a real defect, not a stylistic complaint: `decide()` never
reads a signal's *value*. Every function it calls — `analyzeGaps`, `findSatisfaction`, `aggregateConfidence`
— reads only `signal.kind`, `signal.capturedAt`, and `signal.confidence`. A signal asserting
`fraud.assessment = "CLEAN"` and one asserting `fraud.assessment = "FRAUDULENT — stolen card"`, at the same
confidence and freshness, produce the *identical* decision. The content of evidence does not affect any
decision. That is a real gap in what this project claims to be: a decision layer that reasons about
evidence, not merely about evidence's shape.

The verification's own framing matters as much as the finding: encoding verdicts in signal *kinds* instead
(a `fraud.cleared` signal exists, or it does not) does not eliminate per-domain judgment — it relocates it
into whichever code decides which kind to mint, one layer removed. That is exactly the "bespoke rules per
domain" ADR 0001 rejected, wearing a different costume. So the fix has to let the *engine itself* interpret
a value against a declared bound, generically, not push the interpretation back out to per-domain minting
logic.

## Decision 1 — CONSTRAINT_SHAPE: data, not a predicate closure

A `ValueConstraint` (`lib/signals/constraint.ts`) is a plain, serializable discriminated union:

```ts
type ValueConstraint =
  | { op: "equals"; value: string | number | boolean }
  | { op: "lte"; value: number }
  | { op: "gte"; value: number }
  | { op: "in"; values: readonly (string | number | boolean)[] };
```

A predicate closure (`valueCheck?: (v: unknown) => boolean`) was considered and rejected outright: it would
reproduce the exact wart `Prohibition.matches` (`lib/decide/prohibition.ts`) already has — an unserializable
function that forced M5's audit trail to record prohibitions by id and require the caller to supply the
real predicates again at replay time (`.genesis/decisions/0003-audit-model.md`'s PROHIBITIONS section).
Expressing a constraint as data means `lib/audit/rule.ts` can name the exact constraint that failed
*directly in the audit record*, with no external rule catalog needed at replay — the same property
`Prohibition` explicitly does not have.

### The operator set — chosen deliberately, kept deliberately small

Four operators, argued against three real domains (refund approval, code deploy, content moderation) rather
than built as a general expression language:

- **`equals`** — exact match for a categorical verdict: a fraud assessment reading exactly `"clear"`, a
  moderation classification reading exactly `"safe"`. The case the milestone's headline example (fraud
  `CLEAN` vs. `FRAUDULENT`) exercises directly, and the one every domain needs first.
- **`lte`** — an upper bound on a numeric score: a risk score, a toxicity score, a blast-radius metric.
  Inclusive (`<=`), matching every other bar in this project (`requirement.minConfidence`,
  `requiredConfidence`) — never strict, so a policy author never has to reason about an off-by-epsilon
  boundary the rest of the codebase doesn't ask them to reason about elsewhere.
- **`gte`** — the symmetric floor: a code-review approval count, a reputation score. Without it, "at least
  N" has no honest expression — negating it through `lte` on a transformed value is exactly the kind of
  caller-side cleverness this project's fail-closed style avoids elsewhere.
- **`in`** — set membership against a short, explicit allow-list: a moderation category in
  `{"safe","low-risk"}`, a deploy target in `{"staging","canary"}`. Without it, a two-valued allow-list would
  need two separate Requirements for the same signal kind — a worse shape than naming the set once.

**Deliberately left out**, each a real decision against the same "bespoke rules, one layer down" risk this
milestone exists to close:

- **`notEquals` / a blocklist operator** — an allow-list already says everything a blocklist would for the
  closed, small value spaces these domains use, and a blocklist invites an ever-growing "everything except
  X, Y, Z" list as new bad values are discovered.
- **`lt` / `gt` (strict variants)** — every bound in this codebase is inclusive; strict variants would double
  the numeric surface for a distinction no real policy here needs to floating-point precision.
- **Regex / substring / "contains"** — this would let the engine start pattern-matching the *content* of
  free text, a much larger step toward "the engine re-implements domain judgment" than a bounded numeric or
  categorical check. A domain that needs this should emit its own categorical signal, computed by its own
  judgment.
- **Compound combinators (`and`/`or`/`not` of constraints)** — a Requirement is already the unit of
  composition (aggregation, precedence); a second composition mechanism inside one constraint is the
  unbounded expression language this milestone is explicitly warned against building.
- **Cross-signal comparison** — every constraint here is evaluated against exactly one signal's own value,
  matching `Requirement.signalKind` naming exactly one kind; comparing two signals is a `derived` signal's
  job (`lib/signals/provenance.ts`), computed by a domain, not a new mode for the constraint evaluator.

Full reasoning, in the same voice as the rest of this codebase's inline comments, lives in
`lib/signals/constraint.ts`'s own header.

## Decision 2 — WHEN IT RUNS: strictly after freshness and confidence, never instead of them

A constraint is checked only against a candidate signal that has *already* cleared `requirement.maxAge` and
`requirement.minConfidence` (`lib/signals/gap.ts`, `lib/decide/satisfaction.ts` — both updated in lockstep,
duplicating the check exactly as they already duplicated the fresh/confident filter, per M4's own
established convention for these two files). A stale or below-confidence signal is still missing, exactly
as before a constraint could exist — a constraint never resurrects evidence that wasn't good enough to use
in the first place, and never runs against it either. This is where `Signal.read(maxAge, now)` — elaborate
staleness narrowing that had zero decision-path callers since M3 — finally gets one: `lib/signals/
constraint.ts`'s `checkValueConstraint` is the one real caller inside the engine.

## Decision 3 — THE CENTRAL QUESTION: what outcome, when the value itself says no

A signal present, fresh, and confident, whose value fails its constraint, is not a gap in the
`absent`/`stale`/`below-confidence` sense — the evidence is present and says no. `analyzeGaps` gets a fourth
`Gap` reason, `"constraint-violated"` (`lib/signals/gap.ts`), that deliberately carries **no `supplier`
field at all**: the `counterparty`/`time`/`human` taxonomy (`lib/signals/requirement.ts`) answers "who could
supply the missing thing," and nothing is missing here. Precedence (`lib/decide/precedence.ts`,
`gapPrecedenceRank`) ranks it **ahead of every supplier kind, including `human`**: a value rejection is
qualitatively more decisive than any "not yet" gap — a missing fact, elapsed time, or pending human
judgment all describe evidence that could still turn out fine once supplied; a value rejection is evidence
that has already arrived and already says no, and resolving every other simultaneous gap does not change
that answer.

**Which of the five outcomes.** `refuse` is wrong on its own terms: it means "independent of who is asking
or how certain anyone is," and a value rejection is the opposite — a different value for the same signal
would produce a different outcome. `ask`/`defer` are wrong because nothing is missing to ask a counterparty
for or wait on. The original `escalate` ("regardless of how good the evidence looks") is also not quite
right, because this case is entirely about how the evidence looks. **Resolution: `escalate` is amended
(ADR 0001, amendment dated 2026-09-19) to cover a second cause** — not stretched silently, but explicitly
renamed as a two-cause outcome, with the amendment itself arguing why a clean sixth `Decision` outcome (a
plausible name: `reject`) is the *conceptually* right fix, deferred because `lib/contracts/` is frozen for
this change. What generalizes across both `escalate` causes is autonomy: ownership of this one call moves to
a human either way, and `decide()` cannot resolve it autonomously in either case (see `.genesis/DONE.html`'s
autonomy-level section).

**Kept mechanically distinguishable, not just in prose.** `lib/audit/rule.ts`'s `RuleTrace` gets a sibling
variant, `"value-rejected"` — never folded into `"gap"` (no honest `supplierKind` to put there) or
`"confidence-bar"` (a different cause entirely). A consumer that cares can branch on `RuleTrace.kind` instead
of parsing `missing.reason` prose to tell a value rejection apart from a cost-ceiling escalate.

## Decision 4 — TYPE MISMATCHES FAIL CLOSED, categorically

`evaluateConstraint` (`lib/signals/constraint.ts`) returns `{ satisfied: true }` or `{ satisfied: false,
reason }`, where `reason` is one of `"violated"` (right shape, wrong value), `"type-mismatch"` (an `lte`
against a string, an `equals` against an object, `undefined`), `"malformed"` (the constraint itself is
broken — unknown `op`, wrong-shaped `value`/`values`), or `"unreadable"` (the signal's own `.read()`
disagreed with the freshness check that should have guaranteed a `"fresh"` reading — kept as an explicit,
tested case rather than assumed unreachable). All four collapse to "not satisfied" for decision purposes;
keeping them distinct lets a test — and a human reading an audit trail — tell "the evidence disagreed" apart
from "the evidence wasn't even comparable" apart from "the policy itself is broken," without the actual
value ever being examined to explain which. Every property read (`op`, `value`, `values`, a signal's
`.read()`) goes through the same defensive-read discipline `lib/contracts/validation.ts` and
`lib/signals/validation.ts` already use, so a throwing getter or a hostile Proxy — as the constraint, or as
the actual value — folds into `"malformed"`/`"type-mismatch"` and never escapes as an exception.

## Decision 5 — AUDIT: the constraint is named, the value never is — and a real replay subtlety this forced into the open

`lib/audit/rule.ts`'s `"value-rejected"` `RuleTrace` carries `requirementSignalKind`, `signalId`, and the
`constraint` itself — the declared **policy** (an operator and a threshold or set), which is safe to record
by the same logic that already makes `Prohibition.reason` and `Requirement.description` safe: it's what the
domain author wrote down, never what a specific request's evidence happened to say. The signal's actual
value is never on the Gap, never on the RuleTrace, never on the Decision — it stays reachable only through
`discloseSignalValue` against the *original* signal, exactly as ADR 0003 established for every other Gap
reason. `lib/decide/reasons.ts`'s `valueRejectionReason` renders the escalate prose from the requirement's
`description`/`signalKind` and the constraint's own declared bound — never the observed value.

**The subtlety this surfaced, and how it's resolved.** ADR 0003's replay soundness proof rested on a fact
that was true through M5: `decide()` never calls `.read()`, so a signal reconstructed from metadata alone
(`fromSignalSnapshot`, value = `UNDISCLOSED_VALUE`) is *behaviorally identical*, for every purpose `decide()`
has, to the original. This milestone makes that fact false for any requirement declaring a `valueConstraint`
— `decide()` now does call `.read()`, and its outcome can depend on what comes back. Two different replay
scenarios follow from this, discovered and proven by mutation-testing this exact change, not merely by
inspection:

1. **A value *rejection* still replays exactly, using metadata alone.** `UNDISCLOSED_VALUE` (a symbol) can
   never equal, compare to, or appear in the set of any real constraint threshold — so it always evaluates
   to `"type-mismatch"`, regardless of what the original real value's own failure category was. If the
   *rendered escalate text* distinguished `"violated"` from `"type-mismatch"` in its wording, a record whose
   real value produced `"violated"` would never replay-match, even though the rejection itself (which
   requirement, which constraint, which signal) is perfectly reproducible without the value. So
   `valueRejectionReason` deliberately renders `"violated"` and `"type-mismatch"` as the **same sentence** —
   documented in `reasons.ts` with the replay reasoning spelled out, not left for a future reader to
   rediscover by a failing test. `"malformed"` and `"unreadable"` don't have this problem (neither depends
   on the real value's shape) and keep their own distinct wording.
2. **A value *satisfaction* (contributing to `execute`) cannot replay from metadata alone, and this is
   stated honestly rather than silently broken.** If the original decision executed because a real value
   cleared its constraint, `UNDISCLOSED_VALUE` at replay time fails that same constraint unconditionally —
   replay correctly, detectably reports `matches: false` (never a crash, never a silent false match).
   `replay()` (`lib/audit/replay.ts`) gains a third, **optional** parameter, `knownSignals`, mirroring the
   exact precedent ADR 0003 already set for `Prohibition`: a caller who legitimately holds the *original*
   signals (never persisted alongside the record — supplied fresh, in-process, by whoever is doing the
   verifying) may pass them in, and a supplied signal is substituted for the metadata-only reconstruction
   **only when its own metadata (`kind`/`capturedAt`/`confidence`/`source`) deep-equals the recorded
   snapshot** — a same-id signal with different metadata is rejected as an impostor, not trusted. Omitting
   `knownSignals` is always safe: it never causes a value to be *recorded* anywhere, and the metadata-only
   path remains the default, exactly as sensitive-by-default as before.

## Consequences

- Positive: the fraud `CLEAN`/`FRAUDULENT` example now produces different outcomes, closing the actual
  defect the verification found — and does so through a generic, data-driven mechanism a reviewer can audit,
  not through a per-domain escape hatch.
- Positive: the operator set is small enough to enumerate and argue in one file's header comment; a reader
  who disagrees with an omission can find the argument and reply to it directly.
- Positive: the replay subtlety is not a latent bug shipped alongside the feature — it was found by this
  milestone's own mutation self-check, fixed at the wording layer for the case the milestone's tests require
  exact replay for (a rejection), and honestly scoped (not silently patched over) for the harder case
  (a satisfaction), with an explicit, opt-in mechanism to close that gap when the caller can provide it.
- Negative / cost: `escalate` now has two causes instead of one, distinguishable only via `RuleTrace` — a
  consumer reading `missing.reason` prose alone (rather than the audit layer) cannot mechanically tell them
  apart without string-matching, which is the actual, honestly-stated cost of not unfreezing `lib/contracts/`
  for this change (see ADR 0001's amendment).
- Negative / cost: `replay()`'s soundness guarantee is now conditional on `knownSignals` for the
  constraint-satisfied case specifically — a caller who only ever calls `replay(record, prohibitions)` (the
  pre-existing two-argument form) gets a correct, detectable `matches: false` for those records, never a
  silent false match, but also never `true` without supplying the real signals.

## Alternatives rejected

- **A predicate closure (`valueCheck?: (v: unknown) => boolean`)** — rejected; see Decision 1. Reproduces
  `Prohibition.matches`'s exact unserializability problem, one layer down.
- **Encoding verdicts in signal kinds instead of reading values** — rejected; this is the verification's own
  framing, restated here for the record: it relocates per-domain judgment into whichever code mints the
  kind, one layer removed, and would gut the project's claim that one engine is the single place judgment
  happens.
- **Mapping a constraint-violated gap through its requirement's declared `supplier` anyway** (treat it as
  `ask`/`defer`/`escalate` based on whatever `supplier` the requirement happened to declare) — rejected: a
  `supplier` answers "who could supply the missing thing," and nothing is missing here. Concretely, if the
  requirement's supplier were `counterparty`, this would produce `ask` — re-asking the counterparty for a
  fact they already supplied, which already said no. That is not actionable, it is nonsensical, and it is
  exactly the kind of silently-wrong outcome `requirement.ts`'s own "HAZARD FOR M6 DOMAIN AUTHORS" comment
  warns about for supplier mislabelling — except this would be the ENGINE manufacturing the mislabel, not a
  domain author's mistake.
- **A general expression language for constraints** (arbitrary boolean combinators, regex, cross-signal
  comparison) — rejected throughout Decision 1's operator-set discussion: this is the "bespoke rules per
  domain" problem ADR 0001 already rejected, one layer down, in a different costume; a constraint vocabulary
  that grows without limit becomes exactly that problem again.
- **A generic "verdict cache" on `SignalSnapshot` to make metadata-only replay fully sound for the
  constraint-satisfied case too** — considered, rejected: doing this soundly requires correlating a signal
  with *which* constraint(s) it was actually checked against (a signal's kind can, in principle, be shared
  by multiple Requirements with different constraints), which either needs a stable per-Requirement identity
  this project's `Requirement` shape does not have, or risks a subtly wrong "always satisfies" sentinel that
  could silently paper over a genuine future disagreement. The `knownSignals` parameter (Decision 5) achieves
  the same practical goal — full-fidelity replay when the caller legitimately has the original evidence —
  without inventing a new, narrower-than-it-looks value-shaped sentinel inside `lib/signals/constraint.ts`.

<!-- Copy this file to NNNN-<slug>.md for each irreversible decision.
     Then add a one-line pointer in wiki/index.md if it becomes something later milestones need to find. -->
