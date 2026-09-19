import { describe, expect, it } from "vitest";
import { decide } from "../../decide/decide.js";
import { parseValueConstraint, parseSignal, MAX_IN_VALUES } from "../../signals/validation.js";
import { refundApproval } from "../refund-approval/domain.js";
import { codeDeploy } from "../code-deploy/domain.js";
import { toDecideInput } from "../shared/test-helpers.js";

/**
 * TESTS section, M6 brief: "Fail closed: a malformed domain definition, a
 * requirement naming a signal kind no fixture provides, a prohibition
 * that throws." These are properties of the frozen engine (already proven
 * in `lib/decide`'s and `lib/signals`' own suites) — this file proves they
 * hold when exercised through THIS project's own domain-authored data and
 * config-shaped input, not merely in the abstract.
 */
describe("M6 domains — fail closed under malformed input", () => {
  describe("a malformed domain definition, arriving as untrusted JSON (e.g. a policy config file)", () => {
    it("an unknown constraint operator is rejected, never silently treated as satisfied", () => {
      // A domain author's config typo'd "eq" instead of "equals" — this is
      // exactly the shape a JSON policy file could arrive with.
      const result = parseValueConstraint({ op: "eq", value: "clear" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("unknown-op");
      }
    });

    it("an oversized `in` allow-list (as content-moderation's category check or code-deploy's rollout-stage check could receive from a hostile/corrupted config) is rejected, never truncated or accepted", () => {
      const tooMany = { op: "in", values: Array.from({ length: MAX_IN_VALUES + 1 }, (_, i) => `category-${i}`) };
      const result = parseValueConstraint(tooMany);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("invalid-field");
      }
      // Sanity: exactly at the limit is fine — this is testing the boundary, not merely "large fails".
      const exactlyMax = { op: "in", values: Array.from({ length: MAX_IN_VALUES }, (_, i) => `category-${i}`) };
      expect(parseValueConstraint(exactlyMax).ok).toBe(true);
    });

    it("a fraud/moderation signal arriving with a missing `value` field is rejected, never defaulted to a value that happens to clear a constraint", () => {
      const result = parseSignal(
        {
          id: "sig-malformed",
          kind: "customer.fraudAssessment",
          // `value` deliberately absent.
          source: { kind: "system", system: "fraud-engine-v3" },
          capturedAt: refundApproval.cases[0]!.now,
          confidence: 0.9,
        },
        refundApproval.cases[0]!.now,
      );
      expect(result.ok).toBe(false);
    });
  });

  describe("a requirement naming a signal kind no fixture provides", () => {
    it("decide() never throws, and never silently executes, when a required signal kind is entirely absent from the fixture set", () => {
      const base = refundApproval.cases[0]!; // R1 — normally executes.
      const input = toDecideInput(base);
      const requirementForMissingKind = {
        signalKind: "customer.signal-kind-no-fixture-provides",
        description: "a fact this fixture set never supplies",
        minConfidence: base.requirements[0]!.minConfidence,
        maxAge: base.requirements[0]!.maxAge,
        supplier: { kind: "counterparty" as const, party: "customer" },
      };

      const decision = decide({ ...input, requirements: [...input.requirements, requirementForMissingKind] });

      // Must not throw (already implicit — a throw would fail this test),
      // and must NOT silently execute: an absent required signal produces
      // an `absent` Gap for the new requirement, which (being a
      // `counterparty` supplier) wins precedence over R1's own
      // confidence-bar path entirely.
      expect(decision.outcome).toBe("ask");
      if (decision.outcome === "ask") {
        expect(decision.missing.fact).toBe(requirementForMissingKind.description);
      }
    });
  });

  describe("a prohibition that throws", () => {
    it("decide() fails closed to refuse when a domain-authored prohibition's own `matches` throws, never to execute", () => {
      const base = refundApproval.cases[0]!; // R1 — normally executes.
      const input = toDecideInput(base);
      const hostileProhibition = {
        id: "hostile-buggy-prohibition",
        reason: "this prohibition has a bug and throws instead of returning a boolean",
        matches: (): boolean => {
          throw new Error("simulated bug in a domain-authored prohibition");
        },
      };

      const decision = decide({ ...input, prohibitions: [...input.prohibitions, hostileProhibition] });

      expect(decision.outcome).toBe("refuse");
    });

    it("the same holds for a code-deploy case whose evidence would otherwise clear every bar", () => {
      const base = codeDeploy.cases[0]!; // D1 — normally executes.
      const input = toDecideInput(base);
      const hostileProhibition = {
        id: "hostile-buggy-prohibition-2",
        reason: "throws instead of returning a boolean",
        matches: (): boolean => {
          throw new Error("simulated bug");
        },
      };

      const decision = decide({ ...input, prohibitions: [...input.prohibitions, hostileProhibition] });

      expect(decision.outcome).toBe("refuse");
    });
  });
});
