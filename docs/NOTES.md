# Notes: AI tools, decisions, scope, and process

## AI tools used

This project was built loop by loop under a genesis-kit-style process (`.genesis/`): a machine-parseable
plan (`PLAN.md`) sliced into milestones, a rolling checkpoint (`checkpoints/CURRENT.md`), and a strict
separation between the model that **builds** a milestone (L1 BUILD) and the model that **independently
verifies** it (L4 VERIFY) before it can be marked done. Every commit in this repository's history carries
`Co-Authored-By: Claude Opus 5`. **That trailer is not evidence of who drove any milestone — say so
plainly, because an earlier version of this paragraph read it that way and got it backward.** The trailer
is a fixed attribution string the orchestrating harness writes on every commit regardless of which model
actually did the work; it does not distinguish a BUILD commit from a VERIFY finding from an orchestrator's
own edit, and `git log` alone cannot recover who built what. The real split, the same one across all nine
milestones: an **Opus 5 orchestrator** wrote each milestone's brief, reviewed the resulting work, and made
the merge decisions; the **BUILD and VERIFY work itself was done by Sonnet subagents** — a different agent
for BUILD than for VERIFY on every milestone, per the project's own standing rule ("a separate
agent/model," per `.genesis/DONE.html`'s own Definition-of-Done gate). M9 (this milestone — documentation
and verification only, no code) followed the same split. A VERIFY pass's findings are folded back into the
checkpoint and the ADRs by the next BUILD pass that addresses them, rather than committed under separate
authorship — so which Sonnet session verified a given milestone isn't visible in `git log` either, only its
findings are, in the ADRs and in `CURRENT.md`'s history.

## Key decisions, and why

- **Five outcomes, not two, as a discriminated union** (ADR 0001). Binary allow/deny is the case the brief
  explicitly disqualifies; the five outcomes are distinguished by *what is missing and who or what can
  supply it* (counterparty / time / a human / nobody), which is what keeps `ask`/`defer`/`escalate` from
  collapsing into one "not yet" bucket.
- **One deterministic `decide(action, signals)` function, domains as data adapters** (the G0.5 brainstorm).
  Rejected bespoke per-domain rules specifically because three domains re-deriving the same
  reversibility × cost asymmetry three times gives no single mechanism to point to and no guarantee the
  three domains even agree with each other.
- **`requiredConfidence(reversibility, cost)` as the only place the confidence bar is computed**, never a
  constant compared inline — enforced by a grep-based test (`no-bare-threshold.test.ts`), not just a
  convention.
- **Value constraints are data, not a predicate closure** (ADR 0004). A closure would have been
  unserializable, reproducing the exact problem `Prohibition.matches` already has — see "Two rejected
  requirements," below.
- **Audit records store signal metadata, never the value, by default** (ADR 0003). Replay turns out not to
  need the value at all for most cases, because `decide()` itself never reads `.value` for anything except a
  declared value constraint — investigated and proven, not assumed.
- **`min` aggregation, naming the specific limiting signal** (ADR 0002). Makes every explanation concrete
  ("this decision was limited by signal X") rather than statistical.

## Deliberately out of scope

