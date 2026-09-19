# CURRENT
- active_loop: M9 (deliverables — the last milestone on `.genesis/PLAN.md`), branch `m9-deliverables`,
  built from `main`. Not pushed; `main` untouched. Docs and verification only, per this milestone's own
  freeze boundary (`docs/**`, `README.md`, `.env.example`) — `git diff main -- lib tests app components`
  stayed empty throughout, confirmed after every commit.
- target: the architecture snapshot (`docs/ARCHITECTURE.md` — inputs → signals → decision → audit, and
  what each stage refuses, every refusal checked against a real test before being written down), the
  two-year thesis (`docs/THESIS.md` — a pre-written draft, verified against the code rather than accepted
  on its word: its calibrated-confidence claim was checked directly against
  `tests/failures/part1-deliberate-failure.test.ts` and holds — "no stake is high enough to stop a signal
  that claims 0.99" is exactly what that test proves, not just what the thesis asserts), a full README
  rewrite for a judge arriving cold (the previous README did not exist in this repository's git history at
  all — see Anomalies in the M9 final report — so this is a first write, not a rewrite, despite the
  milestone's own framing assuming one), `docs/NOTES.md` (AI tools, key decisions, deliberate scope, and
  an honest count of the verification process's actual rejections — one formal reject, not the three this
  milestone's own instructions assumed before the record was checked), `docs/WALKTHROUGH.md` (a 90-second
  script built around the deployed page's real stakes-explorer widget), and the clean-clone verification
  run for real against both `main` and this branch's tree.
- fact-check finding worth flagging on its own: the D1/D7 contrast this milestone was told to lead the
  README with — framed as "an 800-line change ships, a one-line change escalates" — does not match
  `lib/domains/code-deploy/domain.ts`'s actual fixture data. Both D1 and D7 are 1 line / 1 file / 2
  approvals; `deployAction(800, ...)` is D1's **dollar** cost-of-being-wrong ($800), not a line count. The
  file's own header comment calls D1 "an 800-line-budget... feature-flag toggle" — "line-budget" reads
  easily as "800 lines" on a skim, but the params two lines below it say `linesChanged: 1`. The README
  states the corrected, and honestly sharper, version: same diff size, same evidence, wildly different
  declared stakes ($800 vs. $250,000) — the point survives the correction undamaged, and is stronger for
  not requiring two different-sized diffs to make it.
- engine_gaps found: none requiring a change to the frozen engine or app — this milestone touches no code;
  `lib/**`, `tests/**`, `app/**`, `components/**` are all genuinely untouched.
- last_gate: (1) `npm run typecheck` — clean, zero errors, both configs. (2) `npm test` — 58 test files,
  541 tests, all passing, unchanged from the M8 baseline (a docs-only milestone changes no test count).
  (3) `npm run build` — succeeds; route table unchanged. (4) `npm run demo:domains` — 23/23 cases pass,
  exit 0. (5) Clean-clone verification run for real, twice: once against `main` (clones through the M8
  merge; typecheck and 541/541 tests pass) and once against this branch's tree (fetched from the local
  `m9-deliverables` branch into a second clean clone; same result) — `main` does not yet include this
  branch's docs, which is expected and stated plainly rather than glossed over. (6) `git diff main --
  lib tests app components` — 0 lines; freeze boundary held. (7) `git status --short` — clean after each
  commit. (8) `git branch --show-current` — `m9-deliverables`. Never pushed; `main`,
  `.genesis/DONE.html`, and `.genesis/PLAN.md` untouched throughout. (9) Every link in `README.md` and
  `docs/*.md` checked by hand against the filesystem — all resolve.
- last_action: five commits on `m9-deliverables`: (1) `docs/ARCHITECTURE.md`, (2) `docs/THESIS.md`
  (the pre-written draft, unchanged in wording — verified, not edited, since its claims held), (3)
  `README.md` (new — see the anomaly note above), (4) `docs/NOTES.md`, (5) `docs/WALKTHROUGH.md`, plus
  this checkpoint update.
- next_action: awaiting an independent L4 VERIFY on `m9-deliverables`. M9 is the last milestone on
  `.genesis/PLAN.md`; per this project's own honesty requirement, M2 and M8 remain `todo` in
  `.genesis/DONE.html` (both need an actual Vercel deployment, a human step that has not happened) and
  nothing in this milestone's docs claims otherwise — `app/milestones.test.ts`'s drift guard continues to
  enforce that agreement mechanically.
- model: claude-sonnet-5
- tokens_used: ~unspecified (not tracked by this harness)
- tokens_budget: 150000 (M9's stated budget)
- skills_loaded: []

---

## M8 follow-up fixes checkpoint (preserved as originally written)

- active_loop: M8 follow-up fixes (four fixes from M8's independent verification, which APPROVED the
  milestone), branch `m8-demo-ui`, built on top of the already-approved M8 state. Not pushed; `main`
  untouched.
- target: FIX 1 [MEDIUM] — at 320-400px, `.decision-card__action` (the domain/type label) was
  truncated to one or two characters and silently clipped: `.decision-card__header` is a flex row with
  no wrap, and the action label had no `min-width: 0`, so it refused to shrink and overflowed the
  card/page/viewport invisibly — `body.scrollWidth` was 523px against a 320px viewport, hidden only
  because `app/globals.css`'s `html, body` rule blanket-set `overflow-x: hidden`. The verification's
  framing: that satisfies the letter of "no horizontal scroll" while failing its spirit — real content
  lost, not scrollable-to — and a blanket rule masking a layout bug is worse than the scrollbar it
  hides, because the bug becomes invisible instead of obvious. Fixed the real cause (`min-width: 0` +
  `text-overflow: ellipsis` on `.decision-card__action`, `flex-shrink: 0` on the outcome badge so it
  never gives up its width instead), then removed the blanket `overflow-x: hidden` — which surfaced
  more of the same species of bug elsewhere in the card (audit-trail metadata, requirement rows, the
  missing-info detail line: long unbreakable tokens pushing past `minmax(0, ...)` grid cells at narrow
  widths). Fixed those too with one inherited `overflow-wrap: anywhere` on `.decision-card`, rather
  than restoring the blanket suppression. Verified `body.scrollWidth === clientWidth` at 320/400/768px
  after the fix, in both `next dev` and `next build && next start`.
  FIX 2 [LOW] — the reversibility control (`StakesExplorer.tsx`) used `role="radiogroup"`/`role="radio"`
  without the roving-tabindex arrow-key pattern those roles imply; Tab+Enter/Space worked (native
  <button> semantics) but Left/Right did nothing. Implemented the expected behaviour (roving tabindex:
  only the checked segment is a Tab stop; Left/Right/Up/Down move focus and change the selection,
  wrapping at the ends; Home/End jump to first/last) rather than downgrading the roles to match a
  lesser behaviour. Verified by dispatching real keydown events in a live browser session.
  FIX 3 [LOW] — with D1's stakes dialed into the interactive widget, the card kept D7's own case title
  verbatim ("HARD CASE — one line changed, disables fraud checks on checkout") appended with D1's
  cost/reversibility — reading, on a quick skim, as if D1's $800/reversible action disabled a fraud
  check. The design (replaying identical evidence at different stakes) was right; only the label was
  wrong, and it needed to carry the disambiguation itself rather than depend on the note paragraph
  above it. Replaced the title with "Same evidence (PR #5402, deploy-d7) at {preset}'s stakes: {cost},
  {reversibility}", falling back to "these stakes" when the slider sits off both presets. Highest-value
  fix of the four — removes the one confusion a judge is likely to hit inside 90 seconds.
  FIX 4 — the demo understated something genuinely striking: a full decision engine, with its audit
  trail, re-running in the viewer's own browser on every slider tick, no network round-trip — mentioned
  only in `StakesExplorer.tsx`'s own header comment, invisible to a viewer. Added one factual,
  non-boastful line next to the interactive controls, where the absence of a request is the observable
  fact: "Every drag re-runs the full decision engine — outcome, confidence, and audit trail — right
  here in this tab, not on a server: open your browser's Network tab and drag; nothing fires." A
  skeptic can verify it immediately in devtools.
- engine_gaps found: none requiring a change to the frozen engine (`lib/**`/`tests/**` genuinely
  untouched — `git diff main -- lib tests` stayed empty throughout).
- last_gate: (1) `npm run typecheck` — clean, zero errors, both configs. (2) `npm test` — 58 test files,
  541 tests, all passing, unchanged from the base M8 baseline (this round is `app/globals.css`/
  `components/StakesExplorer.tsx` only; no `lib/`/`tests/` change means no test count change);
  `app/milestones.test.ts` passes (2/2). (3) `npm run build` — succeeds; route table unchanged (`/`,
  `/_not-found`, `/api/health`). (4) `npm run dev` + `curl -s localhost:3000/` — all five outcome
  classes and all four escalate labels ("Escalate — human sign-off", "Escalate — evidence says no",
  "Escalate — stakes at ceiling", "Escalate — needs better evidence") still render at rest, verbatim.
  (5) `body.scrollWidth` vs `clientWidth`, verified live in a browser: BEFORE the fix, 320px → 523 vs
  320 (overflow); AFTER, 320px → 320 vs 320, 400px → 400 vs 400, 768px → 768 vs 768 (zero overflow at
  all three), confirmed in both `next dev` and a production `next build && next start`. (6)
  `grep -rn 'missing\.reason' app/ components/` — no matches. (7) `grep -rl 'node:util'
  .next/static/chunks/` — no matches, after a fresh `npm run build`. (8) `git diff main -- lib tests` —
  0 lines; freeze boundary held. (9) `git status --short` — clean (`next-env.d.ts` is gitignored, not a
  tracked file, so no restore step was needed). (10) `git branch --show-current` — `m8-demo-ui`. Never
  pushed; `main` untouched; `.genesis/DONE.html`/`.genesis/PLAN.md` untouched.
- last_action: four commits, one per fix, on `m8-demo-ui`: (1) FIX 1 — `app/globals.css` (`min-width:
  0`/ellipsis on `.decision-card__action`, `flex-shrink: 0` on the header's badge, `overflow-wrap:
  anywhere` on `.decision-card`, removal of the blanket `overflow-x: hidden`); (2) FIX 2 — roving
  tabindex and arrow-key handling in `components/StakesExplorer.tsx`; (3) FIX 3 — the disambiguated
  card title in the same file (split from FIX 2 by reconstructing the intermediate file state so each
  commit's diff is exactly one fix); (4) FIX 4 — the one-line in-browser-computation note, same file.
- next_action: awaiting an independent L4 VERIFY on these four follow-ups. Per standing guidance,
  marking M8 done is standing-OK once an independent APPROVE lands (it already has, for the base
  milestone); a fresh APPROVE on these four follow-ups is what's pending now. If approved: M9
  (deliverables — architecture snapshot, two-year thesis, `.env.example`, clean-clone verification) is
  the last milestone on `.genesis/PLAN.md`.
- model: claude-sonnet-5
- tokens_used: ~unspecified (not tracked by this harness)
- tokens_budget: unspecified for this follow-up (not one of the original 9 milestones)
- skills_loaded: []

---

## M8 checkpoint, base milestone (preserved as originally written)

- active_loop: L1 BUILD — M8 (the demo UI), branch `m8-demo-ui`, built from `main`. Not pushed;
  `main` untouched. Awaiting L4 VERIFY.
- target: M8 — make a decision legible in 90 seconds, carrying forward BOTH requirements M6's and
  M7's independent verifications added to this row: (a) at least four visually/textually distinct
  `escalate` renderings, branched on `RuleTrace.kind`/`cleared`/`saturated`, never on `missing.reason`
  prose; (b) any `Requirement` built from request data must go through `parseValueConstraint`.
- architecture decision (verified, not assumed): grepped `lib/` for `from "node:` outside `__tests__/`
  and found exactly one hit — `lib/audit/replay.ts`'s `isDeepStrictEqual` from `node:util`. Every other
  file `decide()` touches (`lib/contracts`, `lib/cost-model`, `lib/signals`, `lib/decide`, `lib/domains`,
  and `lib/audit/record.ts`/`rule.ts`/`snapshot.ts`) is genuinely isomorphic. Chose to run `decide()` AND
  `recordDecision()` (the full audit record — rule trace, requirements, evidence snapshots) CLIENT-SIDE,
  in `components/StakesExplorer.tsx` (a "use client" component importing `lib/audit/record.js` directly,
  never `lib/audit/index.js`/`replay.js`, so `node:util` never reaches the client bundle — confirmed by
  grepping the built `.next/static/chunks/` for `node:util` after `npm run build`: zero matches). A
  viewer drags a cost slider and watches the SAME evidence (deploy-d7's real requirements/signals) flip
  between `execute` and `escalate` instantly, no network round-trip. Only `replay()` — which needs
  `node:util` to actually PROVE a record reproduces via `decide()`, not just assert it — runs server-side,
  in the plain Server Components `components/EscalateGallery.tsx`/`components/OutcomeStrip.tsx` and
  `app/page.tsx`. Reimplementing `isDeepStrictEqual` client-side to avoid that one server check was
  considered and rejected: it would duplicate frozen, already-audited logic outside `lib/` for a cosmetic
  win.
- page structure: (1) a `StakesExplorer` widget, server-rendered at deploy-d7's real stakes ($250,000,
  irreversible → escalate/insufficient-now) so a decision is visible on load with no JS, then
  interactive — two presets (deploy-d1/deploy-d7) plus a continuous cost slider and a 4-way reversibility
  control, requirements/signals held constant, only the action's stakes moving; (2) a 4-card gallery, one
  real domain case per escalate cause (deploy-d5=human, refund-r4=value-rejected, deploy-d8=cost-ceiling,
  moderation-m7=insufficient-now), each with a server-verified replay badge; (3) a 4-card strip, one real
  case per non-escalate outcome (moderation-m1=execute, refund-r2=ask, deploy-d3=defer,
  moderation-m6=refuse). Every number renders from a real `DecisionAuditRecord`; no fixture, cost, or
  confidence is hand-typed into the page.
- requirement-construction mandate (FIX 3, M7's row): satisfied by NEVER constructing a `Requirement`
  from request data at all, stated explicitly in `StakesExplorer.tsx`'s header comment. The widget's only
  two viewer-controlled inputs (cost, reversibility) become `Action` fields, each validated by its own
  real parser (`parseCostOfBeingWrong`; reversibility is restricted to `REVERSIBILITY_LEVELS` by the
  control itself) — `requirements` is always `baseCase.requirements`, copied verbatim from the frozen
  `lib/domains/code-deploy` fixture. `parseValueConstraint` has nothing to validate on this path because
  no `Requirement` is ever hand-built here.
- engine_gaps found: none requiring a change to the frozen engine (`lib/**`/`tests/**` genuinely
  untouched — `git diff main -- lib tests` stayed empty throughout).
- last_gate: (1) `npm run typecheck` — clean, zero errors, both configs. (2) `npm test` — 58 test files,
  541 tests, all passing, unchanged from the M7 follow-up baseline (M8 is `app/`/`components/` only; no
  `lib/`/`tests/` change means no test count change). (3) `npm run build` — succeeds; route table
  unchanged (`/`, `/_not-found`, `/api/health`); `/` prerenders as static content. (4) `npm run dev` +
  `curl -s localhost:3000/api/health` — 200, `costModel.pass: true`. `curl -s localhost:3000/` piped
  through grep for outcome words — all five present at rest (12 execute/18 ask/13 defer/35 escalate/14
  refuse token occurrences across labels+prose), and all four escalate labels ("Escalate — human
  sign-off", "Escalate — evidence says no", "Escalate — stakes at ceiling", "Escalate — needs better
  evidence") present verbatim. (5) Verified interactively in a real browser (both dark and light
  `prefers-color-scheme`, and at a 400px viewport with zero horizontal scroll): clicking the deploy-d1
  preset flips the visible outcome from "Escalate — needs better evidence" to "Execute" instantly, with
  zero console errors (no hydration mismatch between the server-rendered default state and the client
  component). (6) `npm run demo:domains` — 23/23 cases pass, exit 0, unchanged. (7) `git diff main --
  lib tests` — 0 lines; freeze boundary held. (8) `grep -rn 'missing\.reason' app/ components/` — no
  matches (two explanatory comments that named the pattern in prose were reworded to avoid the literal
  substring, same discipline M6's/M7's own checkpoints already used for `lib/domains/`/`scripts/`). (9)
  `git status --short` — clean after each commit, no hang. (10) `git branch --show-current` —
  `m8-demo-ui`.
- last_action: four commits on `m8-demo-ui`: (1) design tokens (`app/globals.css`) and the shared,
  framework-free rendering layer (`components/decision-helpers.ts`, `icons.tsx`, `OutcomeBadge.tsx`,
  `ConfidenceMeter.tsx`, `EvidenceList.tsx`, `MissingInfoPanel.tsx`, `AuditTrail.tsx`, `DecisionCard.tsx`),
  (2) the client-side interactive stakes explorer (`components/StakesExplorer.tsx`), (3) the two
  server-rendered, replay-verified galleries (`components/EscalateGallery.tsx`, `OutcomeStrip.tsx`), (4)
  the rebuilt page and layout (`app/page.tsx`, `app/layout.tsx`).
- next_action: awaiting an independent L4 VERIFY on `m8-demo-ui`. If approved: M9 (deliverables —
  architecture snapshot, two-year thesis, `.env.example`, clean-clone verification) is the last milestone
  on `.genesis/PLAN.md`.
- model: claude-opus-5 (per this milestone's commit-attribution instruction)
- tokens_used: ~unspecified (not tracked by this harness)
- tokens_budget: 150000 (M8's stated budget)
- skills_loaded: []

---

## M7 follow-up fixes checkpoint (preserved as originally written)

- active_loop: M7 follow-up fixes (four fixes from M7's independent verification, which APPROVED the
  milestone outright), branch `m7-failures`, built on top of the already-approved M7 state. Not pushed;
  `main` untouched.
- target: FIX 1 [LOW] — the deliberate failure test's own ceiling claim understated itself: it used the
  project's $50,000 worked example as if it were the boundary, but `requiredConfidence` clamps to
  `MAX_BAR = 0.99` at every reversibility level, for every cost — the verification proved this concretely
  at $5,000,000, still `execute`. Added a test proving the $5,000,000 case directly (bar clamps to
  `MAX_BAR`, decide() still executes on the identical fabricated signal) and revised
  `tests/failures/part1-deliberate-failure.test.ts`'s header prose so $50,000 reads as illustrative — the
  project's own headline (reversibility, cost) pair — rather than as the boundary of what breaks. The
  honest restatement: no stake is high enough to stop a signal that claims 0.99.
  FIX 2 [LOW] — Part One's framing centered the gap on a `counterparty` self-report, but the verification
  showed the identical blindness applies to `human`-sourced signals: a hand-built signal merely claiming
  `Provenance.kind: "human"`, with no actual reviewer behind it, satisfies a human-supplier `Requirement`
  for a $1,000,000 irreversible action exactly as a genuine review would — a materially worse statement,
  since the original framing could lead a reader to conclude "require a human source and you are safe."
  Added a test proving the symmetry (fabricated human-sourced signal executes the transfer; swapping the
  fabricated name for a different fake one changes nothing) plus a test showing the one opt-in mechanical
  check this project ships (`checkHumanSupplierAgainstSatisfyingSignal`) returns `null` for this case — it
  only catches the mirror-image combination. Checked (not assumed) that `system` and `derived` provenance
  carry the identical shape — plain, unverified strings, nothing anywhere checks them against a real
  system or derivation — and stated the general rule once in the file's header rather than enumerating
  cases: `Provenance` is recorded metadata, not an authenticated claim.
  FIX 3 — `MAX_IN_VALUES` (`lib/signals/validation.ts`) caps `in.values.length` only inside
  `parseValueConstraint`; `decide()` called directly, or a hand-built `Requirement`, accepts an unbounded
  allow-list (verified with 100,000 entries), confirmed not currently reachable since nothing under
  `app/` calls `decide()` and every domain builds `Requirement`s in code. M8 is the milestone that makes
  this live, the moment its UI constructs a `Requirement` from request data. Added a requirement to M8's
  row in `.genesis/PLAN.md` (the one exception to the PLAN.md freeze this round, alongside the existing
  four-escalate-renderings requirement): any `Requirement` M8 builds from request data must go through
  `parseValueConstraint` (or equivalent validation), never be constructed directly. Provenance (M7's
  verification) recorded in the row. `.genesis/DONE.html` left untouched.
  FIX 4 [informational] — defect 2's header comment and original commit message called it a plain
  "(real defect)", while defects 7 and 9 carry an explicit "HONEST, PARTIAL PIN" qualifier, even though
  defect 2's own docstring already says it does not re-prove the original fix (the frozen
  `brand-casts.test.ts` source-scan) and instead verifies a different, downstream thing (fail-closed
  behavior once the brand is bypassed) — the same shape of honest gap 7 and 9 already name for
  themselves. Resolved by qualifying defect 2 as "HONEST, PARTIAL PIN" too, with a new paragraph
  explaining why explicitly, so all three defects use one honesty standard instead of two. No test
  assertions changed.
- engine_gaps found: none requiring a change to the frozen engine (`lib/**`, `app/**` genuinely
  untouched — `git diff main -- lib app` stayed empty throughout, both before and after all four fixes).
- last_gate: (1) `npm run typecheck` — clean, zero errors, both configs. (2) `npm test` — 58 test files,
  541 tests, all passing (was 538 at the start of this round; 3 net new — FIX 1's extreme-cost test, FIX
  2's two symmetry tests; 0 removed or weakened). (3) `npm test -- failures` — selects 11 files / 63
  tests (was 60), genuinely narrows and passes. (4) `npm run demo:domains` — 23/23 cases pass, exit 0,
  unchanged. (5) `npm run build` — succeeds; route table unchanged (`/`, `/_not-found`, `/api/health`).
  (6) `git diff main -- lib app` — 0 lines; freeze boundary held. (7) `git status --short` — clean after
  each commit. (8) `git branch --show-current` — `m7-failures`. Never pushed; `main` and
  `.genesis/DONE.html` untouched throughout; `.genesis/PLAN.md` touched deliberately, per FIX 3's stated
  exception only.
- last_action: four commits, one per fix, on `m7-failures`: (1) FIX 1's extreme-cost test and header
  prose revision in `tests/failures/part1-deliberate-failure.test.ts`, (2) FIX 2's symmetry tests and
  general-rule prose in the same file (a separate commit, split from FIX 1 by reconstructing the
  intermediate file state so each commit's diff is exactly one fix), (3) FIX 3's `.genesis/PLAN.md` M8
  row addition, (4) FIX 4's relabelling of `tests/failures/part2-defect2-brand-cast-bypass.test.ts`.
- next_action: awaiting the next independent L4 VERIFY on these four follow-ups. Per standing guidance,
  marking M7 done is standing-OK once an independent APPROVE lands (it already has, for the base
  milestone); a fresh APPROVE on these four follow-ups is what's pending now. If approved: M8 (the demo
  UI) is next on `.genesis/PLAN.md`, now carrying forward BOTH the four-escalate-renderings requirement
  (from M6's verification) AND FIX 3's validated-Requirement-construction requirement (from M7's
  verification) in its row.
- model: claude-opus-5
- tokens_used: ~unspecified (not tracked by this harness)
- tokens_budget: unspecified for this follow-up (not one of the original 9 milestones)
- skills_loaded: []

---

## M7 checkpoint, base milestone (preserved as originally written)

- active_loop: M7 (the failure suite), branch `m7-failures`, built from `main`. Not pushed; `main`
  untouched.
- target: `tests/failures/**` — three parts. PART ONE, the brief's required deliberate-failure test:
  "confidence that lies" — an irreversible $50,000 action executes on a single `counterparty`
  self-report at confidence 0.99, matching `requiredConfidence("irreversible", 50000) ≈ 0.978`'s own
  documented worked example. Chosen because this project's own source comments
  (`lib/decide/stakes.ts`'s `isBarSaturated` doc, `lib/signals/provenance.ts`) already name this exact
  gap — nothing in `requiredConfidence`/`aggregateConfidence`/`isBarSaturated` ever reads a signal's
  `Provenance.kind`, only its bare confidence number — and deliberately decline to close it, which
  makes it a property of the mechanism itself rather than an author mistake the engine could be argued
  to have no duty to catch. Demonstrated concretely (decide() executes), then the audit trail's honest
  account: the provenance kind survives verbatim in the record (a human COULD reconstruct the problem),
  replay reproduces the wrong answer exactly (reproducibility is not correctness), and nothing anywhere
  in `lib/decide`/`lib/audit` discounts a `counterparty`-sourced signal differently from a `human`- or
  `system`-sourced one — proven directly by running the identical scenario through both source kinds and
  observing an identical decision.
  PART TWO — all nine real historical defects turned into permanent regressions, each labelled by
  milestone in its own file under `tests/failures/`: (1) M1 parseAction/parseDecision hostile-getter/
  Proxy throw — pinned directly. (2) M1 CostOfBeingWrong brand cast bypass — the actual fix
  (`lib/contracts/__tests__/brand-casts.test.ts`) is frozen and out of scope to duplicate; this test
  answers the honest, different question of what happens once the brand IS bypassed (requiredConfidence
  produces a non-finite/out-of-range bar, which parseConfidence then rejects — decide() still fails
  closed). (3) M3 stale-gap fabricated `age: 0` — pinned via a real, reachable clock inconsistency
  (signal validated against one clock, judged against an earlier one). (4) M4 CRITICAL decide(null)
  throwing from inside its own catch — pinned directly against null/undefined/hostile-Proxy/missing-
  action inputs. (5) M4 unreachable-escalate overclaim — pinned as behavior (confidence 1.0 always
  clears a saturated bar, at every reversibility level) plus a wording check on the corrected reason
  text. (6) M4 framework-free guard defeated by a Prettier-wrapped import — the fix lives in frozen
  `lib/__tests__/framework-free.test.ts`, already part of the baseline; this test corroborates without
  duplicating (confirms the tokenizer shape shipped, confirms as data-only that a naive line-anchored
  matcher genuinely misses the three historical evasions). (7) M5 five assertions passing for the wrong
  reason — HONEST PARTIAL PIN: the defect is about specific frozen test files' own text, unreachable
  without touching them; this test instead verifies the underlying behavioral property (structural,
  mutation-resistant: exact SignalSnapshot key set, no `value` key, no function-valued property) via the
  public API alone. (8) value-constraints metadata-only replay flipping a recorded `ask` into `escalate`
  — pinned end-to-end with two independent requirements, both without and with `knownSignals`. (9) M6 D7's
  reversibility rationale that would have collapsed a level — HONEST PARTIAL PIN: the rationale is a
  human-facing string no runtime path reads, so no behavioral test can pin the argument's soundness;
  this test guards against the specific retracted argument shape reappearing.
  PART THREE — new attacks, every attempt reported including the ones that found nothing: saturation-
  point boundary (binary-searched, not hardcoded); multiple signals of differing freshness/confidence for
  one requirement; a record replayed after requirements "changed underneath it" (held structurally —
  replay() has no code path that reads live requirements at all); constraint values `-0`/
  `Number.MAX_SAFE_INTEGER`/empty string; a prohibition and a value rejection on the same action
  (prohibition wins, gap analysis never runs); scale (many requirements, 10,000 signals); one signal-kind
  satisfying one requirement's constraint while violating a contradictory sibling's; the wall clock
  jumping backwards between recordDecision and replay (held structurally — replay() never reads
  Date.now()); PLAN.md's own named minimum cases (zero signals, zero requirements, all-stale, directly
  conflicting signals, an impossible >1 confidence signal). Two honest FINDINGS reported, not fixed: an
  out-of-range confidence signal that is NOT the limiting one still gets recorded verbatim in the audit
  trail (extends signal.ts's own documented KNOWN LIMIT one layer further than its disclaimer states);
  `MAX_IN_VALUES` caps the JSON/audit-boundary parser only, not `evaluateConstraint`/`decide()` itself —
  a caller building a `Requirement` directly can hand `decide()` an unbounded allow-list. Neither is a
  stop-the-line defect.
- engine_gaps found: none requiring a change to the frozen engine (`lib/**`, `app/**` genuinely
  untouched — `git diff main -- lib app` stayed empty throughout). The two Part Three findings above are
  reported, not patched, per M7's own instruction to stop and report rather than fix.
- last_gate: (1) `npm run typecheck` — clean, zero errors, both configs (tests/**/*.ts added to
  `tsconfig.lib.json`'s include so the new suite is actually typechecked, not silently skipped). (2)
  `npm test` — 58 test files, 538 tests, all passing (was 478 at the start of this milestone; 60 net
  new, 0 removed or weakened). (3) `npm test -- failures` — selects 11 files / 60 tests, all under
  `tests/failures/`, genuinely narrows and passes. (4) `npm run demo:domains` — 23/23 cases pass, exit
  0, unchanged. (5) `npm run build` — succeeds; route table unchanged (`/`, `/_not-found`,
  `/api/health`). (6) `git diff main -- lib app` — 0 lines; freeze boundary held. (7)
  `git status --short` — clean after each commit, no hang. (8) `git branch --show-current` —
  `m7-failures`. Never pushed; `main` and `.genesis/DONE.html`/`.genesis/PLAN.md` untouched.
- last_action: thirteen commits on `m7-failures`: (1) wire `tests/failures/**` into `vitest.config.ts`
  and `tsconfig.lib.json` (both purely additive, same precedent as package.json's own
  freeze_boundary_notes), (2) shared fixture helpers independent of lib/'s own test infra, (3) Part One
  (confidence that lies), (4)-(12) one commit per historical defect (M1 x2, M3, M4 x3, M5, value-
  constraints, M6), (13) Part Three's new attacks.
- next_action: awaiting the next independent L4 VERIFY on `m7-failures`. If approved: M8 (the demo UI)
  is next on `.genesis/PLAN.md`, carrying forward the four-distinct-escalate-explanations requirement
  M6's verification already added to that row.
- model: claude-opus-5
- tokens_used: ~unspecified (not tracked by this harness)
- tokens_budget: 150000 (M7's stated budget)
- skills_loaded: []

---

## M6 follow-up fixes checkpoint (preserved as originally written)

- active_loop: M6 follow-up fixes (five fixes plus one plan change from M6's independent verification,
  which APPROVED the milestone outright), branch `m6-domains`, built on top of the already-approved M6
  state. Not pushed; `main` untouched.
- target: FIX 1 [MEDIUM] — the file header and D1's own narrative in `lib/domains/code-deploy/domain.ts`
  described D1 as clearing its bar on "90%-confidence" evidence; D1's actual decisive confidence is 95%
  (review approvals + CI). The 90% belongs to a `deploy.staticAnalysis.confidence` signal D1 captures but
  has no Requirement for, so `decide()` never reads it for D1 — inert. Corrected the header and D1's
  narrative to say what actually decided the case, and chose KEEP for the inert signal itself (a real
  system genuinely carrying evidence no policy consumes is worth demonstrating honestly), stated
  explicitly in three places (header, D1's narrative, and inline comments on D1's requirements array and
  the signal itself). Swept code-deploy's other cases and content-moderation/refund-approval for the same
  shape — found none: D7's own `deploy.staticAnalysis.confidence` signal looks similar at a glance but IS
  consumed there (D7 has a matching Requirement); every other case's captured signals all have matching
  Requirements or are legitimately absent (ask/defer/escalate-human cases).
  FIX 2 [MEDIUM] — D7's reversibility rationale said reverting "stops new damage, but does not undo
  transactions already cleared," a claim equally true of every reversible-with-cost action in this
  codebase (a reverted refund also only stops future harm), which would collapse the level if taken at
  face value. Rewrote it to turn on the real distinguishing fact — whether a recovery path exists against
  a reachable counterparty (a refund's recipient is a known, contactable customer; a cleared fraudulent
  transaction's recipient is not) — matching the ADR's own "money sent to a third party" irreversible
  example. Re-checked every other `irreversible` assignment in all three domains against this test: D6
  (force-push), M6 (legal takedown), and M7 (permanent ban) all argue a flat "no undo exists," never the
  "stops future harm only" shape that motivated this fix — all three still hold. refund-approval has no
  irreversible cases at all.
  FIX 3 [LOW] — content-moderation's M6 (legal takedown, a refuse case where the prohibition fires before
  reversibility is ever read) lacked the same "this label is inert to the outcome" disclaimer R6 and D6
  both already carry. Added it, naming R6 and D6 explicitly.
  FIX 4 [LOW] — `scripts/demo-domains.ts` always passed `knownSignals` to `replay()`, so the demo never
  showed ADR-0004's own documented limitation (a metadata-only replay of a satisfied value constraint can
  manufacture a `constraint-violated` Gap and flip the outcome). For `refund-r1-clean-approval` (the same
  case `lib/domains/__tests__/replay-limitation.test.ts` uses), the demo now prints BOTH replays — with
  and without `knownSignals` — labeled plainly. Only the WITH-knownSignals result feeds the pass/fail
  check and exit code, so the demonstrated mismatch is expected and doesn't fail the run.
  FIX 5 [LOW] — `.genesis/context-graph.json`'s `freeze_boundary` listed `package.json` as frozen, yet M6
  (like presumably every milestone shipping a runnable demo) added one new npm script — purely additive,
  non-behavioural. Added `freeze_boundary_notes["package.json"]` stating precisely what's actually
  protected (dependencies, and existing scripts' behavior) versus what isn't (adding a new script).
  FIX 6 — M6's verification sharpened an earlier finding: `escalate` has four mechanically distinct causes
  at the `RuleTrace` layer (`human`, `value-rejected`, `cost-ceiling`, `insufficient-now`) that
  `Decision.outcome` collapses to one string, and nothing currently forces a future demo UI to
  distinguish them — a bare "Escalated" label would defeat M8's own 90-second legibility bar. Added a
  requirement to M8's row in `.genesis/PLAN.md` (the one exception to the PLAN.md freeze this round):
  the demo UI must render at least four visually/textually distinct escalate explanations, branching on
  `RuleTrace.kind` plus `cleared`/`saturated`, never on `missing.reason` prose. Provenance (M6's
  verification) noted directly in the row. `.genesis/DONE.html` left untouched.
- engine_gaps found: none. All six items are domain-data/docs fixes; `lib/contracts`, `lib/cost-model`,
  `lib/signals`, `lib/decide`, `lib/audit`, and `app` remain genuinely untouched (zero diff from `main`).
- last_gate: (1) `npm run typecheck` — clean, zero errors, both configs. (2) `npm test` — 47 test files,
  478 tests, all passing (unchanged from the approved M6 baseline — this round is text/wiring fixes, no
  new test coverage was required or added). (3) `npm run demo:domains` — 23/23 cases pass, exit 0, and
  now shows the ADR-0004 replay-limitation line for refund-r1-clean-approval ("audit replay (metadata
  only, no known signals): MISMATCH (expected)"). (4) `npm run build` — succeeds; route table unchanged
  (`/`, `/_not-found`, `/api/health`). (5) `git diff main -- lib/contracts lib/cost-model lib/signals
  lib/decide lib/audit app` — 0 lines; freeze boundary held. (6) `grep -rn "missing\.reason" lib/domains/
  scripts/` — no matches. (7) `git status --short` — clean after each commit. (8)
  `git branch --show-current` — `m6-domains`. Never pushed; `main` and `.genesis/DONE.html` untouched
  throughout; `.genesis/PLAN.md` and `.genesis/context-graph.json` touched deliberately, per this round's
  stated exception for FIX 5/FIX 6 only.
- last_action: six commits, one per fix, on `m6-domains`: (1) header/D1 narrative + inline comments,
  (2) D7 rationale rewrite, (3) M6 disclaimer, (4) demo script's dual replay, (5) context-graph.json
  freeze_boundary_notes, (6) PLAN.md's M8 row addition.
- next_action: awaiting the next independent L4 VERIFY on `m6-domains`. Per standing guidance, marking
  M6 done is standing-OK once an independent APPROVE lands (it already has, for the base milestone); a
  fresh APPROVE on these six follow-ups is what's pending now. If approved: M7 (the failure suite,
  `tests/failures/**`) is the next milestone on `.genesis/PLAN.md`, unchanged by this round except for
  FIX 6's addition to M8's row.
- model: claude-sonnet-5
- tokens_used: ~unspecified (not tracked by this harness)
- tokens_budget: 150000 (M6's stated budget)
- skills_loaded: []

---

## M6 checkpoint, base milestone (preserved as originally written)

- active_loop: M6 (three domains with realistic data), branch `m6-domains`, built from `main`. Not
  pushed; `main` untouched. Awaiting L4 VERIFY.
- target: build refund-approval, code-deploy, and content-moderation on the frozen engine
  (`lib/contracts`, `lib/cost-model`, `lib/signals`, `lib/decide`, `lib/audit` — zero diff from `main`),
  contributing only `lib/domains/**` data (Actions, Requirements, Prohibitions, Signals) plus
  `scripts/demo-domains.ts` — no domain-specific outcome logic anywhere. 23 realistic cases (8 refund, 8
  deploy, 7 moderation) exercise, between the three domains: all five outcomes; all four mechanically
  distinct escalate causes (human-gap, value-rejected, cost-ceiling, insufficient-now — by `RuleTrace.kind`
  and its `cleared`/`saturated` fields, per the binding constraint carried forward from ADR 0001's
  amendment: never `missing.reason` prose); all four reversibility levels, each argued explicitly per
  case; all four value-constraint operators (`equals`/`lte`/`gte`/`in`); one explicit "history narrows,
  never grants" case (refund-r7 — a chargeback-history constraint that only ever disqualifies, never
  independently approves); and one explicit cost-vs-face-value case (deploy-d7/d1 pair — a 1-line config
  flip costed at $250,000 because of what it controls, contrasted with an 800-line-budget flag toggle
  costed at $800, same tiny diff size, opposite cost, same evidence quality producing opposite outcomes).
  `npm run demo:domains` compiles `lib/`+`scripts/` to a gitignored `.demo-build/` via a dedicated
  `tsconfig.demo.json` and runs the real `.js` output under plain `node` — no ts-node/tsx dependency, so
  `npm ci` alone suffices.
- engine_gaps found (reported, not patched — `lib/contracts`/`lib/cost-model`/`lib/signals`/`lib/decide`/
  `lib/audit` genuinely untouched): none required a change to the frozen engine. The one real friction
  point — `escalate` carrying four causes distinguishable only via `RuleTrace`, not via `Decision.outcome`
  itself — is the SAME gap ADR 0001's amendment already named and deliberately deferred past this
  milestone; M6 confirms, through real domain data rather than synthetic test cases, that branching on
  `RuleTrace.kind` throughout (never `missing.reason`) is sufficient for now and costs nothing extra to
  do consistently across three independently-authored domains. No new gap is being reported here that
  ADR 0001 didn't already carry forward.
- last_gate: (1) `npm run typecheck` — clean, zero errors, both configs (`tsconfig.lib.json`,
  `tsconfig.json`). (2) `npm test` — 47 test files, 478 tests, all passing (was 435 at the start of this
  milestone; 43 net new, 0 removed or weakened). (3) `npm run demo:domains` — 23/23 cases pass, exit 0;
  confirmed self-checking by temporarily mutating one case's expected outcome, observing exit 1 with a
  clear failure line, then reverting. (4) `npm run build` — succeeds; route table unchanged (`/`,
  `/_not-found`, `/api/health`). (5) `git diff main -- lib/contracts lib/cost-model lib/signals lib/decide
  lib/audit app` — 0 lines; freeze boundary held. (6) `grep -rn "missing\.reason" lib/domains/ scripts/` —
  no matches (all explanatory comments about the rule were reworded to avoid the literal pattern, since
  the gate's own grep has no comment-stripping). (7) `git status --short` — clean after each commit, no
  hang. (8) `git branch --show-current` — `m6-domains`. Never pushed; `main`, `.genesis/DONE.html`, and
  `.genesis/PLAN.md` untouched throughout.
- last_action: added `lib/domains/{shared,refund-approval,code-deploy,content-moderation,__tests__}` and
  `scripts/demo-domains.ts`, wired `demo:domains` into `package.json` plus a new `tsconfig.demo.json` and
  a `.demo-build/` gitignore entry. Six commits: shared scaffolding, one per domain, cross-domain
  coverage/fail-closed/replay-limitation tests, and the demo script.
- next_action: awaiting the next independent L4 VERIFY on `m6-domains`. If approved: M7 (the failure
  suite, `tests/failures/**`) is the next milestone on `.genesis/PLAN.md`, unchanged by this round.
- model: claude-sonnet-5
- tokens_used: ~unspecified (not tracked by this harness)
- tokens_budget: 150000 (M6's stated budget)
- skills_loaded: []

---

## Value-constraints checkpoint (preserved as originally written)

- active_loop: second independent verification of the value-constraints change (ADR 0004), same branch
  `value-constraints`, built from `main`. Not pushed; `main` untouched. This verification APPROVED the
  underlying value-constraints change outright; these four fixes are follow-up hardening it also asked
  for, not a re-litigation of the approval.
- target: FIX 1 [MEDIUM] — ADR 0004 Decision 5's own prose understated the metadata-only replay
  limitation (scoped it to "a value satisfaction contributing to `execute` cannot replay from the record
  alone"; the real shape is broader: ANY satisfied constraint can manufacture the single
  highest-precedence Gap kind — `constraint-violated` — at replay time, purely from `UNDISCLOSED_VALUE`
  failing every operator by construction, and because that Gap outranks every supplier including
  `human`, it can flip the reported OUTCOME KIND for an unrelated requirement's real gap — e.g. a
  recorded `ask` replaying as `escalate` — not only fail to reproduce an `execute`). FIX 2 [LOW] — the
  `in` operator's set-membership check had only unit-level coverage; mutating it to check substring
  containment on the actual value instead of allow-list membership broke just 2 of 416 tests, both
  unit-level, none through the full `decide()` pipeline — its thinnest guard. FIX 3 [LOW] — `reasons.ts`
  documents at length why `valueRejectionReason` must render `"violated"` and `"type-mismatch"` as
  byte-identical prose (replay's `UNDISCLOSED_VALUE` always re-derives `"type-mismatch"`, so divergent
  wording would silently break replay for every real `"violated"` record with no failing test pointing
  at why), but nothing asserted it directly. FIX 4 [LOW] — neither `evaluateConstraint` nor
  `parseValueConstraint` capped `in.values.length` (unbounded per-check cost), and `replay()` read
  `record.requirements` directly with zero validation, unlike its own `signalsFromEvidence`'s per-entry
  reconstruction discipline for evidence — a tampered/hostile `DecisionAuditRecord` (from storage,
  another service, or an attacker) could carry an arbitrarily large allow-list, evaluated in full on
  every constraint check. Carried forward, NOT implemented: two conditions on any future sixth
  `Decision` outcome (consumers must branch on `RuleTrace.kind`, never `missing.reason` prose; prefer
  `deny` over the ADR's own earlier `reject` suggestion, which sits too close to `refuse` both
  orthographically and phonetically), recorded in ADR 0001's amendment section.
- last_gate: All required gates run for real on branch `value-constraints`, after all four fixes. (1)
  `npm run typecheck` — clean, zero errors, both configs. (2) `npm test` — 41 test files, 435 tests, all
  passing (was 416 at the start of this round; 19 net new, 0 removed or weakened). (3) `npm test --
  decide` — 16 files/131 tests pass. `npm test -- signals` — 9 files/121 tests pass. `npm test -- audit`
  — 10 files/86 tests pass. (4) `npm run build` — succeeds; route table unchanged (`/`, `/_not-found`,
  `/api/health`). (5) `git diff main -- lib/contracts lib/cost-model app` — 0 lines; freeze boundary
  held. (6) `git status --short` — clean after each commit, no hang. (7) `git branch --show-current` —
  `value-constraints`. Never pushed; `main` and `.genesis/DONE.html`/`.genesis/PLAN.md` untouched. (8)
  The `in`-operator mutation (constraint.ts's `"in"` case, membership check on the actual value instead
  of the allow-list — substring semantics): re-run BEFORE the FIX 2 test existed — 2 of 416 fail, both
  unit-level (`lib/signals/__tests__/constraint.test.ts`, `gap-analysis.test.ts`). Re-run AFTER adding
  the end-to-end `decide()` coverage — 3 of 419 fail (the same 2, plus the new end-to-end "satisfied"
  case), proving the full pipeline now has its own independent guard on this operator. FIX 3 teeth proof:
  temporarily reworded the `"type-mismatch"` branch in `reasons.ts` to its own sentence and re-ran
  `lib/decide/__tests__/reasons.test.ts` — 2 of its 3 new tests failed immediately on the exact wording
  that diverged; reverted, suite green again. Both mutations/rewordings applied and reverted by hand;
  suite re-confirmed green (435/435) after each revert.
- last_action: FIX 1 — amended ADR 0004 Decision 5 with the general statement above, the two-requirement
  (`ask` -> `escalate`) reproduction, and a considered-and-rejected-for-now answer to "should
  metadata-only replay manufacture this Gap at all" (rejected because it would only ever fire on the
  replay path, and building it correctly would require `lib/signals` to recognize `lib/audit`'s
  `UNDISCLOSED_VALUE` sentinel by name, inverting this project's dependency direction, for a case
  `replay()` already reports correctly via `matches: false`). Added the regression test to
  `lib/audit/__tests__/value-constraint.test.ts`. FIX 2 — added an end-to-end `decide()` describe block
  to `lib/decide/__tests__/value-constraint.test.ts` exercising `in`, satisfied ("low-risk" -> execute)
  and violated ("explicit" -> escalate). FIX 3 — new file `lib/decide/__tests__/reasons.test.ts` pinning
  the violated/type-mismatch wording collapse by exact equality, plus a check that `malformed`/
  `unreadable` correctly keep their OWN distinct wording. FIX 4 — added `MAX_IN_VALUES = 64` to
  `lib/signals/validation.ts` (10-30x headroom over every legitimate example in this project — e.g.
  `Reversibility`'s own 4 members — while bounding per-check cost regardless of where the constraint
  came from), enforced in `parseValueConstraint`'s `"in"` case (rejects, never truncates). Exported
  `parseRequirement` from `lib/audit/validation.ts` and added `requirementsFromRecord` to
  `lib/audit/replay.ts`, routing `record.requirements` through it — drops (never fabricates or
  truncates) any requirement that fails to parse, per-entry, mirroring `signalsFromEvidence`'s existing
  discipline for evidence. New test coverage: `lib/signals/__tests__/validation.test.ts` (previously
  zero direct coverage of `parseValueConstraint` existed at all) and two new cases in
  `lib/audit/__tests__/fail-closed.test.ts` proving a 100,000-entry allow-list and a `signalKind`-less
  requirement, both smuggled onto a hand-built record's `requirements` array, are dropped rather than
  evaluated or thrown on, and that replay still reproduces the original untampered decision exactly
  (`matches: true`) instead of the `escalate` the unvalidated path would otherwise have forced. Also
  amended ADR 0001's amendment section with the two carried-forward conditions (no behavior change).
  `lib/contracts/**`, `lib/cost-model/**`, `app/**` untouched throughout.
- next_action: Awaiting the next independent L4 VERIFY on this second round of fixes before it counts as
  done, per standing guidance. If approved: M6 (three domains with realistic data, `domains/**`) remains
  the next milestone on `.genesis/PLAN.md`, unchanged by this round.
- model: claude-opus-5
- tokens_used: ~unspecified (not tracked by this harness)
- tokens_budget: unspecified for this follow-up (not one of the original 9 milestones)
- skills_loaded: [genesis]

---

## Value constraints (ADR 0004) checkpoint — first independent verification (preserved as originally written)

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
