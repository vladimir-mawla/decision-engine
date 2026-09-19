# 90-second walkthrough script

Built around the deployed demo page (`/` — once M2/M8's Vercel deploy is live; the same script works
identically against `npm run dev` locally in the meantime, since the widgets run client-side and read no
network state either way). One continuous take, no cuts needed. Timings sum to ~90 seconds; treat them as a
budget, not a stopwatch requirement — pause a beat longer on the flip in Beat 3 if that's the one moment
worth letting land.

| # | Time | What to click / point at | What to say |
|---|------|---------------------------|--------------|
| 1 | 0:00–0:08 (8s) | Load the page. Let the header sit on screen for a second before talking. | "This is a decision layer with five outcomes, not two — execute, ask, defer, escalate, refuse. Every decision it makes names exactly why." |
| 2 | 0:08–0:20 (12s) | Point at the Stakes Explorer, already showing **D7** — a real pull request, one line changed, disabling a fraud check on checkout. | "This is a real case: PR #5402, one line changed. Two approvals, CI green, static analysis 90% confident. By every normal measure of a code change, this looks small and safe. The engine escalates it anyway — $250,000 cost of being wrong, irreversible." |
| 3 | 0:20–0:40 (20s) — **the climax** | Click the **D1** preset button (top-left of the widget). Watch the card flip live — outcome badge, confidence, audit trail, all update instantly, no page reload. | "Now watch. I'm not changing the evidence at all — same review approvals, same CI status, same static-analysis reading. I'm only changing what's *at stake*: D1 is an internal admin-tool flag toggle, $800, reversible in an instant. Same shape of evidence — the engine executes it immediately. The evidence didn't get better. The stakes got smaller. That's the whole thesis of this project in one click." |
| 4 | 0:40–0:47 (7s) | Click back to **D7** once, so the page is left on the more interesting case. | "And flipping back — same evidence, different stakes, different answer. Deterministically, every time." |
| 5 | 0:47–1:02 (15s) | Scroll to "Four ways an escalation happens" (the Escalate Gallery). Point at the four distinct cards. | "'Escalate' isn't one thing. Here are four real decisions that all say escalate, for four mechanically different reasons: a human sign-off that's required no matter what the evidence says, evidence that already said no, a cost ceiling that more evidence can't move, and an ordinary gap that better evidence still could close. The engine tells these apart by which rule fired — never by re-reading a sentence." |
| 6 | 1:02–1:15 (13s) | Scroll to "The other outcomes" strip. Point at each of the four cards in turn (execute / ask / defer / refuse). | "And the other four outcomes, each a real decision: ask names the one fact only the requester can supply; defer names what the clock is waiting on; refuse is categorical — it fires before the engine even looks at the evidence." |
| 7 | 1:15–1:25 (10s) | Point at the audit trail section on any card — the rule trace and the "verified by replay" note. | "Every one of these carries a full audit trail: the exact rule that fired, and proof that replaying the same recorded inputs reproduces the same answer." |
| 8 | 1:25–1:30 (5s) | Scroll to the footer; point at the repo link. | "Nothing on this page is written prose standing in for a number — it's all a real output of the engine itself. Source's on GitHub." |

**Total: ~90 seconds.** The one line worth protecting if time runs short is Beat 3's: *"I'm not changing
the evidence — I'm only changing what's at stake."* That is the single sentence a judge should walk away
remembering.