- **A sixth `Decision` outcome** for value rejections (a plausible name the record itself argues against:
  `reject`; `deny` is the recommended name if this is ever built — see ADR 0001's amendment). Would need to
  unfreeze `lib/contracts/`; not done in this project's lifetime.
- **Cryptographic signing of audit records.** `replay()` can only catch an *inconsistent* tamper (one field
  changed without the others); an attacker who forges an input and its matching decision **consistently**
  would replay clean. Signing would close this; never requested, never built (ADR 0003, Decision 6).
- **A general constraint expression language** — `notEquals`/blocklist operators, strict `lt`/`gt`,
  regex/substring matching, `and`/`or`/`not` combinators, cross-signal comparison. Each was considered and
  rejected in ADR 0004's own header comment as a step toward the engine re-implementing per-domain judgment,
  which is the exact failure mode the one-engine design exists to avoid.
- **Serializing `Prohibition.matches` as data (a rules DSL)** instead of a function. Would make prohibitions
  fully replayable without a supplied rule set, but is an `lib/decide`-scope change frozen since M4 (ADR
  0003, Alternatives rejected).
- **A `"could-not-evaluate"` Gap variant for metadata-only replay.** Would describe the value-constraint
  replay limitation (see Limits in the README) more honestly than letting it manifest as a manufactured
  `constraint-violated` Gap — considered in ADR 0004's amendment and explicitly not built, because it would
  require `lib/signals` (a lower layer) to recognize an `lib/audit` concept by name, inverting this
  project's own dependency direction.
- **Wiring `checkHumanSupplierAgainstSatisfyingSignal` into `decide()`.** M3 built the check as opt-in
  precisely because whether to block, downgrade, or merely log the hazard it detects is a policy call
  outside that milestone's scope; M4 left it unwired for the same reason (ADR 0002, Alternatives rejected).
- **Any LLM in the decision path.** Stated as a project-level design choice, not an oversight:
  `decide()` is a pure function of typed signals so a decision that can't be reproduced from its own recorded
  inputs is itself treated as a defect — a property no LLM call could offer.
- **A persistence layer for audit records.** `recordDecision`/`replay` operate on plain in-memory data;
  storing, forwarding, or indexing records is left to a caller. Nothing in this codebase reads or writes a
  database.
- **Deployment itself (M2, M8's live-URL requirement).** Verified, deploy-ready code exists for both; the
  actual `vercel` deploy is a human step that has not happened as of this milestone. See Limits in the
  README — this is stated there, plainly, rather than implied away.

## The process: verification and rejection, by the record

Nine independent verification passes ran across this project's build (M1 through M8, plus one dedicated
follow-up pass reviewing the value-constraints change introduced after M5). **Exactly one of those nine
returned a formal reject** — everything else, including the value-constraints follow-up and M5 itself, was
independently **approved** (several with non-blocking follow-up fixes attached, addressed before the next
milestone started). That single rejection was the first independent verification of M4 (the decision
engine), which returned 5 findings, one of them CRITICAL: `decide(null)` and `decide(undefined)` threw from
*inside the function's own catch handler* — the exact code path that existed to guarantee `decide()` never
throws, falsifying its own doc comment. The other four findings from that same pass included a false
"unreachable" escalate-reason claim (below), a framework-free guard defeated by ordinary Prettier
formatting, and two lower-severity aggregation/tie-break gaps. All five were fixed before a second
independent pass approved the milestone outright.

**Two concrete examples, because the fact that most passes approved is less interesting than what the one
rejection, and later passes, actually caught:**

1. **The CRITICAL finding above.** `decide()`'s outer `try/catch` was supposed to guarantee it never throws
   "for any input." The catch handler itself re-read `input.action` to build its escalate fallback — a
   *second* read of the very thing that could be hostile. When `input` itself was `null`/`undefined`, that
   second read threw, uncaught, straight out of a function whose entire job includes never doing that. The
   fix reads `input.action` exactly once, defensively, before either try block runs.
2. **An "unreachable" escalate reason that was never actually true.** M4's original design (ADR 0002)
   distinguished a saturated confidence bar as "unreachable by evidence, permanently" from an ordinary,
   evidence-can-still-help gap. The verification swept every reversibility level and found this condition
   first fires at roughly **$1,800** — an ordinary cost, not an extreme one — and, more importantly, that
   `Confidence` caps at 1.0 while every bar this model can produce caps below that at 0.99: a single signal
   reporting confidence 1.0 always clears any bar, at any cost, under this model's own aggregation rule.
   "Unreachable" and "permanently" were both false, at every cost, not just the low end the sweep happened
   to probe. The fix didn't collapse the distinction (the "cost ceiling reached" fact is still true and still
   useful) — it retracted only the false part and renamed the function (`unreachableBarReason` →
   `costCeilingReason`).

**The most interesting fact about the process, though, is not the one milestone-level rejection — it's that
two separate findings rejected requirements the project's own earlier design work (not just the code) had
written down as correct:**

- **The "unreachable" reason itself** (example 2 above) wasn't a coding bug being fixed — it was a
  *design claim*, argued in prose in ADR 0002 at M4's build time, that the verification proved false on its
  own terms once someone actually swept the numbers instead of trusting the argument.
- **A `valueCheck` predicate closure for value constraints.** Before ADR 0004 settled on constraints-as-data,
  the obvious, easy way to add "does this signal's value pass this check" was a closure:
  `valueCheck?: (v: unknown) => boolean`. That was considered and rejected — not because it wouldn't work,
  but because it would have **reproduced, one milestone later, the exact unserializable-function problem
  `Prohibition.matches` had already forced onto the audit trail**: M5 had to record prohibitions by id and
  require the caller to supply the real predicates again at replay time, specifically because a function
  can't be serialized. Choosing a closure for value constraints would have re-created that same audit-trail
  workaround for a second feature, one milestone after the first one had already paid the cost of it once.
  Constraints-as-data means `lib/audit/rule.ts` can instead name the exact constraint that failed directly in
  the record, with no external rule catalog needed at replay — the property `Prohibition` explicitly lacks.

Both are examples of the same discipline: a design decision that looked settled — because it had already
been argued in an ADR, or because it was the obvious implementation — was revisited and reversed once an
independent pass (or, in the second case, the next milestone's own design work) actually checked it against
what the rest of the system already knew, rather than taking the earlier argument at its word.
