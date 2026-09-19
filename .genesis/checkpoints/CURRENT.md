# CURRENT
- active_loop: L1 BUILD — M4 (`lib/decide/`), branch `m4-decide`, built from `main`. Not pushed;
  `main` untouched.
- target: M4 — The decision engine (`decide(action, signals)` -> exactly one of the five outcomes)
- iteration: 2 — first independent L4 VERIFY REJECTED iteration 1 (5 findings: 1 CRITICAL,
  1 HIGH, 1 MEDIUM, 1 LOW, 1 process gap). This iteration fixes all five; awaiting re-VERIFY.
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
  forcing decide.ts's saturated/insufficient ternary to one branch now breaks 6 tests (was 1).
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
