# CURRENT
- active_loop: L1 BUILD — M3 independently VERIFIED and APPROVED; this pass addressed the three LOW
  findings from that verification plus one overdue infrastructure item (CI), still on branch
  `m3-signals`. Per standing guidance (marking a milestone done is standing-OK after an independent L4
  APPROVE), M3 itself is DONE; this was cleanup on an already-approved milestone, not a rescope, so no
  additional approval was sought before proceeding.
- target: M3 — Signals: typed evidence with provenance (APPROVED) + its post-approval follow-ups
- iteration: 2
- last_gate: All required gates re-run for real on branch `m3-signals` after all four fixes:
  (1) `npm run typecheck` (`tsc -p tsconfig.lib.json --noEmit && tsc -p tsconfig.json --noEmit`) — clean,
  zero errors, both configs. (2) `npm test` — 12 files, 146 tests, all passing (was 141 before this
  pass; 5 net new — 2 for FIX 1's teeth-proof, 3 for FIX 2's opt-in check; 0 removed or weakened).
  (3) `npm test -- signals` — still selects and passes the signals suites, still narrows the run.
  (4) `npm run build` (`next build --webpack`) — succeeds; route table unchanged. (5)
  `git diff main -- lib/contracts lib/cost-model app` — 0 lines; freeze boundary held. (6)
  `git status --short` — empty, no hang. (7) `git branch --show-current` — `m3-signals`. Never pushed;
  never touched `main`; `.genesis/DONE.html` and `.genesis/PLAN.md` untouched. (8) FIX 1's teeth proved
  directly: reverted `gap.ts` via `git stash`, re-ran the new clock-inconsistency test against the OLD
  code, and it failed with a literal `+0` where the fixed code produces `{ kind: "clock-inconsistency"
  }` — then restored the fix and reran green. (9) `.github/workflows/ci.yml` parses as valid YAML via
  `python3 -c "import yaml; yaml.safe_load(open(...))"`.
- last_action: Four fixes from M3's independent verification (which APPROVED the milestone), each its
  own commit. FIX 1: `analyzeGaps`'s `stale` Gap was fabricating `age: 0` when every candidate signal
  was clock-inconsistent, contradicting its own doc comment's promise of the signal's *actual* age —
  the exact code/comment-contradiction class that caused three rejections on the previous project.
  Fixed by changing `Gap`'s `stale.age` field from a bare `Milliseconds` to the existing `Age` union
  (`{kind:"elapsed",ms}|{kind:"clock-inconsistency"}` from time.ts) rather than inventing a fourth Gap
  `reason` — keeps the documented "three ways a requirement can fail" invariant intact while making
  the type honest; a caller can no longer read a number off `age` without narrowing on `kind` first.
  Audited the rest of lib/signals and lib/contracts for the same fabricated-default pattern (`0`, `??`,
  `||` standing in for something unmeasured) — found none; only test-fixture defaults and one honestly-
  labelled `?? "unknown (local dev)"` in app/api/health remain. FIX 2: documented the unvalidated
  supplier-vs-requirement-nature hazard directly on `Supplier` in requirement.ts, with a concrete
  wrong-outcome example (a mislabelled compliance-sign-off requirement producing `ask` instead of
  `escalate`), and added the one honest partial mechanical check that exists —
  `checkHumanSupplierAgainstSatisfyingSignal` in the new `lib/signals/supplier-plausibility.ts` — which
  flags a `human`-supplier requirement satisfied by a bare `counterparty`-provenance self-report (the
  requirement's own "no automated signal suffices" claim self-contradicted), opt-in and NOT wired into
  `analyzeGaps`. Explicitly documented what it does not and cannot cover (the counterparty/time
  mislabelling direction; the absent-Gap case) rather than pretending broader coverage. FIX 3: confirmed
  by direct experiment (temporarily made `derived` Provenance's `inputs` optional) that this guarantee
  is compile-time-only — `npm test` stayed green at 146/146, `npm run typecheck` failed on an unused
  `@ts-expect-error`; closed by FIX 4 rather than a code change. FIX 4: added
  `.github/workflows/ci.yml` — on push to `main` and on pull requests, checks out fresh, `npm ci` only,
  asserts (via a self-excluding text scan of the workflow's own non-comment lines) that zero secrets
  are referenced, asserts vitest/vite's `rolldown` native binding survived the install (reproducing and
  guarding against the exact "Cannot find native binding" failure from npm 11.5.1's optional-dependency
  bug, confirmed reproducible locally by removing `node_modules/@rolldown/binding-darwin-arm64` and
  restoring it), then runs `npm run typecheck`, `npm test`, `npm run build`, pinned to Node 24 via
  `actions/setup-node`.
- next_action: M3 and its post-approval fixes are complete; only the Loom recording remains outstanding
  for this milestone's paperwork (per standing memory). M4 (`lib/decide/`) can proceed, consuming
  `analyzeGaps`/`Requirement`/`Supplier`/`Gap` as-is — none of M4's expected surface changed shape in
  this pass, only `Gap`'s `stale.age` field type (Milliseconds -> Age) and a new opt-in export
  (`checkHumanSupplierAgainstSatisfyingSignal`) were added. Per the "deploy early, never last" lesson
  from the previous project, CI (this pass's FIX 4) landing now rather than at the end is deliberate.
- model: claude-sonnet-5
- tokens_used: ~unspecified (not tracked by this harness)
- tokens_budget: 150000
- skills_loaded: [genesis]
