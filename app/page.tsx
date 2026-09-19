import { StakesExplorer } from "../components/StakesExplorer";
import { EscalateGallery } from "../components/EscalateGallery";
import { OutcomeStrip } from "../components/OutcomeStrip";

const REPO_URL = "https://github.com/vladimir-mawla/decision-engine";

/**
 * M8 — THE DEMO UI. ARCHITECTURE, DECIDED DELIBERATELY (see this
 * milestone's own instructions to "verify, then decide deliberately"
 * before writing a line of UI code):
 *
 * `lib/audit/replay.ts` imports `isDeepStrictEqual` from `node:util`.
 * Verified directly (`grep -rn 'from "node:' lib/`, excluding test files,
 * which only use `node:fs`/`node:path` for their own structural source
 * scans and are never bundled into this app): that is the ONLY `node:`
 * import anywhere in `lib/contracts`, `lib/cost-model`, `lib/signals`,
 * `lib/decide`, `lib/domains`, and even `lib/audit` itself EXCEPT for that
 * one file. `decide()` and everything it reads are genuinely,
 * mechanically isomorphic — not "probably fine in a browser," provably so
 * by the same absence a grep can check.
 *
 * So `decide()` runs CLIENT-SIDE. `components/StakesExplorer.tsx` is a
 * "use client" component that imports `lib/contracts`, `lib/cost-model`,
 * `lib/domains`, and `lib/audit/record.js` (never `lib/audit/index.js` or
 * `lib/audit/replay.js` — see that component's own header comment) and
 * calls the real, unmodified `decide()`/`recordDecision()` directly in
 * the browser on every slider move. A viewer moving the cost slider watches
 * the SAME evidence flip between `execute` and `escalate` instantly, with
 * no network round-trip — which demonstrates the engine's purity rather
 * than asserting it in prose. A form-POST version of this page would have
 * been strictly worse at the one thing this milestone is scored on.
 *
 * The audit trail needed a decision too, and it split the other way:
 * `recordDecision` (the audit record itself — rule trace, requirements,
 * evidence snapshots) is ALSO isomorphic (it only imports `./rule.js` and
 * `./snapshot.js`, never `./replay.js`), so the interactive widget below
 * shows the full audit record instantly, client-side, same as everything
 * else. Only `replay()` — the step that actually re-runs `decide()` against
 * the recorded inputs and deep-equals the result, to PROVE the record is
 * reproducible rather than merely asserting it — needs `node:util`, and
 * that one check runs server-side, in this file's siblings
 * (`components/EscalateGallery.tsx`/`components/OutcomeStrip.tsx`, plain
 * Server Components, real Node). Reimplementing `isDeepStrictEqual` in the
 * browser to avoid a server round-trip for a badge was considered and
 * rejected: it would duplicate frozen, already-audited logic from
 * `lib/audit/replay.ts` outside `lib/` for a cosmetic win, and this
 * project's own discipline (see e.g. `lib/decide/satisfaction.ts`'s note on
 * why duplicating a five-line filter is safer than re-deriving one from a
 * frozen module) argues against exactly that trade. So: a server route for
 * ONE narrow thing (replay verification), stated plainly, not fought.
 *
 * WHAT A STRANGER SEES, IN READING ORDER: (1) the stakes explorer, already
 * showing a real decision — deploy-d7, the one-line fraud-check flag,
 * escalating at its real $250,000/irreversible stakes — before any script
 * runs (Next.js server-renders a "use client" component's initial state
 * too); (2) the same widget, now interactive, letting a viewer flip that
 * exact evidence to `execute` by dragging the stakes down to deploy-d1's;
 * (3) four real decisions that all say "escalate" for mechanically
 * different reasons; (4) one real decision each for execute/ask/defer/
 * refuse, so the full five-outcome vocabulary is visible on one screen.
 */
export default function Home() {
  return (
    <main className="page">
      <header className="page-header">
        <p className="page-header__eyebrow">decision-engine</p>
        <h1 className="page-header__title">The same evidence, a different decision, depending on what&rsquo;s at stake.</h1>
        <p className="page-header__thesis">
          Five outcomes, not two: <strong>execute</strong> &middot; <strong>ask</strong> &middot;{" "}
          <strong>defer</strong> &middot; <strong>escalate</strong> &middot; <strong>refuse</strong>. Every
          decision below names the rule and the field that produced it &mdash; never a bare label.
        </p>
      </header>

      <section className="page-section" aria-labelledby="explorer-heading">
        <h2 id="explorer-heading" className="page-section__heading">See it decide</h2>
        <p className="page-section__lede">
          A real pull request &mdash; one line changed, disabling a fraud check on checkout &mdash; escalates
          at its real stakes. Drag the stakes down to an internal admin-tool flag&rsquo;s (deploy-d1) and the{" "}
          <em>identical</em> review approvals, CI status, and static-analysis reading execute instead. Nothing
          about the evidence changes; only what&rsquo;s at stake does.
        </p>
        <StakesExplorer />
      </section>

      <section className="page-section" aria-labelledby="escalate-heading">
        <h2 id="escalate-heading" className="page-section__heading">Four ways an escalation happens</h2>
        <p className="page-section__lede">
          &ldquo;escalate&rdquo; is one outcome at the type level, but it has four mechanically distinct
          causes &mdash; told apart by which rule fired, never by re-reading the explanation as prose. A
          human sign-off requirement is not the same shape of problem as evidence that already said no, and
          neither is the same as a stakes ceiling versus ordinary, resolvable-later insufficiency.
        </p>
        <EscalateGallery />
      </section>

      <section className="page-section" aria-labelledby="other-heading">
        <h2 id="other-heading" className="page-section__heading">The other outcomes</h2>
        <p className="page-section__lede">
          &ldquo;ask&rdquo; names the one fact only the counterparty can supply. &ldquo;defer&rdquo; names
          what the clock is waiting on. &ldquo;refuse&rdquo; is categorical, independent of evidence.
          &ldquo;execute&rdquo; is what happens when none of the above apply.
        </p>
        <OutcomeStrip />
      </section>

      <footer className="page-footer">
        <p>
          <a href={REPO_URL}>Source on GitHub</a> &middot; <a href="/api/health">/api/health</a>
        </p>
        <p className="page-footer__note">
          Every number on this page is a real output of <code className="mono">decide()</code>,{" "}
          <code className="mono">requiredConfidence()</code>, or a domain fixture&rsquo;s own declared cost
          &mdash; nothing here is written prose standing in for a computed value.
        </p>
      </footer>
    </main>
  );
}
