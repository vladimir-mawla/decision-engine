# Wiki Index — decision-engine

The project knowledge base. Same schema as the agentic-swe-kit wiki: concept pages in `concepts/`,
each with frontmatter and >=2 `[[wikilinks]]`. The L3 RESEARCH loop writes here; G0 reads here first.

> **Read this file before any milestone (G0 step 1).** Pick candidate pages by name-matching the
> milestone's nouns, then drill in. The wiki is what prevents rebuilding work that already exists.

## Entities (the things this system has)
<!-- - [[concepts/Action]] — the proposed action + context the engine is asked to decide on -->
<!-- - [[concepts/Signal]] — a piece of typed evidence carrying provenance, freshness, and confidence -->
<!-- - [[concepts/Decision]] — the five-outcome discriminated union the engine returns -->
<!-- - [[concepts/MissingInformation]] — the named fact/wait-condition/human-owned-gap behind ask/defer/escalate -->
<!-- - [[concepts/CostModel]] — the reversibility x cost table that sets the required-confidence bar -->
<!-- - [[concepts/AuditRecord]] — the replayable record of a decision's inputs, signals, rule, and outcome -->
<!-- - [[concepts/Domain]] — a data adapter (refund-approval, code-deploy, content-moderation) feeding the one engine -->

## Concepts (how it works)
<!-- - [[concepts/RequiredConfidence]] — requiredConfidence(reversibility, cost), never a fixed constant -->
<!-- - [[concepts/Rule]] — the named rule that fired to produce a Decision, never a bare outcome -->
<!-- - [[concepts/Replay]] — decide(record.inputs) reproducing record.outcome -->

## Sources (research distilled by L3)
<!-- - [[concepts/<source-slug>]] — one-line summary | filed <date> -->

## Seeded from agentic-swe-kit
Relevant global concept pages for this project's phases (pointers only — read on demand). Every path
below was verified with `test -f` against `/Users/vlad/.agentic-swe-kit/wiki` before being written here:

- $AGENTIC_SWE_WIKI_ROOT/pragmatic-programmer/concepts/Design-by-Contract.md — when defining the `Decision`
  type and the five-outcome discriminated union in M1, so every outcome carries an explicit, checkable
  contract instead of a bare string or boolean.
- $AGENTIC_SWE_WIKI_ROOT/pragmatic-programmer/concepts/Reversibility.md — when building the reversibility x
  cost model in M1 that sets the required-confidence bar (the asymmetry: a reversible $5 action at 60%
  confidence executes, an irreversible $50,000 action at 95% escalates).
- $AGENTIC_SWE_WIKI_ROOT/release-it/concepts/Design-for-Production.md — when deploying the live skeleton in
  M2, second deliberately, so the public URL exists before anything else is built on top of it.
- $AGENTIC_SWE_WIKI_ROOT/pragmatic-programmer/concepts/Dead-Programs-Tell-No-Lies.md — when modelling
  missing or stale signals in M3 as an explicit, surfaced failure rather than letting a silently-defaulted
  value flow undetected into a decision.
- $AGENTIC_SWE_WIKI_ROOT/clean-architecture/concepts/Business-Rules.md — when writing the decision engine
  in M4 so the outcome rules stay independent of any one domain's details.
- $AGENTIC_SWE_WIKI_ROOT/clean-architecture/concepts/Policy-vs-Details-Separation-Decompose-every-system-into-high-level-policy-busin.md
  — when wiring the three domains in M6 as thin data adapters over the one shared decision policy, not
  three separate re-implementations of it.
- $AGENTIC_SWE_WIKI_ROOT/release-it/concepts/Transparency-and-Observability.md — when building the audit
  trail in M5 so every decision's reasoning is inspectable after the fact, not just its outcome.
- $AGENTIC_SWE_WIKI_ROOT/llmops-ai-agents/concepts/Autonomous-Action-Agents.md — when writing the cognitive
  design's autonomy level (execute is autonomous, but only inside the bar the cost model sets; the other
  four outcomes deliberately hand control elsewhere).
- $AGENTIC_SWE_WIKI_ROOT/llmops-ai-agents/concepts/Financial-Security-Controls.md — when building the
  refund-approval domain's realistic synthetic data and risk bands in M6.
- $AGENTIC_SWE_WIKI_ROOT/llmops-ai-agents/concepts/Domain-Tech-Finance-Healthcare.md — when building the
  code-deploy domain's realistic synthetic data (diffs, blast radius, rollback cost) in M6.
- $AGENTIC_SWE_WIKI_ROOT/release-it/concepts/Fail-Fast.md — when deciding that a signal missing provenance
  or past its freshness threshold fails toward ask/defer/escalate rather than executing on an optimistic
  default (M3, M7).
- $AGENTIC_SWE_WIKI_ROOT/security-engineering/concepts/Threat-Modeling.md — when designing the deliberate
  failure test in M7 that is built specifically to break the engine, and writing down what actually happens
  when it does.
- $AGENTIC_SWE_WIKI_ROOT/clean-architecture/concepts/Humble-Object-Pattern.md — when building the demo UI
  in M8 as a thin renderer of the decision the engine already computed, not a place where any decision
  logic sneaks in.
