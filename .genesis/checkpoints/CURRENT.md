# CURRENT
- active_loop: post-M5 independent-verification follow-up — value constraints, branch
  `value-constraints`, built from `main`. Not pushed; `main` untouched.
- target: fix a real defect an independent verification found in the already-shipped M4/M5 shape:
  `decide()` never reads a signal's *value*, so the content of evidence (e.g. a fraud assessment reading
  `CLEAN` vs. `FRAUDULENT`) never affects any decision. Deliberately touches three previously-frozen,
  independently-verified modules — `lib/signals/`, `lib/decide/`, and (by consequence) `lib/audit/` —
  while keeping `lib/contracts/`, `lib/cost-model/`, and `app/` genuinely frozen throughout.
  `.genesis/decisions/0004-value-constraints.md` is the full record; `.genesis/decisions/0001-five-
  outcome-model.md` is amended (not silently reused) to cover the new case.
- last_gate: All required gates run for real on branch `value-constraints`. (1) `npm run typecheck` —
  clean, zero errors, both configs. (2) `npm test` — 39 test files, 416 tests, all passing (was 327 at
  the start of this change; 89 net new, 0 removed or weakened). (3) `npm test -- decide` — 15 files/126
  tests, all under `lib/decide/`, pass. `npm test -- signals` — 8 files/110 tests, all under
  `lib/signals/`, pass. `npm test -- audit` — 10 files/83 tests, all under `lib/audit/`, pass. (4)
  `npm run build` — succeeds; route table unchanged (`/`, `/_not-found`, `/api/health`). (5) `git diff
  main -- lib/contracts lib/cost-model app` — 0 lines; freeze boundary held. (6) `git status --short` —
  clean after each commit, no hang. (7) `git branch --show-current` — `value-constraints`. Never pushed;
  `main` and `.genesis/DONE.html`/`.genesis/PLAN.md` untouched. (8) Mutation self-check: gutting
  `evaluateConstraint` to always return `{ satisfied: true }` breaks 47 of 416 tests (spread across
  `lib/signals/__tests__/constraint.test.ts`, `gap-analysis.test.ts`, `lib/decide/__tests__/value-
  constraint.test.ts`, `fail-closed.test.ts`, `lib/audit/__tests__/rule.test.ts`, `value-
  constraint.test.ts`) — well past the "one or two, add more" bar. A second mutation (flipping the new
  precedence rank for a value rejection from highest to lowest precedence) breaks 8 tests. Both mutations
  applied and reverted by hand; suite re-confirmed green (416/416) after each revert.
