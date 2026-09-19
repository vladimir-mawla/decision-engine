import { describe, expect, it } from "vitest";
import { decide } from "../../decide/index.js";
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
    const input = fixtureInput({
      requirements: [fixtureRequirement({ minConfidence: 0.1 })],
      signals: [fixtureSignal({ id: "strong-1", confidence: 0.95 })],
    });
    const decision = decide(input);
    const rule = deriveRule(input);

    expect(decision.outcome).toBe("execute");
    expect(rule.kind).toBe("confidence-bar");
    if (rule.kind === "confidence-bar") {
      expect(rule.cleared).toBe(true);
      expect(rule.limitingSignalId).toBe("strong-1");
    }
  });

  it("escalate: confidence-bar rule reports cleared=false when the aggregate doesn't clear requiredConfidence", () => {
    const input = fixtureInput({
      requirements: [fixtureRequirement({ minConfidence: 0.1 })],
      signals: [fixtureSignal({ id: "weak-2", confidence: 0.5 })],
      action: sampleActionForBar(),
    });
    const decision = decide(input);
    const rule = deriveRule(input);
    expect(decision.outcome).toBe("escalate");
    expect(rule.kind).toBe("confidence-bar");
    if (rule.kind === "confidence-bar") {
      expect(rule.cleared).toBe(false);
    }
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
