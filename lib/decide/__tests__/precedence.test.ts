import { describe, expect, it } from "vitest";
import { decide } from "../decide.js";
import { gapPrecedenceRank, precedenceRank, selectWinningGap } from "../precedence.js";
import type { Gap } from "../../signals/gap.js";
import type { Supplier } from "../../signals/requirement.js";
import { fixtureInput, fixtureRequirement, fixtureSignal } from "./fixtures.js";

function absentGap(supplier: Supplier): Gap {
  return { reason: "absent", requirement: fixtureRequirement({ supplier }), supplier };
}

function constraintViolatedGap(): Gap {
  const requirement = fixtureRequirement({
    signalKind: "fraud.assessment",
    valueConstraint: { op: "equals", value: "clear" },
  });
  return {
    reason: "constraint-violated",
    requirement,
    signal: fixtureSignal({ kind: "fraud.assessment", value: "fraudulent" }),
    constraint: { op: "equals", value: "clear" },
    evaluation: { satisfied: false, reason: "violated" },
  };
}

/**
 * DECISION 1 — precedence among simultaneous gaps: human > counterparty >
 * time. Every pairing gets its own test, plus the three-way tie-break and
 * an end-to-end proof through decide() itself (not just the unit).
 */
describe("selectWinningGap — DECISION 1 precedence, human > counterparty > time", () => {
  it("ranks are strictly ordered: human < counterparty < time", () => {
    expect(precedenceRank("human")).toBeLessThan(precedenceRank("counterparty"));
    expect(precedenceRank("counterparty")).toBeLessThan(precedenceRank("time"));
  });

  it("human beats counterparty", () => {
    const human = absentGap({ kind: "human", reason: "needs sign-off" });
    const counterparty = absentGap({ kind: "counterparty", party: "customer" });
    expect(selectWinningGap([counterparty, human])).toBe(human);
    expect(selectWinningGap([human, counterparty])).toBe(human);
  });

  it("human beats time", () => {
    const human = absentGap({ kind: "human", reason: "needs sign-off" });
    const time = absentGap({ kind: "time", waitingOn: "a cooldown" });
    expect(selectWinningGap([time, human])).toBe(human);
    expect(selectWinningGap([human, time])).toBe(human);
  });

  it("counterparty beats time", () => {
    const counterparty = absentGap({ kind: "counterparty", party: "customer" });
    const time = absentGap({ kind: "time", waitingOn: "a cooldown" });
    expect(selectWinningGap([time, counterparty])).toBe(counterparty);
    expect(selectWinningGap([counterparty, time])).toBe(counterparty);
  });

  it("all three at once: human wins regardless of array order", () => {
    const human = absentGap({ kind: "human", reason: "needs sign-off" });
    const counterparty = absentGap({ kind: "counterparty", party: "customer" });
    const time = absentGap({ kind: "time", waitingOn: "a cooldown" });
    expect(selectWinningGap([time, counterparty, human])).toBe(human);
    expect(selectWinningGap([human, counterparty, time])).toBe(human);
    expect(selectWinningGap([counterparty, human, time])).toBe(human);
  });

  it("ties within the same supplier kind break by first occurrence, deterministically", () => {
    const first = absentGap({ kind: "counterparty", party: "alice" });
    const second = absentGap({ kind: "counterparty", party: "bob" });
    expect(selectWinningGap([first, second])).toBe(first);
    expect(selectWinningGap([second, first])).toBe(second);
  });

  it("empty gaps list has no winner", () => {
    expect(selectWinningGap([])).toBeNull();
  });
});

/**
 * DECISION 7 (`.genesis/decisions/0004-value-constraints.md`) —
 * `constraint-violated` outranks all three supplier kinds, including
 * `human`. `gapPrecedenceRank` is the superset ranking function
 * `selectWinningGap` actually uses; `precedenceRank` itself (the 3-way
 * supplier ordering above) is untouched.
 */
describe("gapPrecedenceRank / selectWinningGap — DECISION 7, constraint-violated outranks every supplier kind", () => {
  it("constraint-violated ranks strictly ahead of human", () => {
    expect(gapPrecedenceRank(constraintViolatedGap())).toBeLessThan(precedenceRank("human"));
  });

  it("beats human", () => {
    const rejection = constraintViolatedGap();
    const human = absentGap({ kind: "human", reason: "needs sign-off" });
    expect(selectWinningGap([human, rejection])).toBe(rejection);
    expect(selectWinningGap([rejection, human])).toBe(rejection);
  });

  it("beats counterparty", () => {
    const rejection = constraintViolatedGap();
    const counterparty = absentGap({ kind: "counterparty", party: "customer" });
    expect(selectWinningGap([counterparty, rejection])).toBe(rejection);
    expect(selectWinningGap([rejection, counterparty])).toBe(rejection);
  });

  it("beats time", () => {
    const rejection = constraintViolatedGap();
    const time = absentGap({ kind: "time", waitingOn: "a cooldown" });
    expect(selectWinningGap([time, rejection])).toBe(rejection);
    expect(selectWinningGap([rejection, time])).toBe(rejection);
  });

  it("beats all three supplier kinds at once, regardless of array order", () => {
    const rejection = constraintViolatedGap();
    const human = absentGap({ kind: "human", reason: "needs sign-off" });
    const counterparty = absentGap({ kind: "counterparty", party: "customer" });
    const time = absentGap({ kind: "time", waitingOn: "a cooldown" });
    expect(selectWinningGap([time, counterparty, human, rejection])).toBe(rejection);
    expect(selectWinningGap([rejection, human, counterparty, time])).toBe(rejection);
  });
});

/**
 * End-to-end: decide() itself, given several simultaneously-unmet
 * requirements with different suppliers, produces the outcome the
 * precedence rule predicts — one test per pairing, per the milestone's
 * explicit requirement ("a test exists for each pairing").
 */
describe("decide() applies precedence end-to-end", () => {
  const humanReq = fixtureRequirement({
    signalKind: "compliance.sign-off",
    description: "a human compliance sign-off",
    supplier: { kind: "human", reason: "cross-border transfers always need a human sign-off" },
  });
  const counterpartyReq = fixtureRequirement({
    signalKind: "customer.order-number",
    description: "the customer's order number",
    supplier: { kind: "counterparty", party: "customer" },
  });
  const timeReq = fixtureRequirement({
    signalKind: "payment.settlement-status",
    description: "whether the disputed charge has settled",
    supplier: { kind: "time", waitingOn: "the disputed charge to settle" },
  });

  it("human + counterparty unmet at once -> escalate (human wins)", () => {
    const decision = decide(fixtureInput({ requirements: [counterpartyReq, humanReq], signals: [] }));
    expect(decision.outcome).toBe("escalate");
  });

  it("human + time unmet at once -> escalate (human wins)", () => {
    const decision = decide(fixtureInput({ requirements: [timeReq, humanReq], signals: [] }));
    expect(decision.outcome).toBe("escalate");
  });

  it("counterparty + time unmet at once -> ask (counterparty wins)", () => {
    const decision = decide(fixtureInput({ requirements: [timeReq, counterpartyReq], signals: [] }));
    expect(decision.outcome).toBe("ask");
  });

  it("all three unmet at once -> escalate (human wins over both)", () => {
    const decision = decide(
      fixtureInput({ requirements: [timeReq, counterpartyReq, humanReq], signals: [] }),
    );
    expect(decision.outcome).toBe("escalate");
  });
});