- last_action: Added value constraints, `Requirement.valueConstraint?: ValueConstraint` (lib/signals/
  requirement.ts). New file `lib/signals/constraint.ts`: `ValueConstraint` (4 operators — `equals`/
  `lte`/`gte`/`in`, each justified against three real domains, with an explicit list of deliberately
  omitted operators — no `notEquals`, no strict `lt`/`gt`, no regex/substring, no compound combinators,
  no cross-signal comparison), `evaluateConstraint` (fails closed to `malformed`/`type-mismatch`/
  `violated`, never throws), `checkValueConstraint` (the first real decision-path caller of
  `Signal.read(maxAge, now)` — used only AFTER a candidate already cleared freshness and confidence).
  `lib/signals/gap.ts` gets a fourth Gap reason, `"constraint-violated"` — carries no `supplier` field
  at all (nothing is missing; the counterparty/time/human taxonomy doesn't apply to evidence that
  arrived and said no). `lib/decide/satisfaction.ts` mirrors the same check, preserving the "the two
  modules must agree" property. `lib/decide/precedence.ts` gets `gapPrecedenceRank`, ranking a
  constraint violation ahead of every supplier kind including `human` (evidence that already says no is
  more decisive than evidence merely missing). `lib/decide/decide.ts` routes a constraint-violated gap to
  `escalate` with a new reason (`lib/decide/reasons.ts`'s `valueRejectionReason`) — argued at length in
  ADR 0004 and ADR 0001's amendment for why `escalate` (not `refuse`, not a clean sixth outcome, which
  `lib/contracts/` being frozen for this change rules out implementing now) is the least-wrong fit.
  `lib/audit/rule.ts`'s `RuleTrace` gets its own `"value-rejected"` variant (never folded into `"gap"` or
  `"confidence-bar"`) naming the constraint but never the value; `lib/audit/validation.ts` parses both
  the new `Requirement.valueConstraint` field and the new `RuleTrace` variant, failing closed on either.
  DISCOVERED AND FIXED BY THIS ITERATION'S OWN MUTATION-TESTING, NOT ASSUMED CORRECT: a real replay
  subtlety M5's own soundness proof did not anticipate, because it depended on `decide()` never calling
  `.read()` — now false. (a) A value REJECTION replays exactly from metadata alone once
  `valueRejectionReason` renders `"violated"` and `"type-mismatch"` as the identical sentence (both are
  "not satisfied" from `UNDISCLOSED_VALUE`'s perspective at replay time, even when the original, real
  value produced `"violated"` specifically) — documented in reasons.ts with the replay reasoning spelled
  out. (b) A value SATISFACTION (an execute decision that depended on a constraint clearing) cannot
  replay from metadata alone — `UNDISCLOSED_VALUE` fails any real constraint unconditionally — and this
  is stated honestly as `matches: false` (detectable, never a silent false match, never a crash) rather
  than hidden. `lib/audit/replay.ts`'s `replay()` gains an optional third parameter, `knownSignals`,
  mirroring ADR 0003's own precedent for `Prohibition`: a caller holding the real, original signals may
  supply them, matched against the recorded snapshot by id AND by matching metadata (a same-id signal
  with different metadata is rejected as an impostor), to get full-fidelity replay including constraint
  satisfaction — never persisted, never leaked into the record itself, opt-in exactly like
  `discloseSignalValue`. Re-ran and re-confirmed the pre-existing M5 value-leak tests
  (`lib/audit/__tests__/record.test.ts`, `disclose.test.ts`) still pass unmodified, plus new value-leak
  tests specific to the new Gap/RuleTrace shapes (`lib/audit/__tests__/value-constraint.test.ts`,
  `lib/signals/__tests__/gap-analysis.test.ts`). `lib/contracts/**`, `lib/cost-model/**`, `app/**`
  untouched throughout (`git diff main` on all three stayed empty after every commit).
  Wrote `.genesis/decisions/0004-value-constraints.md`; amended `.genesis/decisions/0001-five-outcome-
  model.md` explicitly (a new "Amendment — 2026-09-19" section plus a corrected `escalate` bullet, both
  stating what changed and why, never silently editing the original prose out from under a future
  reader).
- next_action: Awaiting an independent L4 VERIFY before this change counts as done, per standing
  guidance (independent APPROVE required before marking a milestone/change done, even though marking it
  done afterward is standing-OK once approved). If approved: M6 (three domains with realistic data,
  `domains/**`) is the next milestone on `.genesis/PLAN.md`, and would be the first real user of
  `valueConstraint` against non-synthetic-feeling signals (a refund domain's fraud/dispute signals, a
  deploy domain's test/review signals, a moderation domain's classifier signals) — it should also revisit
  whether `RuleTrace.kind === "value-rejected"` needs surfacing in a demo UI distinctly from an ordinary
  cost-ceiling escalate, now that the two are mechanically distinguishable.
- model: claude-opus-5
- tokens_used: ~unspecified (not tracked by this harness)
- tokens_budget: unspecified for this follow-up (not one of the original 9 milestones)
- skills_loaded: [genesis]

---

## M5 checkpoint (preserved as originally written)

- active_loop: L1 BUILD — M5 (`lib/audit/`), branch `m5-audit`, built from `main`. Not pushed;
  `main` untouched.
- target: M5 — The audit trail (a full audit record per decision — inputs, signals, reasoning,
  outcome — replayable: `decide()` fed the recorded inputs back reproduces the recorded outcome)
- iteration: 2 (this loop, M5). Iteration 1 independently VERIFIED and APPROVED the milestone
  outright, but that verification also named two test-quality findings (both in
  `lib/audit/__tests__/`, not in the audited behavior itself) and asked for a sweep of the rest of
  `lib/audit/__tests__/` for the same shape of bug. This iteration fixes both findings and the
  sweep's own additional findings, on top of the approved iteration-1 state. Iteration 1's own
  record is preserved verbatim below under "M5 iteration 1 (preserved as originally written)".
