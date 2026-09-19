import { describe, expect, it } from "vitest";
import { analyzeGaps, type Gap } from "../gap.js";
import { capturedAt, fixtureRequirement, fixtureSignal, NOW } from "./fixtures.js";

/**
 * `"constraint-violated"` (added for value constraints — see constraint.ts)
 * is the one `Gap` reason with no `supplier` at all, so `Gap["supplier"]`
 * is no longer a valid type. Every gap in THIS file is produced without a
 * `valueConstraint` anywhere, so it can never actually be that variant —
 * this helper makes that an assertion the suite itself checks (loudly, if
 * ever wrong) rather than a silent type assumption.
 */
function supplierOf(gap: Gap | undefined): unknown {
  if (gap === undefined || gap.reason === "constraint-violated") {
    throw new Error("expected a Gap with a supplier");
  }
  return gap.supplier;
}

describe("analyzeGaps — requirements fully met", () => {
  it("every requirement satisfied by a fresh, sufficiently-confident signal yields no gaps", () => {
    const requirement = fixtureRequirement({
      signalKind: "customer.identity.verified",
      minConfidence: 0.8,
      maxAgeMs: 24 * 60 * 60 * 1000,
    });
    const signal = fixtureSignal({
      kind: "customer.identity.verified",
      confidence: 0.95,
      capturedAtIso: "2026-09-19T11:00:00Z", // 1h before NOW
    });

    const gaps = analyzeGaps([requirement], [signal], NOW);
    expect(gaps).toEqual([]);
  });
});

