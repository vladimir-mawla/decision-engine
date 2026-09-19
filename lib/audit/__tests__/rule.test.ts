import { describe, expect, it } from "vitest";
import { aggregateConfidence, decide, isBarSaturated } from "../../decide/index.js";
import { requiredConfidence } from "../../cost-model/requiredConfidence.js";
import { deriveRule } from "../rule.js";
import { fixtureInput, fixtureRequirement, fixtureSignal, generateInput, mulberry32, sampleAction } from "./fixtures.js";

/** irreversible + expensive => a high requiredConfidence bar that 0.5 confidence will not clear. */
function sampleActionForBar() {
  return sampleAction({ reversibility: "irreversible", cost: 100_000 });
}

describe("deriveRule — names the exact rule, agreeing with decide()'s own branch", () => {
  it("refuse: names the matched prohibition's id and reason", () => {
    const input = fixtureInput({
      prohibitions: [{ id: "frozen-account", reason: "account is frozen", matches: () => true }],
    });
    const decision = decide(input);
    const rule = deriveRule(input);

    expect(decision.outcome).toBe("refuse");
    expect(rule).toEqual({ kind: "prohibition", prohibitionId: "frozen-account", reason: "account is frozen" });
  });

  it("ask: names the gap, its supplier kind, and the requirement's signalKind (no signal present, so signalId is null)", () => {
    const input = fixtureInput({
      requirements: [fixtureRequirement({ signalKind: "order.number", supplier: { kind: "counterparty", party: "customer" } })],
      signals: [],
    });
    const decision = decide(input);
    const rule = deriveRule(input);

    expect(decision.outcome).toBe("ask");
    expect(rule).toEqual({
      kind: "gap",
      gapReason: "absent",
      supplierKind: "counterparty",
      requirementSignalKind: "order.number",
      signalId: null,
    });
  });

  it("defer: gap reason is stale (a real, too-old signal exists and is named)", () => {
    const staleSignal = fixtureSignal({
      id: "stale-1",
      kind: "price.settlement",
      capturedAtIso: new Date(Date.parse("2026-09-19T12:00:00.000Z") - 48 * 60 * 60 * 1000).toISOString(),
    });
    const input = fixtureInput({
      requirements: [fixtureRequirement({ signalKind: "price.settlement", supplier: { kind: "time", waitingOn: "settlement" } })],
      signals: [staleSignal],
    });
    const decision = decide(input);
    const rule = deriveRule(input);

    expect(decision.outcome).toBe("defer");
    expect(rule).toEqual({
      kind: "gap",
      gapReason: "stale",
      supplierKind: "time",
      requirementSignalKind: "price.settlement",
      signalId: "stale-1",
    });
  });

  it("escalate via human gap: names the gap and its signalId (below-confidence)", () => {
    const weakSignal = fixtureSignal({ id: "weak-1", kind: "compliance.review", confidence: 0.3 });
    const input = fixtureInput({
      requirements: [
        fixtureRequirement({ signalKind: "compliance.review", minConfidence: 0.9, supplier: { kind: "human", reason: "needs a human" } }),
      ],
      signals: [weakSignal],
    });
    const decision = decide(input);
    const rule = deriveRule(input);

    expect(decision.outcome).toBe("escalate");
    expect(rule).toEqual({
      kind: "gap",
      gapReason: "below-confidence",
      supplierKind: "human",
      requirementSignalKind: "compliance.review",
      signalId: "weak-1",
    });
  });

  it("no-requirements: decide() escalates, rule says why", () => {
    const input = fixtureInput({ requirements: [] });
    const decision = decide(input);
    const rule = deriveRule(input);

    expect(decision.outcome).toBe("escalate");
    expect(rule).toEqual({ kind: "no-requirements" });
  });

  it("execute: confidence-bar rule names the limiting signal and reports cleared=true", () => {
    const action = sampleAction();
    const requirements = [fixtureRequirement({ minConfidence: 0.1 })];
    const signals = [fixtureSignal({ id: "strong-1", confidence: 0.95 })];
    const input = fixtureInput({ action, requirements, signals });
    const decision = decide(input);
    const rule = deriveRule(input);

    expect(decision.outcome).toBe("execute");
    expect(rule.kind).toBe("confidence-bar");
    if (rule.kind === "confidence-bar") {
      expect(rule.cleared).toBe(true);
      expect(rule.limitingSignalId).toBe("strong-1");

      // SWEEP FINDING (see this milestone's audit fix report):
      // `saturated`/`bar`/`aggregate` were never asserted anywhere in
      // this file — a mutation hardcoding `saturated: false, bar: 0,
      // aggregate: 0` in rule.ts's confidence-bar branch survived all 63
      // audit tests before these three lines existed. Computed here via
      // the SAME public, pure building blocks `deriveRule` itself calls
      // (never reimplemented — same discipline as this describe block's
      // own header comment), so this checks deriveRule's WIRING to those
      // functions, not a reimplementation of their math.
      const expectedAggregate = aggregateConfidence(requirements, signals, input.now);
      expect(expectedAggregate).not.toBeNull();
      if (expectedAggregate !== null) {
        expect(rule.aggregate).toBe(expectedAggregate.confidence);
      }
      expect(rule.bar).toBeCloseTo(requiredConfidence(action.reversibility, action.costOfBeingWrong), 10);
      expect(rule.saturated).toBe(isBarSaturated(action));
    }
  });

  it("escalate: confidence-bar rule reports cleared=false when the aggregate doesn't clear requiredConfidence", () => {
    const action = sampleActionForBar();
    const requirements = [fixtureRequirement({ minConfidence: 0.1 })];
    const signals = [fixtureSignal({ id: "weak-2", confidence: 0.5 })];
    const input = fixtureInput({ requirements, signals, action });
    const decision = decide(input);
    const rule = deriveRule(input);
    expect(decision.outcome).toBe("escalate");
    expect(rule.kind).toBe("confidence-bar");
    if (rule.kind === "confidence-bar") {
      expect(rule.cleared).toBe(false);

      // Same sweep-finding fields as the previous test, checked here too
      // — a hardcoded `saturated`/`bar`/`aggregate` would otherwise be
      // just as undetectable on the escalate branch as on the execute one.
      const expectedAggregate = aggregateConfidence(requirements, signals, input.now);
      expect(expectedAggregate).not.toBeNull();
      if (expectedAggregate !== null) {
        expect(rule.aggregate).toBe(expectedAggregate.confidence);
      }
      expect(rule.bar).toBeCloseTo(requiredConfidence(action.reversibility, action.costOfBeingWrong), 10);
      expect(rule.saturated).toBe(isBarSaturated(action));
    }
  });

  it("escalate via a value rejection: its own `value-rejected` RuleTrace kind, not `gap` — names the constraint but never the raw value", () => {
    const signal = fixtureSignal({ id: "fraud-1", kind: "fraud.assessment", value: "fraudulent — do not disclose this", confidence: 0.95 });
    const requirement = fixtureRequirement({
      signalKind: "fraud.assessment",
      valueConstraint: { op: "equals", value: "clear" },
      supplier: { kind: "human", reason: "should never be reached — value-rejected pre-empts supplier dispatch" },
    });
    const input = fixtureInput({ requirements: [requirement], signals: [signal] });
    const decision = decide(input);
    const rule = deriveRule(input);

    expect(decision.outcome).toBe("escalate");
    expect(rule).toEqual({
      kind: "value-rejected",
      requirementSignalKind: "fraud.assessment",
      signalId: "fraud-1",
      constraint: { op: "equals", value: "clear" },
    });
    expect(JSON.stringify(rule)).not.toContain("do not disclose this");
  });

  it("value-rejected is mechanically distinguishable from confidence-bar escalates by `rule.kind` alone, without parsing prose", () => {
    const rejectionInput = fixtureInput({
      requirements: [
        fixtureRequirement({
          signalKind: "fraud.assessment",
          valueConstraint: { op: "equals", value: "clear" },
        }),
      ],
      signals: [fixtureSignal({ kind: "fraud.assessment", value: "fraudulent" })],
    });
    const barInput = fixtureInput({
      action: sampleActionForBar(),
      requirements: [fixtureRequirement({ minConfidence: 0.1 })],
      signals: [fixtureSignal({ confidence: 0.5 })],
    });

    expect(decide(rejectionInput).outcome).toBe("escalate");
    expect(decide(barInput).outcome).toBe("escalate");
    expect(deriveRule(rejectionInput).kind).toBe("value-rejected");
    expect(deriveRule(barInput).kind).toBe("confidence-bar");
  });

  it("property: across many generated cases, deriveRule's `kind` is always consistent with decide()'s outcome", () => {
    const rng = mulberry32(20260919);
    for (let i = 0; i < 300; i++) {
      const input = generateInput(rng, i);
      const decision = decide(input);
      const rule = deriveRule(input);

      if (decision.outcome === "input-rejected") continue; // not reachable from this generator anyway.

      switch (decision.outcome) {
        case "refuse":
          expect(rule.kind).toBe("prohibition");
          break;
        case "ask":
        case "defer":
          expect(rule.kind).toBe("gap");
          break;
        case "execute":
          expect(rule.kind === "confidence-bar" || rule.kind === "no-requirements").toBe(true);
          if (rule.kind === "confidence-bar") expect(rule.cleared).toBe(true);
          break;
        case "escalate":
          expect(["gap", "no-requirements", "confidence-bar", "internal-inconsistency", "internal-error"]).toContain(
            rule.kind,
          );
          if (rule.kind === "confidence-bar") expect(rule.cleared).toBe(false);
          break;
      }
    }
  });
});