- last_gate: All required gates re-run for real on branch `m5-audit` after the two fixes and the
  sweep fixes. (1) `npm run typecheck` — clean, zero errors, both configs. (2) `npm test` —
  36 test files, 327 tests, all passing (was 325 at the start of this iteration; 2 net new tests
  — one deterministic replay-clock test, one now-vs-recordedAt divergence test; several existing
  tests gained additional assertions without adding new `it` blocks; 0 tests removed or weakened).
  (3) `npm test -- audit` — selects 9 files / 65 tests (was 63), all under `lib/audit/`, genuinely
  narrows and passes. (4) `npm run build` — succeeds; route table unchanged (`/`, `/_not-found`,
  `/api/health`). (5) `git diff main -- lib/contracts lib/cost-model lib/signals lib/decide app`
  — 0 lines; freeze boundary held. (6) `git status --short` — clean after each commit, no hang.
  (7) `git branch --show-current` — `m5-audit`. Never pushed; `main` and
  `.genesis/DONE.html`/`.genesis/PLAN.md` untouched. (8) Both named mutations (FIX 1: embed raw
  `Signal`s in `record.ts` instead of mapping through `toSignalSnapshot`; FIX 2: `replay()` reads
  `new Date().toISOString()` instead of `record.now`) re-run by hand before and after each fix
  (apply mutation, run `npm test -- audit`, revert): FIX 1's mutation now fails both of the two
  named tests directly (plus 4 others, including the previously-only-incidental `toEqual` and a
  validation round-trip test) — before the fix, that same mutation left both named tests green.
  FIX 2's mutation now fails the new deterministic clock test unconditionally (it uses `now`
  values from 2024, nowhere near the real run time, so the failure does not depend on when the
  suite runs) — before the fix, no test caught it at all except the one pre-existing
  wall-clock-coincidence test the verification had already flagged as timing-dependent.
