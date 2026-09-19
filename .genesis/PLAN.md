# PLAN — decision-engine

The machine-parseable implementation plan. Mirrors the milestone table in `DONE.html` (DONE.html is the
human/visual view; this is the one loops read). Sliced so each milestone ships in one L1 BUILD pass.

> Slicing rule: a milestone must have (a) a single clear outcome, (b) an exact **demo command** that
> proves it, and (c) a freeze boundary of files it may touch. If you can't write the demo command,
> the milestone is too vague — split it.

---

## Brainstorm (G0.5 — fill before slicing milestones)

> Three fundamentally different approaches to the cognitive job. Pick one. Record the rationale.
> This is the cheapest design decision — you haven't written a line of code yet.

### Approach A — Single risk score with a threshold
Compute one number (0-100) blending confidence and risk; execute above the threshold, refuse below it.
- Strengths: trivial to implement; trivial to explain in one sentence.
- Weaknesses: this IS the "score with no mechanism" the brief disqualifies; a single scalar cannot
  distinguish *why* something didn't clear the bar, so `ask`, `defer`, and `escalate` collapse into an
  undifferentiated `refuse` — exactly the middle ground the brief says is the actual product.

### Approach B — Bespoke rules per domain
Hand-write if/else decision logic separately inside refund-approval, code-deploy, and content-moderation,
each with its own notion of confidence and risk.
- Strengths: each domain's logic can be tuned freely; fast to get one domain demoable.
- Weaknesses: three domains means three re-derivations of the same asymmetry (confidence bar scales with
  irreversibility × cost); nothing forces them to agree, so there is no single mechanism to point to when
  a reviewer asks "how does this generalize," and a fourth domain means writing a fourth decision logic
  from scratch rather than reusing one.

### Approach C — One deterministic decision function over typed signals, domains as data adapters
A single `decide(action, signals)` function is the entire decision layer. It computes confidence and risk
generically from the signals it's given, asks a shared reversibility × cost model for the required
confidence bar, and returns one of the five outcomes with named evidence and named missing information.
Domains (refund/deploy/moderation) contribute nothing but realistic signals and an action's cost/reversibility
— they never touch outcome logic.
- Strengths: the asymmetry (same confidence, different outcome depending on stake) is a property of one
  function, provably exercised by every domain identically; missing information becomes a first-class,
  reusable type instead of something each domain reinvents; this is what makes it "a system, not a prompt
  wrapper" — there is exactly one place where the five outcomes are decided, and it is unit-testable in
  isolation from any domain.
- Weaknesses: more upfront design work before any domain feels "done"; the shared model must be general
  enough to fit three fairly different domains without special-casing any of them.

### Chosen: C — because the brief's hardest-to-fake claim is the asymmetry itself (a reversible $5 action
at 60% confidence executes; an irreversible $50,000 action at 95% escalates), and that claim is only real
if it lives in one engine that every domain is forced to go through, rather than being restated three times
and drifting three ways.

---

## Milestones

### M1 — Contracts: the five outcomes and the cost model
- **Outcome:** The `Decision` type, the five outcomes (`execute` · `ask` · `defer` · `escalate` · `refuse`)
  as a discriminated union, and the reversibility × cost model that computes the confidence bar a decision
  must clear. Nothing here reads a real signal yet — this milestone is the vocabulary everything else speaks.
- **Phase (swe-master):** BUILD
- **Files / freeze boundary:** `lib/contracts/**`, `lib/cost-model/**`
- **Demo command:** `npm test -- contracts`
- **Success criteria:** the suite proves the five outcomes are mutually exclusive variants of one
  discriminated union (no bare boolean or string outcome anywhere), and that `requiredConfidence(reversibility,
  cost)` returns a strictly higher bar for an irreversible $50,000 action than for a reversible $5 action —
  the asymmetry, executable and checked, before any domain exists.
- **Loops:** L1, L4
- **Token budget:** 150000

### M2 — Deploy a live skeleton to Vercel
- **Outcome:** A minimal Next.js app with a health endpoint, deployed, with a real public URL. This comes
  second deliberately — a live URL is a hard requirement of the brief, and leaving deployment to the end is
  how it fails to happen.
- **Phase:** DEPLOY
- **Files:** `app/api/health/**`, `vercel.json`, `next.config.*`, `package.json`
- **Demo command:** `curl -sf $DEPLOY_URL/api/health`
- **Success criteria:** returns HTTP 200 with a JSON body naming the deployed commit SHA. **Needs a Vercel
  account.**
- **Loops:** L1, L4
- **Token budget:** 150000

### M3 — Signals: typed evidence with provenance
- **Outcome:** Every `Signal` the engine can ever read carries where it came from, how fresh it is, and how
  confident it is on its own terms. Missing information is modelled as an explicit, first-class value — never
  as an absent field, a `null`, or a silently-defaulted fallback.
- **Phase:** BUILD
- **Files:** `lib/signals/**`
- **Demo command:** `npm test -- signals`
- **Success criteria:** the suite proves a signal with no provenance, or one past its freshness threshold,
  is surfaced as `MissingInformation` rather than silently dropped or defaulted, and that every signal type
  admits `source`, `capturedAt`, and its own `confidence` as required fields, not optional ones.
- **Loops:** L1, L4
- **Token budget:** 150000

### M4 — The decision engine
- **Outcome:** `decide(action, signals)` maps signals to exactly one of the five outcomes, applying the
  irreversibility-and-cost asymmetry from M1's cost model. Missing information is an output of this function,
  not an absence — "I would execute if I knew X" is itself a first-class, named result.
