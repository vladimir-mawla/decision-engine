# decision-engine

A decision layer that knows when it is allowed to act. It returns one of **five outcomes** —
`execute` · `ask` · `defer` · `escalate` · `refuse` — never a bare `allow`/`deny`, never a single risk
score. The claim it makes: **binary allow/deny is the easy case; the actual product is the middle** — the
mechanism that decides when to act autonomously, when to ask, when to wait, and when to hand a specific
call to a human, and why. Every decision names the exact evidence it used and the exact rule that
produced it, and is replayable: the same recorded inputs, fed back through the engine, reproduce the same
outcome.

**Docs:** [Architecture](docs/ARCHITECTURE.md) (inputs → signals → decision → audit, and what each stage
refuses) · [Thesis](docs/THESIS.md) (two years out) · [Notes](docs/NOTES.md) (how this was built, and the
process that verified it) · [Walkthrough](docs/WALKTHROUGH.md) (a 90-second demo script).

## The case that carries this project: D1 and D7

Two real pull requests, run through the exact same engine, side by side (`lib/domains/code-deploy`):

| | D1 — admin-tool flag toggle | D7 — one-line fraud-check flag |
|---|---|---|
| Lines / files changed | 1 / 1 | 1 / 1 |
| Review approvals | 2 | 2 |
| CI status | passed | passed |
| Static-analysis confidence | 0.90 | 0.90 |
| Cost of being wrong | **$800** | **$250,000** |
| Reversibility | reversible-no-trace | irreversible |
| **Outcome** | **execute** | **escalate** |

By every measure of the *diff itself* — lines touched, files touched, approvals, even the confidence
readings — these two changes are identical, and neither looks dramatic. D1 flips a feature flag behind a
kill switch on an internal admin tool. D7 flips a config flag that disables fraud scoring on the checkout
path — one line, meant as a temporary vendor-incident workaround. The engine executes one and escalates
the other, because **cost tracks what a change controls, not the shape of the change that controls it.**
D7's line doesn't cost more to write; it costs $250,000 to be wrong about, because of what it turns off.
Nothing about the code review tells you that. The action's declared stakes do.

Try it yourself in the deployed demo's stakes explorer (see Deployment, below, for whether that link is
live yet): drag the same evidence between D1's and D7's stakes and watch the outcome flip, live, with
nothing about the review approvals or CI status changing at all.

## The five outcomes, and escalate's four causes

- **execute** — evidence is sufficient and clears the bar this action's reversibility and cost demand.
- **ask** — one specific fact is missing, and the counterparty can supply it. Named, never implied.
- **defer** — the missing thing is time. Nobody needs to be asked anything; the clock is the witness.
- **escalate** — ownership of this call moves to a human. This is one outcome name over **four
  mechanically distinct causes**, told apart at the audit layer by `RuleTrace.kind`, never by parsing a
  sentence:
  1. **`human`** — a human sign-off is required regardless of how the evidence looks (e.g. a security
     rewrite, a newsworthiness exception).
  2. **`value-rejected`** — the evidence arrived, is fresh and confident, and its *value* says no (a fraud
     assessment reading `"FRAUDULENT"`, a moderation category outside an allow-list). A different value
     would have produced a different outcome — this is not `refuse`.
  3. **`confidence-bar`, saturated (cost-ceiling)** — the stated cost has already pushed this
     reversibility level's bar to its own ceiling; a bigger number won't push it any higher, only better
     evidence could.
  4. **`confidence-bar`, not saturated (insufficient-now)** — the bar has headroom; today's evidence just
     doesn't clear it, and better evidence, later, could.
- **refuse** — the action should not happen, full stop, independent of who is asking or how certain
  anyone is. Checked first, before any signal is read — proven directly (`lib/decide/__tests__/prohibition.test.ts`),
  not inferred: a prohibited action still returns `refuse` even when its `signals` array is a `Proxy` that
  throws on every access.

All five outcomes, and all four escalate causes, appear at least once across the 23 realistic cases in
`npm run demo:domains` (refund approval, code deploy, content moderation) — outcome distribution:
`execute=3, ask=3, defer=3, escalate=11, refuse=3`.

