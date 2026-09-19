# Notes: AI tools, decisions, scope, and process

## AI tools used

This project was built loop by loop under a genesis-kit-style process (`.genesis/`): a machine-parseable
plan (`PLAN.md`) sliced into milestones, a rolling checkpoint (`checkpoints/CURRENT.md`), and a strict
separation between the model that **builds** a milestone (L1 BUILD) and the model that **independently
verifies** it (L4 VERIFY) before it can be marked done. Every commit in this repository's history carries
`Co-Authored-By: Claude Opus 5`. **That trailer is not evidence of who drove any milestone — this is worth
stating plainly, because an earlier version of this paragraph read it that way and got it backward.** The
trailer is a fixed attribution string the orchestrating harness writes on every commit regardless of which
model actually did the work; it does not distinguish a BUILD commit from a VERIFY finding from an
orchestrator's own edit, and `git log` alone cannot recover who built what. `checkpoints/CURRENT.md`'s own
per-loop `model:` field is more granular than the commit trailer, and by that record BUILD was
**predominantly Sonnet — but not exclusively.** Sonnet ran BUILD directly for M9 (this milestone), M8's
follow-up round, both M6 rounds, both M5 rounds, and M4's iteration 3; Opus ran BUILD directly several
times too — both M7 rounds, both value-constraints fix rounds, and the fix round after M4's one formal
reject. One entry, M8's base milestone, is annotated in the checkpoint itself as "(per this milestone's
commit-attribution instruction)" — a sign that even `model:` can sometimes record a convention rather than
the engine that actually ran, so treat this as the best record available, not as independently proven; no
artifact in this repository proves which engine executed a given loop. The project's own
Definition-of-Done gate requires **maker ≠ checker at the agent level** — whichever agent built a
milestone must not be the one that independently verifies it ("a separate agent/model," per
`.genesis/DONE.html`'s own gate) — but unlike the BUILD-side breakdown just given, this is not something
`CURRENT.md` lets a reader check: none of its roughly 28 mentions of an independent L4 VERIFY pass carries
a `model:` field or names an agent; only BUILD/fix loops record that field at all. So this is the process's
own account of its own separation, not a claim the repository's own record can confirm or refute — stated
here as exactly that, rather than as something "checkable." The same hedge applies to who did the
orchestrating: on the process's own account, an orchestrator wrote each milestone's brief, reviewed the
resulting work, and made the merge decisions throughout — that briefs got written, reviews happened, and
merges happened is not in doubt, only which agent or model sat behind them. The one independent record
that exists doesn't settle that either way: every one of this repository's nine PRs was authored and
merged by the `vladimir-mawla` account, with no bot or orchestrator identity anywhere — compatible with a
human executing merges an orchestrator recommended, or with a human doing the orchestrating directly, and
nothing in the repository distinguishes between them. A VERIFY pass's findings are
folded back into the checkpoint and the ADRs by the
next BUILD pass that addresses them, rather than committed under separate authorship — so which agent
verified a given milestone isn't visible in `git log` either, only its findings are, in the ADRs and in
`CURRENT.md`'s history.

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

**A boundary worth being precise about, now that M9's own review has finished:** the "nine passes" above
covers this project's *build* — M1 through M8, plus the value-constraints follow-up — checked directly
against the L4 write-ups in PR comments #1–#9, and that count stands as written; it does not include M9's
own review, because M9 is documentation and verification only, not build. M9 (this milestone, the ninth on
`.genesis/PLAN.md`) took **eight independent verification rounds of its own, six of them formal
rejections** — rejections on rounds 1 through 4, an approval on round 5, rejections on 6 and 7, and the
approval this milestone merged on at round 8. The freeze boundary held at zero diff against `main` on
every round, and the test suite stayed at 541 tests / 58 files throughout — every one of the six
rejections was about documentation, never code.

What the first four rounds were actually for is more useful than the count — by round, not by a tidy
one-reject-one-reason tally, because it wasn't one (an earlier draft of this very paragraph assumed it was,
which is worth naming plainly rather than quietly correcting: the record-smoothing this milestone kept
getting rejected for showed up once more in the paragraph written to document it):

- **Round 1** — reading the fixed `Co-Authored-By` trailer, above, as evidence of who built anything.
- **Round 2** — two distinct causes in one verdict: **(a)** asserting a clean
  Opus-orchestrates/Sonnet-builds split, "a different agent for BUILD than for VERIFY on every milestone,"
  that `checkpoints/CURRENT.md`'s own mixed `model:` field contradicts; and **(b)** the README limits
  bullet's claim that "nothing in the record marks the difference" between an escalate and a masked
  internal defect, directly contradicted by `lib/audit/rule.ts`'s dedicated `internal-error` `RuleTrace`
  variant.
- **Round 3** — claiming maker ≠ checker "held, checkably, on every milestone" when no independent VERIFY
  pass in that same checkpoint records an agent identity at all.
- **Round 4** — the unhedged sentence "An Opus orchestrator wrote each milestone's brief, reviewed the
  resulting work, and made the merge decisions throughout," in tension with the one independent record
  that exists: all nine merged PRs on this repository show `mergedBy: vladimir-mawla`, no bot or
  orchestrator identity anywhere.

Three of these five causes (2a, 3, and 4) originated in instructions or characterizations the orchestrator
gave the fixing agent while directing the repair, not in anything the fixing agent constructed on its own.
Cause 2b was the fixing agent's own — a real, disclosed ADR limit restated more strongly than either the
ADR or the code actually supported. Cause 1 belongs to neither: the trailer misreading was written into
M9's original build commit, before any of the repair rounds above, so the fixing agent inherited it rather
than constructed it.

Rounds 6 and 7 were reviews of this paragraph itself. Round 6 rejected it for presenting the four
rejections above as one cause each, when round 2 had carried two and round 4's cause was missing
altogether. Round 7 rejected the correction for attributing the first cause to the agent that repaired
the document rather than the one that wrote it — a distinction the commit graph settles and the
two-party framing had no room for. Round 8 approved.

That is where this account stops, and the stopping point is a choice rather than a natural end: each
attempt to record the review honestly was itself reviewed, and twice found wanting. The count above is
the count at merge. A reader who wants the rounds in full has them in PR #10's thread rather than in a
number that grows every time someone writes it down.

This is not the process working as intended. It is a documentation milestone — about not making claims
the repository can't support — that took eight rounds to stop making claims the repository couldn't
support, stated here plainly rather than folded quietly into the "one reject in nine" figure above, which
it is not part of. No round's approval covered the sentences describing it; each was written after the
approval it reports, this one included.

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