- last_action: FIX 1 (LOW-MEDIUM, `lib/audit/__tests__/record.test.ts`) — the two tests billed as
  enforcing "never discloses a signal's value" (`"never discloses a signal's value..."` and
  `"disclosure remains available..."`) asserted only that `JSON.stringify(record)` did not
  contain a secret string. That assertion is vacuous as a security guarantee: a `Signal`'s value
  lives inside a closure (M3's own encapsulation), so `JSON.stringify` cannot reach it whether
  `recordDecision` maps evidence through `toSignalSnapshot` (correct) or embeds the raw `Signal`
  directly (a real regression) — confirmed by temporarily making `record.ts:56` do exactly that:
  neither test failed. The test that actually caught that mutation was an unrelated exact-shape
  `toEqual` elsewhere in the same file, failing only incidentally on an extra `read` function key
  in a deep comparison. Rewrote both tests' PRIMARY assertion to a structural, mutation-proof
  shape check (`assertPlainSignalSnapshot`, modeled on `snapshot.test.ts`'s own `"value" in
  snapshot` check): every evidence entry must have exactly the `SignalSnapshot` keys, no `value`
  key, and no function-valued property anywhere on it. Kept the original string-absence checks as
  secondary, explicitly-commented-insufficient-alone assertions so nobody quietly restores them as
  the primary guarantee later.
  FIX 2 (LOW, `lib/audit/__tests__/replay.test.ts`) — `replay()`'s purity with respect to
  `record.now` (never a wall clock) was only tested incidentally: every fixture in this directory
  sets `now === recordedAt` to the same constant, so a `replay()` that read
  `new Date().toISOString()` instead of `record.now` broke only 1 of 325 tests, and re-running
  that mutation with the wall-clock call swapped for the fixture's literal `NOW` (simulating a CI
  run at exactly that instant) made all 325 pass despite the mutation. Added a new test
  ("replay — driven by record.now, and nothing else") that builds two otherwise-identical records
  differing ONLY in `now` (both from 2024, deliberately far from wall-clock time), where the same
  evidence is fresh under one `now` and stale under the other; asserts the two replays disagree.
  A wall-clock implementation would see the same real instant for both calls within the test and
  could not manufacture that divergence, so this failure mode is now caught regardless of when
  the suite runs.
  SWEEP (requested: "the same shape ... any assertion that would pass under a plausible mutation,
  or that compares a value to itself through the same code path", across the rest of
  `lib/audit/__tests__/`) — read every test in the directory and mutation-tested several suspect
  spots. Found and fixed two more, both real coverage gaps of the identical "would survive a
  plausible mutation" shape as FIX 2 (not string-based like FIX 1, but equally undetectable):
  (a) every test in the directory sets `now === recordedAt`, so `record.now` and
  `record.recordedAt` were never distinguishable — a `safeReadNow` that silently ignored
  `input.now` and always returned `recordedAt` passed all 63 audit tests (verified by mutation).
  Added a `record.test.ts` test using a `now` far from `recordedAt`. (b) `RuleTrace`'s
  `confidence-bar` variant fields `saturated`/`bar`/`aggregate` were never asserted anywhere in
  `rule.test.ts` — hardcoding `saturated: false, bar: 0, aggregate: 0` in `rule.ts` passed all 63
  audit tests (verified by mutation). Added assertions computed independently via the same public
  building blocks `deriveRule` itself calls (`aggregateConfidence`, `requiredConfidence`,
  `isBarSaturated` — never reimplemented), to both existing confidence-bar tests. Also found (c)
  `disclose.test.ts` never asserted `SignalDisclosure`'s `source`/`requestedMaxAge`/`disclosedAt`
  fields — a mutation replacing all three with fixed wrong values passed all tests (verified) —
  and added assertions for them. Examined `fail-closed.test.ts`, `input-rejected.test.ts`,
  `validation.test.ts`, `replay-property.test.ts`, and `snapshot.test.ts` in the same way; found
  no further vacuous assertions there (validation.ts's round-trip tests independently reconstruct
  fields rather than passing references through, and rule.test.ts's property test already
  compares deriveRule's `kind` against decide()'s real outcome). One residual, not fixed: the
  `internal-inconsistency` `RuleTrace` branch's `requirementSignalKind` field is only ever checked
  via a loose `toContain` list in the property test (never its actual value) — flagged rather
  than fixed, since that branch is a rare internal-consistency edge case the PRNG generator may
  not even reach, and fixing it would need a hand-built scenario outside this fix's scope.
  Two commits, one per named fix (FIX 1, FIX 2); the three sweep fixes ((a), (b), (c)) were folded
  into FIX 1's and FIX 2's commits respectively by subject-matter proximity (now-vs-recordedAt
  with FIX 1's record.test.ts changes... — see the actual commit log for the exact split).
  `lib/contracts/**`, `lib/cost-model/**`, `lib/signals/**`, `lib/decide/**`, `app/**` untouched
  throughout; `.genesis/DONE.html`/`.genesis/PLAN.md` untouched.
- next_action: This iteration's two fixes and the sweep were requested directly (not gated behind
  a fresh independent L4 VERIFY) as follow-ups to an already-independently-approved milestone —
  per standing guidance, that makes marking M5 done standing-OK without asking again, the same
  precedent M4's own iteration 3 followed. M6 (three domains with realistic data, `domains/**`)
  is next.
- model: claude-sonnet-5
- tokens_used: ~unspecified (not tracked by this harness)
- tokens_budget: 150000
- skills_loaded: [genesis]

---

## M5 iteration 1 (preserved as originally written)

- active_loop: L1 BUILD — M5 (`lib/audit/`), branch `m5-audit`, built from `main`. Not pushed;
  `main` untouched.
- target: M5 — The audit trail (a full audit record per decision — inputs, signals, reasoning,
  outcome — replayable: `decide()` fed the recorded inputs back reproduces the recorded outcome)
- iteration: 1 (this loop, M5). last_gate / last_action below describe THIS iteration. The M4
  history that follows under "M4 history (preserved as originally written)" is kept verbatim from
  the previous milestone rather than edited.
- last_gate: All required gates run for real on branch `m5-audit`.
  (1) `npm run typecheck` — clean, zero errors, both configs (`tsc -p tsconfig.lib.json` and
  `tsc -p tsconfig.json`). (2) `npm test` — 36 test files, 325 tests, all passing (was 262 at the
  start of this milestone; 63 net new, all under `lib/audit/__tests__/`, 0 removed or weakened).
  (3) `npm test -- audit` — selects 9 files / 63 tests, all under `lib/audit/`, genuinely narrows
  and passes. (4) `npm run build` — succeeds; route table unchanged (`/`, `/_not-found`,
  `/api/health`). (5) `git diff main -- lib/contracts lib/cost-model lib/signals lib/decide app`
  — 0 lines; freeze boundary held (M5 additionally froze `lib/decide/**` on top of M4's freeze
  set, and this held too). (6) `git status --short` — clean after commit, no hang. (7)
  `git branch --show-current` — `m5-audit`. Never pushed; `main` and
  `.genesis/DONE.html`/`.genesis/PLAN.md` untouched.
- last_action: Built `lib/audit/` — `snapshot.ts` (Signal metadata snapshot/reconstruction,
  `UNDISCLOSED_VALUE` sentinel), `disclose.ts` (the one named, intentional value-disclosure
  function), `rule.ts` (`deriveRule` — independently re-derives which of decide.ts's own branches
  fired, using only lib/decide's public exports, never editing frozen code), `record.ts`
  (`recordDecision` — always calls `decide(input)` itself, never accepts a pre-computed decision;
  `RecordedDecision`/`DecisionAuditRecord`/`RejectedAuditRecord`), `replay.ts` (`replay(record,
  prohibitions)` — the prohibition set is the one explicit thing beyond the record it needs;
  computes `ruleSetMatches` unconditionally, fails closed on a hostile/tampered record),
  `validation.ts` (`parseAuditRecord` — hostile-input-safe boundary parser, same discipline as
  lib/contracts/lib/signals's own validators). Key design resolutions (full reasoning in
  `.genesis/decisions/0003-audit-model.md`):
  — VALUE_DISCLOSURE: sharpened the brief's own "record what was read" lean by checking what
  `decide()` actually reads off a `Signal` — never `.read()`/`.value`, only `kind`/`capturedAt`/
  `confidence` — so metadata-only recording is not a compromise, it is literally what was read;
  the value stays undisclosed by default and disclosure is one separate, named function.
  — REPLAY_SHAPE: `replay(record, prohibitions)`; metadata-only reconstructed signals are proven
  behaviorally identical to the originals for `decide()`'s purposes, which is what makes
  `no-unreplayable-decision` structural (recordDecision always self-computes its own `decision`
  field) rather than merely tested.
  — PROHIBITIONS: recorded by id, in order; replay requires the caller's own real predicates and
  reports `ruleSetMatches` unconditionally, so a different rule set is detectable even when it
  coincidentally doesn't change the outcome.
  — INPUT_REJECTED: its own `RejectedAuditRecord`, `replayable: false`, and `replay()`'s parameter
  type refuses a `RejectedAuditRecord` at compile time.
  — SENSITIVE_DATA: never recorded by default (a structural consequence of VALUE_DISCLOSURE, not
  best-effort redaction); the stated limit is that the record alone can't prove what a disclosed
  value actually was without a separate, deliberate `discloseSignalValue` call.
  Proved `no-unreplayable-decision` as a property across 400 seeded, PRNG-generated cases
  (`__tests__/replay-property.test.ts`), covering all five outcomes, not a handful of hand-picked
  examples. Found and fixed one real fail-closed gap during self-verification: `replay()`'s first
  draft read `record.prohibitionIds`/`record.action`/`record.requirements`/`record.now` without
  defending against a hostile/tampered `record` (a Proxy that throws on every access threw
  straight out of `replay()`, and calling `replay()` on a `RejectedAuditRecord` via
  `@ts-expect-error` threw at runtime for the same reason) — fixed by wrapping every field read
  defensively, mirroring `decide()`'s own "read once, never re-read something that could throw"
  discipline, with a `recorded: RecordedDecision | null` result field so an unreadable record's
  own decision is reported as `null` rather than fabricated.
  `lib/contracts/**`, `lib/cost-model/**`, `lib/signals/**`, `lib/decide/**`, `app/**` untouched
  throughout (`git diff main` on all five stayed empty). Wrote `.genesis/decisions/0003-audit-
  model.md`.
- next_action: This iteration has not yet had an independent L4 VERIFY. Per standing guidance,
  marking a milestone done is standing-OK only after an independent APPROVE — that gate has not
  been cleared yet for M5. If approved, M6 (three domains with realistic data, `domains/**`) is
  next; it will be the first milestone to actually call `recordDecision`/`replay` against
  non-synthetic signals, which is where `discloseSignalValue`'s opt-in-only design will get its
  first real test (refund/deploy/moderation signals may carry real-shaped customer data).
- model: claude-sonnet-5
- tokens_used: ~unspecified (not tracked by this harness)
- tokens_budget: 150000
- skills_loaded: [genesis]

---

## M4 history (preserved as originally written)

- active_loop: L1 BUILD — M4 (`lib/decide/`), branch `m4-decide`, built from `main`. Not pushed;
  `main` untouched.
- target: M4 — The decision engine (`decide(action, signals)` -> exactly one of the five outcomes)
- iteration: 3 — the SECOND independent L4 VERIFY APPROVED the milestone outright, but also
  surfaced 3 further findings from iteration 2's own fixes (1 MEDIUM, 1 LOW-MEDIUM, 1 LOW). This
  iteration fixes all three on top of the approved iteration 2 state.
- last_gate: All required gates re-run for real on branch `m4-decide` after the three fixes.
  (1) `npm run typecheck` — clean, zero errors, both configs. (2) `npm test` — 27 test files,
  262 tests, all passing (was 244 at the end of iteration 2; 18 net new — 8 for FIX 1's rewritten
  framework-free matcher (13 tests, was 5), 9 for FIX 2's `matchDecision`/`isInputRejected`
  discipline (`match.test.ts` + the type-level `match-exhaustiveness.test.ts`), 1 for FIX 3's
  direct (non-crash) prohibition-ordering assertion; 0 removed or weakened). (3)
  `npm test -- decide` — selects 14 files / 103 tests, all under `lib/decide/`, genuinely narrows
  and passes (`lib/__tests__/framework-free.test.ts` correctly falls outside this filter). (4)
  `npm run build` — succeeds; route table unchanged (`/`, `/_not-found`, `/api/health`). (5)
  `git diff main -- lib/contracts lib/cost-model lib/signals app` — 0 lines; freeze boundary held
  throughout all three fixes. (6) `git status --short` — clean after each commit, no hang. (7)
  `git branch --show-current` — `m4-decide`. Never pushed; `main` and
  `.genesis/DONE.html`/`.genesis/PLAN.md` untouched. (8) The prohibition-ordering mutation
  (prohibition check moved to after `analyzeGaps`) re-run by hand before and after FIX 3 (apply
  mutation, run suite, revert both times): broke exactly 1 test before FIX 3 (the existing
  radioactive-Proxy test, which only fails incidentally — the Proxy's throw is caught by
  decide()'s own fail-closed guard and converted to `escalate`, mismatching the test's expected
  `refuse`, never a direct ordering check); breaks 2 tests after FIX 3, one of which
  (`requirementsAccessCount`/`signalsAccessCount` going from 0 to 4) is a direct ordering
  assertion using ordinary, non-throwing fixture values, not a crash.
- corrected_count: the second independent verification also measured the iteration-2
  branch-selection mutation (forcing decide.ts's saturated/insufficient ternary to one branch) as
  breaking 5 tests, not the 6 recorded in iteration 2's own last_action below — that 6 was
  repeated from the build agent's count without independently re-measuring it. Recorded here so
  the correct figure is on the record; iteration 2's text below is left as originally written
  rather than silently edited.
- last_action: Fixed the three findings from the second independent verification, one commit per
  fix on `m4-decide`:
  FIX 1 (MEDIUM) — iteration 2's own new `lib/__tests__/framework-free.test.ts` (see FIX 5 below)
  had the same class of gap it was added to close: its regex matched per LINE and required
  import/export to start that line, so a real, committed multi-line import
  (`import {\n  useState,\n  useEffect,\n} from "react";` — exactly what Prettier produces for a
  long named-import list) passed all 5 old tests. Two more evasions of the same class were
  confirmed: a template-literal dynamic import (`` import(`react`) ``) and a bare
  `require("react")`. Ordinary formatting defeated the guard, not an attack. Replaced the
  line-anchored regex with a tokenizer (`lib/__tests__/framework-free.test.ts`) that walks the
  file once, treats comments and string/template contents as opaque, and finds a specifier only
  in one of four contexts checked against the CODE immediately preceding a string: `from`,
  `import`, `import(`, `require(` — statement-position-independent by construction. Proved teeth
  by planting each of the four evasions under `lib/` in turn, watching the test fail naming the
  file and line, then removing each and watching a clean pass; kept the specifier-not-line
  discipline (fixtureAction, react-select, relative paths, node: specifiers all still resolve
  correctly), plus a new discipline the old matcher didn't need: never rescanning a string's own
  contents, so the file's own sanity-test strings containing a fake `from "react"` as data don't
  self-flag.
  FIX 2 (LOW-MEDIUM) — `decide()` returns `EvidencedDecision | InputRejected`; a `tsc --strict`
  probe compiles with zero errors for a naive call site that narrows the five real outcomes first
  and treats `input-rejected` as safe to proceed on, the opposite of fail-closed. Added a
  prominent warning to `decide()`'s own doc comment reproducing the compiling counter-example, and
  added `lib/decide/match.ts`: `matchDecision(result, handlers)` takes one REQUIRED callback per
  outcome including `inputRejected` — omitting any one is a compile error, proved in
  `__tests__/match-exhaustiveness.test.ts` via `@ts-expect-error` (confirmed live: temporarily made
  `inputRejected` optional, typecheck failed with an unused-directive error plus a real
  possibly-undefined error inside `matchDecision`, then reverted). Also added `isInputRejected()`
  as a narrower guard-clause alternative. Named each outcome's shape via new
  `Evidenced*Decision` aliases in `evidence.ts` rather than a local `Extract<EvidencedDecision,
  { outcome: "x" }>`, to avoid writing a literal `outcome: "x"` discriminant outside evidence.ts —
  which `no-outcome-without-signals.test.ts`'s structural scan (correctly) treats as a possible
  Decision-construction site.
  FIX 3 (LOW) — the existing prohibition-ordering proof only detects a DECISION-2 reorder
  incidentally (see gate 8 above): with ordinary, non-throwing inputs, moving the prohibition
  check after gap analysis produces byte-identical output, because analyzeGaps's result is never
  read once a prohibition already matched. Added a second test using a non-throwing,
  access-counting Proxy on `requirements`/`signals`, asserting both counters stay at exactly 0 when
  a prohibition matches — an ordering assertion using ordinary fixture values, no exception
  involved. Re-measured the mutation: 1 test broken before, 2 after, with the new failure being
  the counter assertion itself.
  `lib/contracts/**`, `lib/cost-model/**`, `lib/signals/**`, `app/**` untouched throughout
  (`git diff main` on all four stayed empty after every commit).
- next_action: The second independent L4 VERIFY already APPROVED this milestone; these three
  fixes are the accepted follow-ups from that approval, now applied and gated clean. Per standing
  guidance, marking a milestone done after an independent APPROVE is standing-OK without asking
  again — `.genesis/DONE.html` itself is intentionally left untouched by this iteration (out of
  scope for this session). M5 (the audit trail, `lib/audit/**`) is next: it will wrap
  `EvidencedDecision` (`lib/decide/evidence.ts`) with `{ id, recordedAt, rule }` rather than
  duplicate its evidence field, and should decide deliberately how (or whether) to represent
  `InputRejected` (FIX 1 of iteration 2, `lib/decide/decide.ts`) in the audit trail, since it is
  not a `Decision` and has no `action` to record against. `matchDecision`/`isInputRejected`
  (`lib/decide/match.ts`, this iteration's FIX 2) should be M5's preferred way to consume M4's
  output, per that file's own doc comment.
- model: claude-sonnet-5
- tokens_used: ~unspecified (not tracked by this harness)
- tokens_budget: 150000
- skills_loaded: [genesis]

---

## Iteration 2 (first independent L4 VERIFY REJECTED iteration 1) — preserved as originally written

- last_gate: All required gates re-run for real on branch `m4-decide` after the five fixes.
  (1) `npm run typecheck` — clean, zero errors, both configs. (2) `npm test` — 25 test files,
  244 tests, all passing (was 223 at the end of iteration 1; 21 net new — 6 for FIX 1's
  null/undefined/hostile-input coverage, 12 for FIX 3's mutation-hardening of aggregation and the
  cost-ceiling branch, 8 net for FIX 5's new committed framework-free test file including its
  self-check cases; 0 removed or weakened). (3) `npm test -- decide` — selects 12 files / 93
  tests, all under `lib/decide/`, genuinely narrows and passes (the new top-level
  `lib/__tests__/framework-free.test.ts` correctly falls outside this filter). (4) `npm run build`
  — succeeds; route table unchanged (`/`, `/_not-found`, `/api/health`). (5) `git diff main --
  lib/contracts lib/cost-model lib/signals app` — 0 lines; freeze boundary held throughout all
  five fixes. (6) `git status --short` — clean after each commit, no hang. (7)
  `git branch --show-current` — `m4-decide`. Never pushed; `main` and
  `.genesis/DONE.html`/`.genesis/PLAN.md` untouched. (8) Both FIX 3 mutations re-run by hand
  (apply mutation, run suite, revert): `min`->`max` in `aggregate.ts` now breaks 6 tests (was 1);
  forcing decide.ts's saturated/insufficient ternary to one branch now breaks 6 tests (was 1) —
  SEE `corrected_count` ABOVE: the second independent verification measured this one as 5, not 6.
- last_action: Fixed all five findings from the independent L4 verification that rejected
  iteration 1, one commit per fix on `m4-decide`:
  FIX 1 (CRITICAL) — `decide()`'s catch handler re-read `input.action` to build its escalate
  fallback, so `decide(null)`/`decide(undefined)`/an all-throwing `Proxy` threw straight out of
  the function, falsifying its own "never throws" comment. Fixed by reading `input.action`
  exactly once, defensively, before either try block, into a local the catch handler reuses.
  Added a new, deliberately non-Decision `InputRejected` result (`outcome: "input-rejected"`, no
  `action` field — every real Decision outcome requires one, and fabricating a placeholder would
  misrepresent what was evaluated) for when there is nothing usable to reason about at all.
  Reverted-and-reproduced both failure modes, then restored, as teeth proof.
  FIX 2 (HIGH) — `isBarSaturated`'s escalate reason claimed the bar was "unreachable ... 
  permanently," which the verification's sweep showed firing from ~$1,800 on the most forgiving
  reversibility tier, and which was never literally true at any cost (Confidence caps at 1.0,
  every bar caps below that at 0.99 — a signal at 1.0 always clears it). Chose REFRAME over
  collapse/tighten: kept the two-way escalate distinction (it remains a real, actionable fact —
  cost ceiling reached vs. headroom remaining) but rewrote the reason text
  (`unreachableBarReason` renamed `costCeilingReason`) to say only what is computed, and
  corrected ADR 0002 decision 3 in place with the sweep's actual numbers.
  FIX 3 (MEDIUM) — mutation testing (`min`->`max` in aggregation; forcing the saturated/
  insufficient branch) each broke exactly 1 of 223 tests while still producing normal-looking
  wrong decisions. Added several independent tests per mutation, including an end-to-end pair
  through `decide()` with multiple requirements for aggregation (previously missing). Both
  mutations now break 6 tests each, re-verified by hand.
  FIX 4 (LOW) — documented `aggregate.ts`'s undocumented first-occurrence tie-break, in
  precedence.ts's own voice.
  FIX 5 (process gap) — "`lib/` stays framework-free" was enforced only by a prompt-level grep,
  never committed or run in CI. Added `lib/__tests__/framework-free.test.ts`, matching on the
  actual import specifier (not the whole line) specifically to avoid the confirmed
  `fixtureAction`/"react" substring collision the old grep had. Proved teeth: added a real
  `import ... from "react"` under `lib/decide/`, watched the new test fail naming that file and
  line, removed it, watched the suite pass clean again.
  `lib/contracts/**`, `lib/cost-model/**`, `lib/signals/**`, `app/**` untouched throughout
  (`git diff main` on all four stayed empty after every commit). Updated
  `.genesis/decisions/0002-decide-engine.md` with a correction to decision 3, a note on decision
  4's tie-break and mutation-hardening, a third named failure mode for FIX 1, and a note on FIX 5.
- next_action: M4's five verification findings are fixed and gated; awaiting a fresh independent
  L4 VERIFY before this iteration can be marked done (per standing guidance: an independent
  APPROVE is required before this milestone counts as complete, even though marking a milestone
  done afterward is standing-OK — that gate has not yet been cleared for this iteration). If
  approved, M5 (the audit trail, `lib/audit/**`) is next — it will wrap this milestone's
  `EvidencedDecision` (`lib/decide/evidence.ts`) with `{ id, recordedAt, rule }` rather than
  duplicate its evidence field, and should also decide deliberately how (or whether) to represent
  FIX 1's new `InputRejected` result in the audit trail, since it is not a `Decision` and has no
  `action` to record against.
- model: claude-opus-5
- tokens_used: ~unspecified (not tracked by this harness)
- tokens_budget: 150000
- skills_loaded: [genesis]