## What's actually verifiable

- **541 tests, 58 files, all passing** (`npm test`), plus a separate drift guard
  (`app/milestones.test.ts`) that fails the build if the deployed page's claimed-complete milestone set
  ever disagrees with `.genesis/DONE.html`'s own status table.
- **`npm test -- failures`** runs the dedicated adversarial suite (`tests/failures/`): the deliberate,
  brief-required failure test (below), plus **nine regression attacks pinning historical defects that
  genuinely shipped and were caught by independent verification** — three of the nine are honestly labeled
  in their own file headers as *partial* pins, because the original defect lived inside a file frozen since
  an earlier milestone and can't be re-exercised without touching that freeze; the other six pin the exact
  original break through the public API alone.
- **The deliberate failure test** (`tests/failures/part1-deliberate-failure.test.ts`) is the sharpest
  weakness this project could find in its own mechanism, not a contrived edge case: see Limits, first
  bullet.
- **`npm run demo:domains`** — 23 realistic cases across three domains, each with an exact audit replay,
  23/23 passing, exit 0.
- **`npm run typecheck`** — clean across both the frozen `lib/` config and the app config.
- **`npm run build`** — a real Next.js production build.

## Quickstart (clean clone)

```sh
git clone https://github.com/vladimir-mawla/decision-engine
cd decision-engine
npm ci            # not `npm install` — see Dev notes
npm run typecheck
npm test
npm run demo:domains
npm run dev       # http://localhost:3000
```

No credentials, API keys, or accounts are needed for any of the above — `.env.example` states this
directly and is itself checked: the deployed app's only environment variable
(`VERCEL_GIT_COMMIT_SHA`) is set *for* you by Vercel, never configured by hand, and local dev runs
correctly without it.

## Deployment

The code is deploy-ready and verified locally (the health check below, the production build, and the
demo UI all run correctly). **The actual deployment to Vercel has not happened yet** — it is a human step
(a Vercel account import) that this automated process cannot perform on its own. Concretely: this
project's own milestone plan (`.genesis/PLAN.md`, `.genesis/DONE.html`) still lists **M2** (deploy a live
skeleton) and **M8** (the demo UI live at that URL) as `todo`, specifically because both milestones'
own demo commands require a real, reachable deployment. Everything *behind* that URL — the health
endpoint, the stakes explorer, the escalate gallery — is built, tested, and typechecked; only the "make it
public" step is outstanding. A drift guard (`app/milestones.test.ts`) fails the build if the deployed
page ever claims a milestone complete that `.genesis/DONE.html` does not also mark complete, so this
status can't quietly go stale once the deploy does happen.

## Dev notes that still matter

- **`next dev --webpack` / `next build --webpack` — pinned deliberately, not a leftover default.**
  `lib/` is frozen and uses relative imports with an explicit `.js` extension pointing at a sibling `.ts`
  file (standard TypeScript `bundler`-resolution style, which `tsc` and Vitest's esbuild both resolve
  fine). Turbopack — Next 16's default — fails outright on that pattern with "Module not found," and no
  Turbopack option in this Next version treats an explicit `.js` specifier as also matching a `.ts` file.
  Webpack resolves it once told to, via `experimental.extensionAlias` in `next.config.ts`. The alternative
  — rewriting `lib/`'s import style — was rejected because `lib/` is frozen: `git diff main -- lib` must
  stay empty. Cost of this choice: the app builds one bundler version behind Next's new default until
  Turbopack gets an equivalent option, or a later change compiles `lib/` to real `.js` as a build step
  instead of importing the `.ts` sources directly.