- **Phase:** BUILD
- **Files:** `lib/decide/**`
- **Demo command:** `npm test -- decide`
- **Success criteria:** the suite proves the asymmetry end-to-end (the identical confidence value fed through
  two different cost/reversibility profiles yields `execute` for one and `escalate` for the other), and that
  every `ask` names the one specific fact the counterparty must supply, every `defer` names what it is waiting
  on time for, and every `escalate` states why no confidence number would have been enough.
- **Loops:** L1, L4
- **Token budget:** 150000

### M5 — The audit trail
- **Outcome:** Every decision is recorded with its inputs, the signals it read, the rule that fired, and the
  outcome — and is replayable: feeding the same recorded inputs back through `decide()` must reproduce the
  same outcome.
- **Phase:** BUILD
- **Files:** `lib/audit/**`
- **Demo command:** `npm test -- audit`
- **Success criteria:** the suite proves `decide(record.inputs)` deep-equals `record.outcome` for every
  recorded decision (excluding timestamp/id fields), and that the record's reasoning names the exact signals
  and the exact rule — never a bare outcome with no trail behind it.
- **Loops:** L1, L4
- **Token budget:** 150000

### M6 — Three domains with realistic data
- **Outcome:** Refund approval, code deploy, and content moderation wired to the one shared engine, each
  contributing realistic synthetic data (real-shaped tickets, diffs, posts — not toy examples) as signals and
  an action's cost/reversibility, never their own outcome logic.
- **Phase:** INTEGRATE
- **Files:** `domains/refund-approval/**`, `domains/code-deploy/**`, `domains/content-moderation/**`,
  `scripts/demo-domains.ts`
- **Demo command:** `npm run demo:domains`
- **Success criteria:** the script runs realistic cases through all three domains and prints all five
  outcomes appearing at least once across the full set, each with its named evidence and, where applicable,
  its named missing information.
- **Loops:** L1, L4
- **Token budget:** 150000

### M7 — The failure suite
- **Outcome:** Adversarial and edge cases against the engine itself, including the brief's required
  deliberate failure test — a case built specifically to break the engine — with an honest account of what
  actually happens when it does.
- **Phase:** VERIFY
- **Files:** `tests/failures/**`
- **Demo command:** `npm test -- failures`
- **Success criteria:** the suite includes at minimum: zero signals, all signals stale, directly conflicting
  signals, a signal claiming impossible confidence (>1 or <0), and the one deliberate break-it case documented
  in `docs/` (M9); every case is asserted to fail toward `ask`/`defer`/`escalate`/`refuse`, never toward a
  silent `execute`.
- **Loops:** L1, L4
- **Token budget:** 150000

### M8 — The demo UI
- **Outcome:** Make a decision legible in 90 seconds: the outcome, its confidence and risk score, the
  signals used, the missing information (if any), and the audit trail behind it, on one screen.
- **Phase:** BUILD
- **Files:** `app/**`, `components/**`
- **Demo command:** the deployed URL renders a decision and its full reasoning
- **Success criteria:** given a sample action, the deployed URL renders the outcome, confidence, risk score,
  the evidence list, the named missing information, and the audit record — a stranger with no context can
  read what happened and why without asking. **Needs a Vercel account** (reuses M2's deployment).
- **Escalate legibility (carried forward from M6's independent verification):** `escalate` has four
  mechanically distinct causes at the `RuleTrace` layer — `human`, `value-rejected`, `cost-ceiling`
  (`cleared:false, saturated:true`), and `insufficient-now` (`cleared:false, saturated:false`) — and a bare
  "Escalated" label would defeat the 90-second legibility bar above; these are four different stories (a
  human must sign off regardless of evidence; the evidence itself said no; more cost cannot raise the bar
  further, only better evidence helps; just needs more or better evidence). The demo UI must render at
  least four visually and textually distinct escalate explanations, branching on `RuleTrace.kind` plus its
  `cleared`/`saturated` fields — and must never infer the cause from `missing.reason` prose.
- **Requirement construction from request data (carried forward from M7's independent verification):**
  `MAX_IN_VALUES` (`lib/signals/validation.ts`) caps `in.values.length` only inside `parseValueConstraint`
  — `decide()` called directly, or a hand-built `Requirement` with an unbounded `in.values` allow-list,
  accepts any size (verified with 100,000 entries). This was confirmed NOT reachable as of M7: nothing
  under `app/` calls `decide()` at all, and every domain builds its `Requirement`s in code, never from
  untrusted input — but M8 is the milestone that changes that, the moment its UI constructs a
  `Requirement` from anything a request carries. Any `Requirement` M8 builds from request data MUST go
  through `parseValueConstraint` (or equivalent validation) rather than being constructed directly, because
  the cap lives only in the parser, not in the `Requirement`/`ValueConstraint` types themselves. This is a
  requirement for M8's implementation, not a suggestion.
- **Loops:** L1, L4
- **Token budget:** 150000

### M9 — Deliverables
- **Outcome:** Architecture snapshot (inputs → signals → decision → audit), a two-year thesis (≤300 words),
  `.env.example`, and a verified clean-clone run.
- **Phase:** RELEASE
- **Files:** `docs/**`, `README.md`, `.env.example`
- **Demo command:** `cd "$(mktemp -d)" && git clone https://github.com/vladimir-mawla/decision-engine . && npm ci && npm run typecheck && npm test`
- **Success criteria:** a fresh clone, install, typecheck, and test run all pass with zero credentials
  configured; the architecture snapshot and thesis exist in `docs/` and every factual claim in them is
  checked against the actual code and test output before being committed, not asserted uncritically.
- **Loops:** L1, L4
- **Token budget:** 150000

---

## Progress (loops append here on milestone completion — newest last)

- _(none yet — first loop fills this)_
