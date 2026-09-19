# Two years out: the bottleneck moves to escalation

Decision layers will be standard. Every serious agent framework will ship something that returns
more than allow and deny, because the first production incident teaches you that "execute" and
"refuse" are the two easy cases and almost nothing real is either.

Three things will decide whether they work.

**Calibrated confidence becomes the scarce input.** Every architecture like this one assumes a
signal knows how sure it is. Almost nothing produces honest confidence today — models are
overconfident, and most upstream systems report a number never validated against outcomes. A
decision layer is a function of its inputs, and the industry has spent its effort on the function.
Expect the interesting work to move to whether a 0.9 means anything.

**Escalation is a budget, not an escape hatch.** Routing every uncertain case to a human is
correct and unaffordable. At any real volume the humans become the queue, and a system that
escalates 15% of decisions is worse than useless — it is the manual process, slower. Nobody is yet
modelling how much human judgment a decision layer may consume, or what it should do when that
budget is spent.

**Reversibility is the highest-leverage variable, and it is an engineering choice.** If required
confidence scales with how hard something is to undo, then the best way to improve decisions is
not a better model — it is making more actions undoable. A staged deploy, a held payment, a soft
delete. Two years out, the teams that win will have spent their effort lowering the bar rather
than clearing it.

The decision layer is not where the intelligence goes. It is where you find out how much of it you
actually have.