- **`npm ci`, never `npm install` — and even `npm ci` has bitten this repo twice.** npm 11.5.1 has a known
  bug ([npm/cli#4828](https://github.com/npm/cli/issues/4828)) where `npm ci`/`npm install` can drop a
  platform-specific optional dependency on reconcile — concretely, `@rolldown/binding-<platform>`, the
  native binding Vitest resolves through `vite`/`rolldown`. When it happens, `npm test` fails with a bare
  "Cannot find native binding" that gives no hint the *install*, not the code, is at fault. It has fired
  twice on this repo. CI (`.github/workflows/ci.yml`) has a dedicated step right after `npm ci` — before
  typecheck or test run at all — that requires `rolldown` and fails immediately, with a clear label, if
  the binding didn't survive the install. If a clean `npm ci` here ever produces a confusing native-binding
  error, this is why, and re-running `npm ci` once has been sufficient in practice.

## Honest limits

Unsoftened, because the previous section already showed the parts that work — this project's own ADRs
(`.genesis/decisions/`) argue several of these at length, and are worth reading directly:

- **The engine trusts a stated confidence and cannot tell a calibrated 0.99 from a fabricated one — and no
  stake is high enough to stop it.** `requiredConfidence` is clamped to a ceiling of 0.99 at every
  reversibility level; a single signal self-reporting confidence 1.0 always clears any bar this model can
  produce. Nothing downstream of a `Signal.confidence` number ever asks who is asserting it or whether that
  number has ever been validated against outcomes. The dedicated adversarial test for this
  (`tests/failures/part1-deliberate-failure.test.ts`) proves it directly at $5,000,000 — a hundred times
  the project's own worked example — with the identical result.
- **`Provenance` is recorded metadata, not an authenticated claim — symmetrically, for all four kinds.**
  `counterparty`, `system`, `human`, and `derived` provenance are all just a labeled string the signal's
  own creator chose to attach; nothing verifies that a signal actually came from where it claims to.
- **A satisfied value constraint cannot replay from the record alone.** Audit records never store a
  signal's real value, only its metadata (by design — see Architecture, Audit stage). That's sound for a
  *rejected* constraint (the rejection replays exactly), but a *satisfied* one cannot: metadata-only replay
  substitutes an undisclosed-value sentinel that fails every constraint by construction, and this is
  broader than it first looks — a recorded `ask` can replay as `escalate`, not only an `execute` losing its
  replay match. `replay()` always reports this honestly (`matches: false`, never a silent false positive);
  a caller who holds the real original signals can pass them via the optional `knownSignals` parameter to
  close the gap.
- **A record proves which rule fired, never what the full rule set was.** `Prohibition.matches` is a
  function and can't be serialized; a record stores prohibition ids in order and requires the caller to
  supply the real predicates again at replay time. An attacker who forges an input and its matching
  decision *consistently* would replay clean — `replay()` only catches an *inconsistent* tamper.
  Cryptographic signing would close this; it isn't built.
- **`MAX_IN_VALUES` caps only the parser.** `parseValueConstraint` rejects an `"in"` constraint with more
  than 64 values. `decide()` called directly, or a hand-built `Requirement` with an unbounded `in.values`
  array, is not stopped by this cap at all.
- **`escalate` carries four causes behind one outcome name.** See "The five outcomes," above. A consumer
  that reads `Decision.outcome` alone, or pattern-matches `missing.reason` prose instead of branching on
  `RuleTrace.kind`, cannot mechanically tell them apart — and is one prose rewording away from silently
  misclassifying a decision.
- **A branded type stops an accidental assignment, not a deliberate cast.** `CostOfBeingWrong` is a branded
  `number` so a plain number can't be assigned where a validated cost is expected — but
  `(x as number) as CostOfBeingWrong` compiles cleanly. The only enforcement is a static source-scan test
  over `lib/`, not a runtime guard; a value arriving from deserialization or another service, cast at the
  boundary, is not caught by anything at runtime.
- **Reversibility is a declared label, not a derived fact.** Whether an action is `irreversible` versus
  `reversible-with-cost` is a domain author's own judgment call (see D7's own rationale in
  `lib/domains/code-deploy/domain.ts` for how easy that judgment is to get wrong in a way that looks
  principled — an earlier draft of D7's rationale would have collapsed a whole reversibility level had it
  gone unchecked). Nothing in the engine itself checks a declared reversibility against anything.
- **No persistence, no signing, no LLM in the decision path — all by design, not oversight.** See
  `docs/NOTES.md`'s "Deliberately out of scope" for the fuller list and the reasoning behind each.