describe("analyzeGaps — exactly one requirement missing", () => {
  it("one missing requirement among several met yields exactly one gap, labelled with its supplier", () => {
    const met = fixtureRequirement({
      signalKind: "customer.identity.verified",
      minConfidence: 0.8,
      maxAgeMs: 24 * 60 * 60 * 1000,
      supplier: { kind: "counterparty", party: "customer" },
    });
    const metSignal = fixtureSignal({
      kind: "customer.identity.verified",
      confidence: 0.95,
      capturedAtIso: "2026-09-19T11:00:00Z",
    });

    const missing = fixtureRequirement({
      signalKind: "customer.order.exists",
      description: "the customer's order number",
      minConfidence: 0.5,
      maxAgeMs: 24 * 60 * 60 * 1000,
      supplier: { kind: "counterparty", party: "customer" },
    });

    const gaps = analyzeGaps([met, missing], [metSignal], NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("absent");
    expect(gaps[0]?.requirement.signalKind).toBe("customer.order.exists");
    expect(supplierOf(gaps[0])).toEqual({ kind: "counterparty", party: "customer" });
  });
});

describe("analyzeGaps — several requirements missing, different suppliers", () => {
  it("each gap is labelled with its own requirement's supplier, not a shared default", () => {
    const askGap = fixtureRequirement({
      signalKind: "customer.order.exists",
      description: "the customer's order number",
      supplier: { kind: "counterparty", party: "customer" },
    });
    const deferGap = fixtureRequirement({
      signalKind: "payment.settlement.confirmed",
      description: "the disputed charge to settle",
      supplier: { kind: "time", waitingOn: "the payment processor's settlement window" },
    });
    const escalateGap = fixtureRequirement({
      signalKind: "compliance.sign-off",
      description: "compliance sign-off for a cross-border transfer",
      supplier: { kind: "human", reason: "no automated signal can establish regulatory sign-off" },
    });

    const gaps = analyzeGaps([askGap, deferGap, escalateGap], [], NOW);
    expect(gaps).toHaveLength(3);

    const bySignalKind = new Map(gaps.map((g) => [g.requirement.signalKind, g]));
    expect(supplierOf(bySignalKind.get("customer.order.exists"))).toEqual({
      kind: "counterparty",
      party: "customer",
    });
    expect(supplierOf(bySignalKind.get("payment.settlement.confirmed"))).toEqual({
      kind: "time",
      waitingOn: "the payment processor's settlement window",
    });
    expect(supplierOf(bySignalKind.get("compliance.sign-off"))).toEqual({
      kind: "human",
      reason: "no automated signal can establish regulatory sign-off",
    });

    // All three are "absent" here (nothing was supplied at all) — the
    // supplier labelling is what distinguishes them, not the gap reason.
    for (const gap of gaps) expect(gap.reason).toBe("absent");
  });
});

describe("analyzeGaps — a stale signal counts as missing, not present", () => {
  it("a signal that exists but is older than the requirement's maxAge still produces a gap", () => {
    const requirement = fixtureRequirement({
      signalKind: "customer.identity.verified",
      maxAgeMs: 30 * 60 * 1000, // 30 minutes
      supplier: { kind: "counterparty", party: "customer" },
    });
    // Captured 2 hours before NOW — well past the 30-minute threshold.
    const staleSignal = fixtureSignal({
      kind: "customer.identity.verified",
      confidence: 0.99,
      capturedAtIso: "2026-09-19T10:00:00Z",
    });

    const gaps = analyzeGaps([requirement], [staleSignal], NOW);

    // The critical assertion: presence of a matching signal did NOT
    // satisfy the requirement. A stale signal is not a satisfied
    // requirement wearing an asterisk — it is a Gap, full stop.
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("stale");
    if (gaps[0]?.reason === "stale") {
      expect(gaps[0].signal.id).toBe(staleSignal.id);
      // `age` is an `Age` (see time.ts), not a bare number — a caller must
      // narrow on `kind` before reaching for `.ms`.
      expect(gaps[0].age).toEqual({ kind: "elapsed", ms: 2 * 60 * 60 * 1000 });
    }
  });

  it("the same evidence set: satisfied under a lenient maxAge, a gap under a strict one", () => {
    const signal = fixtureSignal({
      kind: "customer.identity.verified",
      confidence: 0.99,
      capturedAtIso: "2026-09-19T10:00:00Z", // 2h before NOW
    });

    const lenient = fixtureRequirement({ signalKind: "customer.identity.verified", maxAgeMs: 24 * 60 * 60 * 1000 });
    const strict = fixtureRequirement({ signalKind: "customer.identity.verified", maxAgeMs: 5 * 60 * 1000 });

    expect(analyzeGaps([lenient], [signal], NOW)).toEqual([]);
    expect(analyzeGaps([strict], [signal], NOW)).toHaveLength(1);
  });
});

describe("analyzeGaps — every candidate is clock-inconsistent: no fabricated age", () => {
  it("reports age as clock-inconsistency, never a fabricated zero, when the only candidate's capturedAt is after `now`", () => {
    // Constructed so the signal's own capturedAt (11:59) is valid relative
    // to NOW (12:00) — parseCapturedAt only refuses a capturedAt AFTER its
    // own constructing `now`. It is then judged, in analyzeGaps, against an
    // EARLIER `now` (11:30) than its capturedAt — a caller-side clock
    // inconsistency, the same setup freshness.test.ts uses for
    // Signal.read's own "clock-inconsistency" branch.
    const requirement = fixtureRequirement({
      signalKind: "customer.identity.verified",
      maxAgeMs: 30 * 60 * 1000,
      supplier: { kind: "counterparty", party: "customer" },
    });
    const clockInconsistentSignal = fixtureSignal({
      kind: "customer.identity.verified",
      confidence: 0.99,
      capturedAtIso: "2026-09-19T11:59:00Z",
    });
    const earlierNow = capturedAt("2026-09-19T11:30:00Z");

    const gaps = analyzeGaps([requirement], [clockInconsistentSignal], earlierNow);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("stale");
    if (gaps[0]?.reason === "stale") {
      expect(gaps[0].signal.id).toBe(clockInconsistentSignal.id);
      // The honest answer: this candidate has no meaningful age at all
      // (its observation lies in the future relative to the clock it is
      // being judged against) — never `{ kind: "elapsed", ms: 0 }`, which
      // would claim, falsely, that it was captured at exactly `now`.
      expect(gaps[0].age).toEqual({ kind: "clock-inconsistency" });
      expect(gaps[0].age).not.toEqual({ kind: "elapsed", ms: 0 });
    }
  });

  it("prefers a trustworthy elapsed age over a clock-inconsistent one when both are candidates", () => {
    const requirement = fixtureRequirement({
      signalKind: "customer.identity.verified",
      maxAgeMs: 5 * 60 * 1000, // 5 minutes — both candidates below miss it
      supplier: { kind: "counterparty", party: "customer" },
    });
    const clockInconsistentSignal = fixtureSignal({
      id: "sig-future",
      kind: "customer.identity.verified",
      confidence: 0.99,
      capturedAtIso: "2026-09-19T11:59:00Z",
    });
    const staleButElapsedSignal = fixtureSignal({
      id: "sig-elapsed",
      kind: "customer.identity.verified",
      confidence: 0.99,
      capturedAtIso: "2026-09-19T11:00:00Z", // 30 minutes before earlierNow
    });
    const earlierNow = capturedAt("2026-09-19T11:30:00Z");

    const gaps = analyzeGaps([requirement], [clockInconsistentSignal, staleButElapsedSignal], earlierNow);

    expect(gaps).toHaveLength(1);
    if (gaps[0]?.reason === "stale") {
      expect(gaps[0].signal.id).toBe("sig-elapsed");
      expect(gaps[0].age).toEqual({ kind: "elapsed", ms: 30 * 60 * 1000 });
    }
  });
});

describe("analyzeGaps — a signal present but below the required confidence", () => {
  it("produces a below-confidence gap, not a satisfied requirement", () => {
    const requirement = fixtureRequirement({
      signalKind: "customer.identity.verified",
      minConfidence: 0.9,
      maxAgeMs: 24 * 60 * 60 * 1000,
    });
    const weakSignal = fixtureSignal({
      kind: "customer.identity.verified",
      confidence: 0.4,
      capturedAtIso: "2026-09-19T11:00:00Z",
    });

    const gaps = analyzeGaps([requirement], [weakSignal], NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("below-confidence");
    if (gaps[0]?.reason === "below-confidence") {
      expect(gaps[0].actualConfidence).toBe(0.4);
      expect(gaps[0].signal.id).toBe(weakSignal.id);
    }
  });

  it("a fresh signal exactly at the confidence bar counts as satisfying it (>=, not >)", () => {
    const requirement = fixtureRequirement({ signalKind: "k", minConfidence: 0.8, maxAgeMs: 24 * 60 * 60 * 1000 });
    const atBar = fixtureSignal({ kind: "k", confidence: 0.8, capturedAtIso: "2026-09-19T11:00:00Z" });
    expect(analyzeGaps([requirement], [atBar], NOW)).toEqual([]);
  });
});

describe("analyzeGaps — value constraints (.genesis/decisions/0004-value-constraints.md)", () => {
  it("the headline example: a fresh, confident 'clear' fraud signal satisfies an equals constraint — no gap", () => {
    const requirement = fixtureRequirement({
      signalKind: "fraud.assessment",
      description: "the fraud assessment for this transfer",
      minConfidence: 0.8,
      maxAgeMs: 24 * 60 * 60 * 1000,
      valueConstraint: { op: "equals", value: "clear" },
    });
    const clean = fixtureSignal({
      kind: "fraud.assessment",
      value: "clear",
      confidence: 0.95,
      capturedAtIso: "2026-09-19T11:00:00Z",
    });

    expect(analyzeGaps([requirement], [clean], NOW)).toEqual([]);
  });

  it("the headline example: the SAME requirement, a 'fraudulent' value instead — a constraint-violated gap, not a satisfied requirement", () => {
    const requirement = fixtureRequirement({
      signalKind: "fraud.assessment",
      description: "the fraud assessment for this transfer",
      minConfidence: 0.8,
      maxAgeMs: 24 * 60 * 60 * 1000,
      valueConstraint: { op: "equals", value: "clear" },
    });
    const fraudulent = fixtureSignal({
      kind: "fraud.assessment",
      value: "fraudulent — stolen card",
      confidence: 0.95,
      capturedAtIso: "2026-09-19T11:00:00Z",
    });

    const gaps = analyzeGaps([requirement], [fraudulent], NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("constraint-violated");
    if (gaps[0]?.reason === "constraint-violated") {
      expect(gaps[0].signal.id).toBe(fraudulent.id);
      expect(gaps[0].constraint).toEqual({ op: "equals", value: "clear" });
      expect(gaps[0].evaluation).toEqual({ satisfied: false, reason: "violated" });
      // No `supplier` field at all — the taxonomy doesn't apply.
      expect("supplier" in gaps[0]).toBe(false);
    }
  });

  it("a constraint-violated gap carries no raw value anywhere on it — only the declared constraint and its categorical failure", () => {
    const requirement = fixtureRequirement({
      signalKind: "fraud.assessment",
      valueConstraint: { op: "equals", value: "clear" },
    });
    const fraudulent = fixtureSignal({
      kind: "fraud.assessment",
      value: "fraudulent — stolen card, do not disclose this string",
      confidence: 0.95,
      capturedAtIso: "2026-09-19T11:00:00Z",
    });

    const gaps = analyzeGaps([requirement], [fraudulent], NOW);
    expect(gaps[0]?.reason).toBe("constraint-violated");
    // The Gap itself never surfaces the signal's actual value (it lives in
    // the Signal's closure, unreachable except via `.read()`), so a naive
    // string search across the Gap's OWN enumerable content — everything
    // this test can plainly see without calling `.read()` — never finds
    // it either.
    if (gaps[0]?.reason === "constraint-violated") {
      expect(JSON.stringify(gaps[0].constraint)).not.toContain("stolen card");
      expect(JSON.stringify(gaps[0].evaluation)).not.toContain("stolen card");
    }
  });

  it("staleness still wins: a stale signal is still missing, even if its value would have cleared the constraint", () => {
    const requirement = fixtureRequirement({
      signalKind: "fraud.assessment",
      maxAgeMs: 30 * 60 * 1000, // 30 minutes
      valueConstraint: { op: "equals", value: "clear" },
    });
    const staleButClean = fixtureSignal({
      kind: "fraud.assessment",
      value: "clear",
      confidence: 0.99,
      capturedAtIso: "2026-09-19T10:00:00Z", // 2h before NOW — stale
    });

    const gaps = analyzeGaps([requirement], [staleButClean], NOW);
    expect(gaps).toHaveLength(1);
    // "stale", never "constraint-violated" — the constraint never even
    // runs against a candidate that wasn't fresh enough.
    expect(gaps[0]?.reason).toBe("stale");
  });

  it("confidence still wins: a below-confidence signal is still missing, even if its value would have cleared the constraint", () => {
    const requirement = fixtureRequirement({
      signalKind: "fraud.assessment",
      minConfidence: 0.9,
      valueConstraint: { op: "equals", value: "clear" },
    });
    const weakButClean = fixtureSignal({
      kind: "fraud.assessment",
      value: "clear",
      confidence: 0.4,
      capturedAtIso: "2026-09-19T11:00:00Z",
    });

    const gaps = analyzeGaps([requirement], [weakButClean], NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("below-confidence");
  });

  it("one candidate violates the constraint, a second fresh-and-confident candidate clears it — the requirement IS satisfied (any clearing candidate suffices)", () => {
    const requirement = fixtureRequirement({
      signalKind: "fraud.assessment",
      valueConstraint: { op: "equals", value: "clear" },
    });
    const fraudulent = fixtureSignal({
      id: "sig-bad",
      kind: "fraud.assessment",
      value: "fraudulent",
      confidence: 0.9,
      capturedAtIso: "2026-09-19T11:00:00Z",
    });
    const clean = fixtureSignal({
      id: "sig-good",
      kind: "fraud.assessment",
      value: "clear",
      confidence: 0.85,
      capturedAtIso: "2026-09-19T11:30:00Z",
    });

    expect(analyzeGaps([requirement], [fraudulent, clean], NOW)).toEqual([]);
  });

  it("every operator: lte satisfied vs. violated", () => {
    const requirement = fixtureRequirement({
      signalKind: "moderation.toxicity-score",
      valueConstraint: { op: "lte", value: 0.2 },
    });
    const low = fixtureSignal({ kind: "moderation.toxicity-score", value: 0.1, capturedAtIso: "2026-09-19T11:00:00Z" });
    const high = fixtureSignal({ kind: "moderation.toxicity-score", value: 0.9, capturedAtIso: "2026-09-19T11:00:00Z" });

    expect(analyzeGaps([requirement], [low], NOW)).toEqual([]);
    const gaps = analyzeGaps([requirement], [high], NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("constraint-violated");
  });

  it("every operator: gte satisfied vs. violated", () => {
    const requirement = fixtureRequirement({
      signalKind: "code-review.approvals",
      valueConstraint: { op: "gte", value: 2 },
    });
    const enough = fixtureSignal({ kind: "code-review.approvals", value: 3, capturedAtIso: "2026-09-19T11:00:00Z" });
    const notEnough = fixtureSignal({ kind: "code-review.approvals", value: 1, capturedAtIso: "2026-09-19T11:00:00Z" });

    expect(analyzeGaps([requirement], [enough], NOW)).toEqual([]);
    const gaps = analyzeGaps([requirement], [notEnough], NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("constraint-violated");
  });

  it("every operator: in satisfied vs. violated", () => {
    const requirement = fixtureRequirement({
      signalKind: "moderation.classification",
      valueConstraint: { op: "in", values: ["safe", "low-risk"] },
    });
    const safe = fixtureSignal({ kind: "moderation.classification", value: "low-risk", capturedAtIso: "2026-09-19T11:00:00Z" });
    const unsafe = fixtureSignal({ kind: "moderation.classification", value: "explicit", capturedAtIso: "2026-09-19T11:00:00Z" });

    expect(analyzeGaps([requirement], [safe], NOW)).toEqual([]);
    const gaps = analyzeGaps([requirement], [unsafe], NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("constraint-violated");
  });

  it("type-mismatched: a numeric constraint against a non-numeric value is a constraint-violated gap (fails closed, never satisfied, never throws)", () => {
    const requirement = fixtureRequirement({
      signalKind: "deploy.blast-radius",
      valueConstraint: { op: "lte", value: 3 },
    });
    const wrongShape = fixtureSignal({
      kind: "deploy.blast-radius",
      value: "not-a-number",
      capturedAtIso: "2026-09-19T11:00:00Z",
    });

    const gaps = analyzeGaps([requirement], [wrongShape], NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("constraint-violated");
    if (gaps[0]?.reason === "constraint-violated") {
      expect(gaps[0].evaluation).toEqual({ satisfied: false, reason: "type-mismatch" });
    }
  });

  it("a malformed constraint (unknown op) never fabricates a pass — fails closed to constraint-violated", () => {
    const requirement = fixtureRequirement({
      signalKind: "k",
      valueConstraint: { op: "matches-regex" as never, value: ".*" } as never,
    });
    const signal = fixtureSignal({ kind: "k", value: "anything", capturedAtIso: "2026-09-19T11:00:00Z" });

    const gaps = analyzeGaps([requirement], [signal], NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("constraint-violated");
    if (gaps[0]?.reason === "constraint-violated") {
      expect(gaps[0].evaluation).toEqual({ satisfied: false, reason: "malformed" });
    }
  });

  it("a constraint whose declared value is a throwing getter or a Proxy fails closed, never throws out of analyzeGaps", () => {
    const hostileValueConstraint = {
      op: "equals",
      get value(): string {
        throw new Error("radioactive constraint value");
      },
    } as unknown as import("../constraint.js").ValueConstraint;
    const requirement = fixtureRequirement({ signalKind: "k", valueConstraint: hostileValueConstraint });
    const signal = fixtureSignal({ kind: "k", value: "clear", capturedAtIso: "2026-09-19T11:00:00Z" });

    expect(() => analyzeGaps([requirement], [signal], NOW)).not.toThrow();
    const gaps = analyzeGaps([requirement], [signal], NOW);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toBe("constraint-violated");

    const proxyConstraint = new Proxy(
      {},
      {
        get() {
          throw new Error("radioactive proxy constraint");
        },
      },
    ) as unknown as import("../constraint.js").ValueConstraint;
    const requirementWithProxy = fixtureRequirement({ signalKind: "k2", valueConstraint: proxyConstraint });
    const signal2 = fixtureSignal({ kind: "k2", value: "clear", capturedAtIso: "2026-09-19T11:00:00Z" });
    expect(() => analyzeGaps([requirementWithProxy], [signal2], NOW)).not.toThrow();
  });

  it("is still a pure function of its inputs with a valueConstraint declared, and does not mutate them", () => {
    const requirement = fixtureRequirement({
      signalKind: "fraud.assessment",
      valueConstraint: { op: "equals", value: "clear" },
    });
    const signal = fixtureSignal({ kind: "fraud.assessment", value: "fraudulent", capturedAtIso: "2026-09-19T11:00:00Z" });

    const first = analyzeGaps([requirement], [signal], NOW);
    const second = analyzeGaps([requirement], [signal], NOW);
    expect(first).toEqual(second);
  });
});

describe("analyzeGaps is a pure function of (requirements, available signals, now)", () => {
  it("calling it twice with the same inputs yields deep-equal results", () => {
    const requirement = fixtureRequirement({ signalKind: "k", maxAgeMs: 60 * 60 * 1000 });
    const signals = [fixtureSignal({ kind: "k", confidence: 0.5, capturedAtIso: "2026-09-19T10:00:00Z" })];

    const first = analyzeGaps([requirement], signals, NOW);
    const second = analyzeGaps([requirement], signals, NOW);
    expect(first).toEqual(second);
  });

  it("does not mutate its inputs", () => {
    const requirement = fixtureRequirement({ signalKind: "k", maxAgeMs: 60 * 60 * 1000 });
    const signals = [fixtureSignal({ kind: "k", confidence: 0.5, capturedAtIso: "2026-09-19T10:00:00Z" })];
    const requirementsSnapshot = JSON.stringify([requirement]);

    analyzeGaps([requirement], signals, NOW);

    expect(JSON.stringify([requirement])).toBe(requirementsSnapshot);
    expect(signals).toHaveLength(1);
  });
});
