# CURRENT
- active_loop: L1 BUILD — M4 (`lib/decide/`), branch `m4-decide`, built from `main`. Not pushed;
  `main` untouched.
- target: M4 — The decision engine (`decide(action, signals)` -> exactly one of the five outcomes)
- iteration: 1
- last_gate: All required gates run for real on branch `m4-decide`. (1) `npm run typecheck`
  (`tsc -p tsconfig.lib.json --noEmit && tsc -p tsconfig.json --noEmit`) — clean, zero errors, both
  configs. (2) `npm test` — 24 test files, 223 tests, all passing (was 146 before this milestone;
  77 net new, all in `lib/decide/__tests__/`; 0 removed or weakened). (3) `npm test -- decide` —
  selects 12 files / 77 tests, all under `lib/decide/`, genuinely narrows the run and passes.
  (4) `npm run build` (`next build --webpack`) — succeeds; route table unchanged
  (`/`, `/_not-found`, `/api/health`). (5) `grep -rniE '^\s*import .*(next|react)' lib/` — no
  matches; `lib/` stays framework-free. (6) Invariant 3 grep
  (`grep -rnE '[<>]=?\s*[0-9]*\.[0-9]+|[0-9]+\.[0-9]+\s*[<>]=?' lib/decide/ --include='*.ts' |
  grep -v __tests__`) — zero hits; every confidence bar in `lib/decide/` traces to
  `requiredConfidence` (directly, or via two calls to it compared against each other in
  `stakes.ts`), never a bare literal. (7) `git diff main -- lib/contracts lib/cost-model
  lib/signals app` — 0 lines; freeze boundary held (this milestone builds only in `lib/decide/`
  plus this checkpoint and the new ADR). (8) `git status --short` — clean after this pass's
  commits, no hang. (9) `git branch --show-current` — `m4-decide`. Never pushed; `main` and
  `.genesis/DONE.html`/`.genesis/PLAN.md` untouched.
- last_action: Built `lib/decide/` — `decide(input)` maps an Action plus Requirements/Signals to
  exactly one of the five outcomes (execute/ask/defer/escalate/refuse). Nine small modules
  (prohibition, precedence, satisfaction, aggregate, stakes, reconsider, reasons, evidence,
  decide), each owning one of the six mandated design decisions (see
  `.genesis/decisions/0002-decide-engine.md` for the full argument of each):
  (1) gap precedence human > counterparty > time; (2) a `Prohibition` concept checked before any
  evidence is read, proven with a `signals` array that throws on every access; (3) escalate
  distinguishes "bar unreachable at this stake level" (cost has saturated this reversibility
  level's ceiling) from "evidence complete but insufficient today"; (4) confidence aggregates by
  `min`, with the limiting signal named explicitly in `Aggregate.limiting`; (5) `reconsiderAt`
  derived honestly from `requirement.maxAge` (never a fabricated timestamp); (6) a clock-
  inconsistent candidate for a `time`-supplied requirement escalates rather than deferring on an
  undeterminable `reconsiderAt`. Two further named failure modes beyond the six: an action with
  zero declared requirements fails closed to escalate (never a fail-open execute), and a detected
  disagreement between `analyzeGaps` and this module's own (stricter, finite-confidence-only)
  satisfaction check fails closed to escalate rather than trusting either side. All four
  context-graph.json invariants enforced structurally, not just asserted: `no-outcome-without-
  signals` via `evidence.ts` being the sole place a Decision literal is constructed (grepped);
  `missing-information-is-named-never-implied` via named fields on every ask/defer/escalate;
  `confidence-bar-is-a-function-not-a-constant` via a grep for bare fractional literals; `no-
  unreplayable-decision` via an explicit `now` argument, a grep for ambient clock/RNG calls, and a
  same-input-twice determinism test. `lib/contracts/**`, `lib/cost-model/**`, `lib/signals/**`,
  `app/**` untouched (`git diff main` on all four is empty). Wrote
  `.genesis/decisions/0002-decide-engine.md`.
- next_action: M4 built and gated; awaiting independent L4 VERIFY before it can be marked done
  (per standing guidance: an independent APPROVE is required before this milestone counts as
  complete, even though marking a milestone done afterward is standing-OK). Once approved, M5 (the
  audit trail, `lib/audit/**`) is next — it will wrap this milestone's `EvidencedDecision`
  (`lib/decide/evidence.ts`) with `{ id, recordedAt, rule }` rather than duplicate its evidence
  field, and its own replay test should call `decide()` directly on recorded inputs, reusing
  `no-unreplayable-decision`'s proof from this pass rather than re-deriving it.
- model: claude-opus-5
- tokens_used: ~unspecified (not tracked by this harness)
- tokens_budget: 150000
- skills_loaded: [genesis]
