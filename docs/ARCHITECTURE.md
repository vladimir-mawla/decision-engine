# Architecture: inputs → signals → decision → audit

This is a snapshot, not a tour of the module list — `lib/` already documents itself file by file, and
repeating that here would just be a worse copy. What earns this document its place is the other half of
the story: **at each of the four stages, what does the engine refuse to do, and why.** Binary allow/deny is
the easy case; the interesting engineering is everywhere a stage declines to guess, decline to default, or
decline to let one kind of problem masquerade as another. Every refusal named below is backed by a test
that is part of the 541-test suite (`npm test`) — the citations are exact file and test names, not
paraphrase, so a reader can go look.

The four stages are also the **import direction**: `lib/contracts` is imported by `lib/signals`, which is
imported by `lib/decide` (with `lib/cost-model` feeding it the reversibility × cost bar), which is imported
by `lib/audit`. Nothing imports backward — verified directly, not assumed: `grep -rn '^import' lib/signals/*.ts`
resolves only to `lib/contracts`; `lib/decide/*.ts` resolves only to `lib/contracts` and `lib/signals`;
`lib/audit/*.ts` resolves only to `lib/decide`, `lib/signals`, and `lib/contracts`. That one-directional,
acyclic shape is itself a Definition-of-Done gate (`.genesis/DONE.html`, "Dependency direction inward, zero
cycles").

```
   INPUTS                SIGNALS               DECISION              AUDIT
lib/contracts          lib/signals        lib/decide + cost-model   lib/audit
─────────────      ─────────────────      ────────────────────    ─────────
raw JSON /       →  typed evidence,     →  action + signals      →  a record:
hostile object      each carrying          + requirements            inputs,
   │                provenance,            + prohibitions             signals-
   ▼                freshness, its           │                        as-metadata,
a real Action        own confidence          ▼                        the exact
or a typed            │                  exactly one of:               rule that
parse failure         ▼                  execute · ask ·                fired
                  a Gap, named:          defer · escalate ·             │
                  absent / stale /       refuse — never a               ▼
                  below-confidence /     bare score                 replayable:
                  constraint-violated                                decide(record
                                                                      .inputs) ==
                                                                      record.outcome
```

One honest wrinkle in the diagram above, stated rather than smoothed over: within the DECISION stage, a
`Prohibition` is checked **before any signal is read at all** — `refuse` can fire without SIGNALS having
been consulted, because `refuse` is defined as "independent of who is asking or how certain anyone is." A
diagram that drew every outcome as consuming evidence would be asserting a stage order that isn't actually
true for one of the five branches. That is the corrected version of a mistake worth naming plainly: an
earlier draft of this kind of diagram, on a sibling project, stated a stage order without checking it against
the code first. Here it was checked — see the prohibition proof below.

---

## Stage 1 — Inputs (`lib/contracts`)

**Job:** turn whatever arrives at the trust boundary — a proposed `Action`, or a `Decision` deserialized
from storage — into a typed value, or a typed, specific failure. Nothing downstream of this stage is allowed
to see raw, unvalidated JSON.

**What it refuses, and why:**

- **Refuses to guess at a malformed `Action`.** A missing `domain`, a negative `costOfBeingWrong`, an
  unrecognized `reversibility` level, or non-object `parameters` are each rejected with a specific, typed
  error — never coerced into a plausible-looking default.
  *Tests:* `lib/contracts/__tests__/validation.test.ts` — `"rejects a missing domain, without throwing"`,
  `"rejects a negative cost, without throwing"`, `"rejects an unknown reversibility level, without throwing"`,
  `"rejects non-object parameters, without throwing"`.
- **Refuses to let a hostile object crash the parser.** A throwing getter, a `Proxy` whose `get` trap
  throws, or an inherited throwing getter on the prototype chain all become a structured parse failure —
  never an uncaught exception. `parseAction`/`parseDecision` carry a doc comment promising this, and it was
  once false (see Limits, and `tests/failures/part2-defect1`): the current code is the fixed version.
  *Tests:* `validation.test.ts`'s `"hostile accessors never escape parseAction/parseDecision as exceptions"`
  block — `"an own getter that throws on domain becomes a structured failure, not a throw"`, `"a Proxy whose
  get trap throws for one property becomes a structured failure, not a throw"`, and the parallel case for
  `parseDecision`'s `action`/`missing` fields.
- **Refuses to resolve ambiguity toward the lenient answer.** When a reversibility level or a cost can't be
  determined at all, both resolvers fail toward the **worst** case — the highest confidence bar — never a
  forgiving default that would make garbage input look safe.
  *Tests:* `lib/contracts/__tests__/fail-closed.test.ts` — `"fail-closed: undeterminable reversibility
  resolves to the worst case"`, `"fail-closed: undeterminable cost of being wrong resolves to the worst
  case"`, `"combining both resolvers on completely garbage input yields the global maximum bar"`.
- **Refuses to fabricate an `Action` when there is nothing usable to attach one to.** One level up, in
  `lib/decide`, `decide(null)`/`decide(undefined)`/a top-level hostile `Proxy` never throws and never invents
  a placeholder `Action` — it returns `InputRejected`, a value deliberately outside the five sanctioned
  `Decision` outcomes, because every real outcome requires a real `action` and pretending otherwise would
  misrepresent what was evaluated.
  *Tests:* `lib/audit/__tests__/input-rejected.test.ts` — `"decide(null) records a RejectedAuditRecord, never
  a fabricated Decision"`, `"a Proxy that throws on every access records a RejectedAuditRecord, never
  throws"`; `tests/failures/part2-defect4-input-rejected.test.ts` (this was a real, shipped CRITICAL defect —
  see Limits).

## Stage 2 — Signals (`lib/signals`)

**Job:** model every piece of evidence as a typed `Signal` carrying its own provenance (where it came from),
freshness (how old it is), and confidence — and turn a gap in that evidence into a named, first-class fact,
never a silent default.

**What it refuses, and why:**

- **Refuses to treat absent, stale, or under-confident evidence as usable.** `analyzeGaps` reports a `Gap`
  instead of silently proceeding — a signal that exists but has aged past `requirement.maxAge`, or one whose
  confidence sits under `requirement.minConfidence`, is still missing.
  *Tests:* `lib/signals/__tests__/gap-analysis.test.ts` — `"a signal that exists but is older than the
  requirement's maxAge still produces a gap"`, `"produces a below-confidence gap, not a satisfied
  requirement"`.
- **Refuses to fabricate an age when the clock disagrees with itself.** If every candidate signal for a
  requirement is clock-inconsistent (captured, by its own timestamp, in the future relative to `now`), the
  Gap reports that honestly — never a plausible-looking `age: 0`. (This was itself a real, shipped defect —
  see Limits.)
  *Tests:* `gap-analysis.test.ts` — `"reports age as clock-inconsistency, never a fabricated zero, when the
  only candidate's capturedAt is after now"`.
- **Refuses to let a value constraint run instead of the freshness/confidence gate, in either direction.** A
  constraint is checked only against a candidate that already cleared staleness and confidence; it never
  resurrects evidence that wasn't good enough to use, and never lets a good value excuse staleness either.
  *Tests:* `gap-analysis.test.ts` — `"staleness still wins: a stale signal is still missing, even if its value
  would have cleared the constraint"`, `"confidence still wins: a below-confidence signal is still missing,
  even if its value would have cleared the constraint"`.
- **Refuses to accept a value it cannot honestly compare, or a constraint that is itself broken.** A
  numeric constraint against a non-numeric value, or an unknown operator, fails closed to
  `constraint-violated` — never throws, never fabricates a pass.
  *Tests:* `gap-analysis.test.ts` — `"type-mismatched: a numeric constraint against a non-numeric value is a
  constraint-violated gap (fails closed, never satisfied, never throws)"`, `"a malformed constraint (unknown
  op) never fabricates a pass"`, `"a constraint whose declared value is a throwing getter or a Proxy fails
  closed, never throws out of analyzeGaps"`.
- **Refuses an unbounded allow-list from untrusted input — with an honestly narrow scope.**
  `parseValueConstraint` caps an `"in"` constraint's `values` at `MAX_IN_VALUES` (64) and rejects anything
  longer outright, never truncating it into something that looks like it was honored.
  *Tests:* `lib/signals/__tests__/validation.test.ts` — `"rejects MAX_IN_VALUES + 1 entries with a typed,
  specific error — never truncates and never throws"`. **The honest limit:** this cap lives only in the
  parser. `decide()` called directly, or a `Requirement` built by hand with an unbounded `in.values` array,
  is not stopped by it — see Limits in the README.

## Stage 3 — Decision (`lib/decide`, `lib/cost-model`)

**Job:** map an `Action`, its `Signal`s, its `Requirement`s, and any `Prohibition`s to exactly one of five
outcomes — `execute` · `ask` · `defer` · `escalate` · `refuse` — applying the reversibility × cost asymmetry
(`requiredConfidence`) that sets how much evidence this specific action needs.

**What it refuses, and why:**

- **Refuses to let evidence matter once a `Prohibition` fires.** A matching prohibition produces `refuse`
  without the signals array being read at all — proven directly, not inferred from the absence of a crash:
  the test passes a `signals` array wrapped in a `Proxy` that throws on every property access, and confirms
  `decide()` still returns `refuse`, which is only possible if `signals` is never touched.
  *Tests:* `lib/decide/__tests__/prohibition.test.ts` — `"PROOF: a prohibited action never reads the signals
  array at all — a signal collection whose access throws is never touched"`, `"ORDERING PROOF (no crash
  involved): a prohibition match touches requirements/signals exactly zero times, counted directly rather
  than inferred from a thrown error"`.
- **Refuses to fail open on a hostile rule.** A `Prohibition.matches` predicate that throws is treated as a
  match — `refuse` — never as "doesn't apply."
  *Tests:* `prohibition.test.ts` — `"a matches predicate that throws is treated as a match, never as 'does
  not apply'"`.
- **Refuses to compare confidence against anything but a computed bar.** Every threshold in `lib/decide/`
  traces back to `requiredConfidence(reversibility, cost)`; there is no bare fractional literal used in a
  comparison anywhere in the package, and the bar is proven to actually move between at least two distinct
  `(reversibility, cost)` pairs, not just declared to.
  *Tests:* `lib/decide/__tests__/no-bare-threshold.test.ts` (greps the package for a bare literal),
  `lib/decide/__tests__/asymmetry.test.ts` (the identical confidence value fed through two different
  cost/reversibility profiles yields `execute` for one and `escalate` for the other).
- **Refuses to construct an outcome without the evidence that produced it.** `lib/decide/evidence.ts` is the
  only file that builds an outcome literal; every one of its five builder functions requires an `evidence`
  parameter with no default, and `decide()` itself never constructs a `Decision` literal.
  *Tests:* `lib/decide/__tests__/no-outcome-without-signals.test.ts`.
- **Refuses to let more stated cost buy back a value that already said no** — and, in the opposite
  direction, refuses to call that same case a categorical `refuse`, because a *different* value for the same
  signal would produce a *different* outcome. A value rejection outranks every supplier kind, including
  `human`, and is kept mechanically distinguishable from an ordinary confidence-bar escalate via
  `RuleTrace.kind`, never by parsing prose.
  *Tests:* `lib/decide/__tests__/value-constraint.test.ts`; `lib/decide/__tests__/escalate.test.ts` (all four
  escalate causes, asserted separately).
- **Refuses to guess when its own two internal checks disagree with each other.** `analyzeGaps` and
  `findSatisfaction` can genuinely disagree (a signal claiming `confidence: Infinity` clears one's bare `>=`
  check but fails the other's `Number.isFinite` guard) — `decide()` fails closed to `escalate` rather than
  trusting either side.
  *Tests:* `escalate.test.ts`'s "internal inconsistency" case.
- **Refuses to throw, for any input** — including the specific case that once falsified this exact promise
  (see Limits): `decide(null)`/`decide(undefined)` return `input-rejected` rather than propagating a
  `TypeError` from inside the function's own catch handler.
  *Tests:* `lib/audit/__tests__/input-rejected.test.ts`; `tests/failures/part2-defect4-input-rejected.test.ts`.

## Stage 4 — Audit (`lib/audit`)

**Job:** record a decision's inputs, its evidence as metadata, and the exact rule that fired — and make the
record replayable: feeding `record.inputs` back through `decide()` must reproduce `record.outcome`.

**What it refuses, and why:**

- **Refuses to record a signal's actual value, by default.** Every `AuditRecord`'s evidence is a
  `SignalSnapshot` — `id`/`kind`/`source`/`capturedAt`/`confidence` only. Disclosing the real value is
  possible through exactly one separate, named, opt-in function; nothing in the default recording path calls
  it.
  *Tests:* `lib/audit/__tests__/record.test.ts` — `"never discloses a signal's value — evidence entries are
  structurally plain metadata, even when the underlying signal carries something sensitive"`, `"disclosure
  remains available, separately and by name, for a caller who deliberately wants it"`.
- **Refuses to let a record claim a replayability it doesn't have.** An `InputRejected` result becomes a
  `RejectedAuditRecord` with `replayable: false`; `replay()`'s own parameter type refuses a
  `RejectedAuditRecord` at **compile time**, not as a runtime surprise.
  *Tests:* `lib/audit/__tests__/input-rejected.test.ts` — `"replay() cannot even be called on a
  RejectedAuditRecord — enforced by TypeScript, not a runtime check"` (a `@ts-expect-error` assertion).
- **Refuses to call a changed rule set a match just because the outcome happens to agree.**
  `ruleSetMatches` is computed and reported unconditionally — a different, or reordered, prohibition set is
  detectable even on the rare occasion it doesn't happen to change the outcome.
  *Tests:* `lib/audit/__tests__/replay.test.ts` — `"ruleSetMatches is false when the supplied prohibition ids
  differ from the recorded ones"`, `"ruleSetMatches is false when order differs, even with the same ids"`,
  `"a prohibition set that actually changes the outcome is caught by BOTH ruleSetMatches and matches"`.
- **Refuses to fabricate a match it can't verify.** Without the caller supplying the real original signals
  (the optional `knownSignals` parameter), a value-constraint-dependent replay reports `matches: false`
  rather than a false positive — and this limit is honestly wider than it first looked (see Limits): a
  recorded `ask` can replay as `escalate`, not only an `execute`.
  *Tests:* `lib/audit/__tests__/value-constraint.test.ts`; `tests/failures/part2-defect8-value-constraint-replay-flip.test.ts`.
- **Refuses to reproduce the wall clock instead of the record.** `replay()` is driven only by `record.now`;
  two otherwise-identical records differing only in `now` replay to different results — something a real
  clock could not produce.
  *Tests:* `replay.test.ts` — `"two otherwise-identical records that differ ONLY in now replay to different
  results — a wall clock could not produce this divergence"`.

---

See [`THESIS.md`](THESIS.md) for where this is going, [`NOTES.md`](NOTES.md) for how it was built and
verified, and the [README](../README.md) for the honest limits this architecture does **not** close.
