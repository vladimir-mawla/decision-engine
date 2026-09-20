# 90-second walkthrough script

Built around the deployed demo page (`/` — once M2/M8's Vercel deploy is live; the same script works
identically against `npm run dev` locally in the meantime, since the widgets run client-side and read no
network state either way). One continuous take, no cuts needed. Timings sum to ~90 seconds; treat them as a
budget, not a stopwatch requirement — pause a beat longer on the flip in Beat 3 if that's the one moment
worth letting land.

| # | Time | What to click / point at | What to say |
|---|------|---------------------------|--------------|
| 1 | 0:00–0:08 (8s) | Load the page. Let the header sit on screen for a second before talking. | "This is a decision layer with five outcomes, not two — execute, ask, defer, escalate, refuse. Every decision it makes names exactly why." |
| 2 | 0:08–0:21 (13s) | Point at the Stakes Explorer, already showing **D7**. Point specifically at the new Diff / Review approvals tile under the sliders. | "This is a real case: PR #5402. The diff and approvals are right there on screen — one line, one file, two approvals — plus CI green and static analysis 90% confident. By every normal measure of a code change, this looks small and safe. The engine escalates it anyway — $250,000 cost of being wrong, irreversible." |
| 3 | 0:21–0:41 (20s) — **the climax** | Click the **D1** preset button (top-left of the widget). Watch the card flip live — outcome badge, confidence, audit trail, all update instantly — while the Diff / Review approvals tile stays exactly where it was. | "Now watch. I'm not changing the evidence at all — look, the diff and approval numbers on screen don't move: still one line, one file, two approvals. I'm only changing what's *at stake*: D1 is an internal admin-tool flag toggle, $800, reversible in an instant. Same shape of evidence — the engine executes it immediately. The evidence didn't get better. The stakes got smaller. That's the whole thesis of this project in one click." |
| 4 | 0:41–0:48 (7s) | Click back to **D7** once, so the page is left on the more interesting case. | "And flipping back — same evidence, different stakes, different answer. Deterministically, every time." |
| 5 | 0:48–1:03 (15s) | Scroll to "Four ways an escalation happens" (the Escalate Gallery). Point at the four distinct cards. | "'Escalate' isn't one thing. Here are four real decisions that all say escalate, for four mechanically different reasons: a human sign-off that's required no matter what the evidence says, evidence that already said no, a cost ceiling that more evidence can't move, and an ordinary gap that better evidence still could close. The engine tells these apart by which rule fired — never by re-reading a sentence." |
| 6 | 1:03–1:16 (13s) | Scroll to "The other outcomes" strip. Point at each of the four cards in turn (execute / ask / defer / refuse). | "And the other four outcomes, each a real decision: ask names the one fact only the requester can supply; defer names what the clock is waiting on; refuse is categorical — it fires before the engine even looks at the evidence." |
| 7 | 1:16–1:26 (10s) | Point at the audit trail section on any card — the rule trace and the "verified by replay" note. | "Every one of these carries a full audit trail: the exact rule that fired, and proof that replaying the same recorded inputs reproduces the same answer." |
| 8 | 1:26–1:31 (5s) | Scroll to the footer; point at the repo link. | "Nothing on this page is written prose standing in for a number — it's all a real output of the engine itself. Source's on GitHub." |

**Total: ~91 seconds** (was ~90s; Beats 2 and 3 each grew by roughly a second so the script can point at
the new Diff / Review approvals tile instead of only asserting its content in prose — every later beat's
start time shifted by the same one second). The one line worth protecting if time runs short is Beat 3's:
*"I'm not changing the evidence — look, the diff and approval numbers on screen don't move."* That is the
single sentence a judge should walk away remembering, now with an on-screen number backing it instead of
narration alone.
