import { describe, expect, it } from "vitest";
import type { Action } from "../action.js";
import type {
  AskDecision,
  Decision,
  DeferDecision,
  EscalateDecision,
  RefuseDecision,
} from "../decision.js";
import { assertNeverOutcome } from "../decision.js";
import type { Confidence } from "../confidence.js";
import { parseCostOfBeingWrong } from "../../cost-model/cost.js";

function fixtureAction(): Action {
  const cost = parseCostOfBeingWrong(500);
  if (!cost.ok) throw new Error("fixture cost should be valid");
  return {
    domain: "test",
    type: "test-action",
    parameters: {},
    costOfBeingWrong: cost.value,
    reversibility: "reversible-with-cost",
  };
}

describe("Decision discriminated union — compile-time obligations", () => {
  it("execute carries both the confidence reached and the bar it had to clear", () => {
    const decision: Decision = {
      outcome: "execute",
      action: fixtureAction(),
      confidence: 0.9 as Confidence,
      confidenceBar: 0.8 as Confidence,
    };
    expect(decision.outcome).toBe("execute");
    if (decision.outcome === "execute") {
      expect(decision.confidence).toBeGreaterThanOrEqual(decision.confidenceBar);
    }
  });

  it("an ask WITHOUT a named fact does not compile", () => {
    const broken: AskDecision = {
      outcome: "ask",
      action: fixtureAction(),
      // @ts-expect-error — MissingFact requires `fact`; this object omits it.
      missing: { kind: "fact", counterparty: "requester" },
    };
    void broken;
  });

  it("a defer WITHOUT something to wait for does not compile", () => {
    const broken: DeferDecision = {
      outcome: "defer",
      action: fixtureAction(),
      // @ts-expect-error — MissingTime requires `waitingOn`; this object omits it.
      missing: { kind: "time", reconsiderAt: "2026-10-01T00:00:00Z" },
    };
    void broken;
  });

  it("an escalate WITHOUT a reason does not compile", () => {
    const broken: EscalateDecision = {
      outcome: "escalate",
      action: fixtureAction(),
      // @ts-expect-error — MissingJudgment requires `reason`; this object omits it.
      missing: { kind: "human-judgment" },
    };
    void broken;
  });

  it("a refuse WITHOUT a reason does not compile", () => {
    // @ts-expect-error — RefuseDecision.reason is required; this object omits it.
    const broken: RefuseDecision = {
      outcome: "refuse",
      action: fixtureAction(),
    };
    void broken;
  });

  it("the five outcomes are mutually exclusive variants of one discriminated union — never a bare boolean or string", () => {
    const decisions: readonly Decision[] = [
      {
        outcome: "execute",
        action: fixtureAction(),
        confidence: 0.9 as Confidence,
        confidenceBar: 0.8 as Confidence,
      },
      {
        outcome: "ask",
        action: fixtureAction(),
        missing: { kind: "fact", fact: "shipping address", counterparty: "customer" },
      },
      {
        outcome: "defer",
        action: fixtureAction(),
        missing: {
          kind: "time",
          waitingOn: "the disputed charge to settle",
          reconsiderAt: "2026-10-01T00:00:00Z",
        },
      },
      {
        outcome: "escalate",
        action: fixtureAction(),
        missing: {
          kind: "human-judgment",
          reason: "cost of being wrong exceeds what any confidence level could justify",
        },
      },
      {
        outcome: "refuse",
        action: fixtureAction(),
        reason: "action is categorically disallowed regardless of confidence",
      },
    ];

    for (const decision of decisions) {
      // Exhaustive switch over the five known outcomes. If a sixth outcome
      // were ever added to the Decision union without a case here, TS would
      // narrow the `default` branch to something other than `never` and
      // fail to compile — that's the "no bare string outcome" guarantee
      // made mechanically checkable rather than asserted in prose.
      switch (decision.outcome) {
        case "execute":
        case "ask":
        case "defer":
        case "escalate":
        case "refuse":
          break;
        default:
          assertNeverOutcome(decision);
      }
    }

    expect(decisions).toHaveLength(5);
    expect(new Set(decisions.map((d) => d.outcome)).size).toBe(5);
  });

  it("ask, defer and escalate each name a differently-shaped missing thing", () => {
    const ask: Decision = {
      outcome: "ask",
      action: fixtureAction(),
      missing: { kind: "fact", fact: "the customer's order number", counterparty: "customer" },
    };
    const defer: Decision = {
      outcome: "defer",
      action: fixtureAction(),
      missing: { kind: "time", waitingOn: "a 24h cooldown", reconsiderAt: "2026-09-20T00:00:00Z" },
    };
    const escalate: Decision = {
      outcome: "escalate",
      action: fixtureAction(),
      missing: {
        kind: "human-judgment",
        reason: "irreversible harm at this cost is not something any confidence level can authorize",
      },
    };

    if (ask.outcome === "ask") expect(ask.missing.kind).toBe("fact");
    if (defer.outcome === "defer") expect(defer.missing.kind).toBe("time");
    if (escalate.outcome === "escalate") expect(escalate.missing.kind).toBe("human-judgment");

    // The three `kind` tags are pairwise distinct — this is what keeps ask/
    // defer/escalate from collapsing back into one undifferentiated bucket.
    const kinds = [
      ask.outcome === "ask" ? ask.missing.kind : null,
      defer.outcome === "defer" ? defer.missing.kind : null,
      escalate.outcome === "escalate" ? escalate.missing.kind : null,
    ];
    expect(new Set(kinds).size).toBe(3);
  });
});
