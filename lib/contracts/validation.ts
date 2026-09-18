import type { Action } from "./action.js";
import { parseCostOfBeingWrong, type InvalidCost } from "../cost-model/cost.js";
import { isReversibility } from "../cost-model/reversibility.js";
import { parseConfidence, type InvalidConfidence } from "./confidence.js";
import type {
  Decision,
  MissingFact,
  MissingTime,
  MissingJudgment,
} from "./decision.js";

/**
 * Real input arrives as JSON, not TypeScript — the compile-time guarantees
 * in action.ts and decision.ts mean nothing to a payload that was never
 * constructed as a TS literal in the first place. Every parser here is a
 * total function: it returns a Result, and it never throws, for any input
 * including the wrong type entirely (a string, an array, null, undefined).
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export type ActionValidationError =
  | { readonly kind: "not-an-object"; readonly received: unknown }
  | { readonly kind: "missing-field"; readonly field: string }
  | { readonly kind: "invalid-field"; readonly field: string; readonly reason: string }
  | { readonly kind: "invalid-cost"; readonly detail: InvalidCost }
  | { readonly kind: "unknown-reversibility"; readonly received: unknown };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strict boundary parser for Action. This is the "reject, don't guess"
 * half of this project's fail-closed story: anything structurally wrong
 * (not an object, a missing/blank domain or type, non-object parameters, a
 * non-numeric/negative/non-finite cost, a reversibility string that isn't
 * one of the four known levels) is returned as a typed ActionValidationError
 * — never thrown, and never silently coerced into a guessed Action. That is
 * itself the safe behavior: an action we can't even parse cannot correctly
 * be assumed to be the cheapest, safest, most reversible thing in the
 * catalog, so we refuse to construct one at all rather than default to the
 * best case.
 *
 * (Contrast lib/cost-model's resolveReversibility/resolveCostOfBeingWrong:
 * those exist for a caller that already has a real, structurally-valid
 * Action and specifically cannot pin down one of these two fields — they
 * fail closed by substituting the *worst* case so the pipeline can still
 * run. This parser fails closed by refusing to run at all. Both are
 * "fail closed"; they differ in whether the caller can afford to stop.)
 */
export function parseAction(raw: unknown): Result<Action, ActionValidationError> {
  if (!isPlainObject(raw)) {
    return { ok: false, error: { kind: "not-an-object", received: raw } };
  }

  if (typeof raw.domain !== "string" || raw.domain.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "domain" } };
  }
  if (typeof raw.type !== "string" || raw.type.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "type" } };
  }
  if (!isPlainObject(raw.parameters)) {
    return {
      ok: false,
      error: { kind: "invalid-field", field: "parameters", reason: "must be a plain object" },
    };
  }
  if (typeof raw.costOfBeingWrong !== "number") {
    return {
      ok: false,
      error: { kind: "invalid-field", field: "costOfBeingWrong", reason: "must be a number" },
    };
  }
  const cost = parseCostOfBeingWrong(raw.costOfBeingWrong);
  if (!cost.ok) {
    return { ok: false, error: { kind: "invalid-cost", detail: cost.error } };
  }
  if (!isReversibility(raw.reversibility)) {
    return { ok: false, error: { kind: "unknown-reversibility", received: raw.reversibility } };
  }

  return {
    ok: true,
    value: {
      domain: raw.domain,
      type: raw.type,
      parameters: raw.parameters,
      costOfBeingWrong: cost.value,
      reversibility: raw.reversibility,
    },
  };
}

export type DecisionValidationError =
  | { readonly kind: "not-an-object"; readonly received: unknown }
  | { readonly kind: "unknown-outcome"; readonly received: unknown }
  | { readonly kind: "invalid-action"; readonly detail: ActionValidationError }
  | { readonly kind: "invalid-confidence"; readonly field: string; readonly detail: InvalidConfidence }
  | { readonly kind: "missing-field"; readonly field: string };

const OUTCOMES = ["execute", "ask", "defer", "escalate", "refuse"] as const;

function parseMissingFact(raw: unknown): Result<MissingFact, DecisionValidationError> {
  if (!isPlainObject(raw)) return { ok: false, error: { kind: "not-an-object", received: raw } };
  if (typeof raw.fact !== "string" || raw.fact.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "missing.fact" } };
  }
  if (typeof raw.counterparty !== "string" || raw.counterparty.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "missing.counterparty" } };
  }
  return { ok: true, value: { kind: "fact", fact: raw.fact, counterparty: raw.counterparty } };
}

function parseMissingTime(raw: unknown): Result<MissingTime, DecisionValidationError> {
  if (!isPlainObject(raw)) return { ok: false, error: { kind: "not-an-object", received: raw } };
  if (typeof raw.waitingOn !== "string" || raw.waitingOn.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "missing.waitingOn" } };
  }
  if (typeof raw.reconsiderAt !== "string" || raw.reconsiderAt.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "missing.reconsiderAt" } };
  }
  return { ok: true, value: { kind: "time", waitingOn: raw.waitingOn, reconsiderAt: raw.reconsiderAt } };
}

function parseMissingJudgment(raw: unknown): Result<MissingJudgment, DecisionValidationError> {
  if (!isPlainObject(raw)) return { ok: false, error: { kind: "not-an-object", received: raw } };
  if (typeof raw.reason !== "string" || raw.reason.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "missing.reason" } };
  }
  return { ok: true, value: { kind: "human-judgment", reason: raw.reason } };
}

/**
 * Strict boundary parser for Decision. Mirrors parseAction's discipline:
 * every one of the five outcome-specific obligations that the type system
 * enforces at compile time (an ask names a fact, a defer names what it's
 * waiting for, an escalate names why, a refuse names why) is re-checked
 * here at runtime, because a JSON payload claiming to be an `ask` decision
 * can say anything at all — TypeScript never saw it.
 */
export function parseDecision(raw: unknown): Result<Decision, DecisionValidationError> {
  if (!isPlainObject(raw)) {
    return { ok: false, error: { kind: "not-an-object", received: raw } };
  }
  if (typeof raw.outcome !== "string" || !(OUTCOMES as readonly string[]).includes(raw.outcome)) {
    return { ok: false, error: { kind: "unknown-outcome", received: raw.outcome } };
  }

  const action = parseAction(raw.action);
  if (!action.ok) {
    return { ok: false, error: { kind: "invalid-action", detail: action.error } };
  }

  switch (raw.outcome as Decision["outcome"]) {
    case "execute": {
      if (typeof raw.confidence !== "number") {
        return { ok: false, error: { kind: "missing-field", field: "confidence" } };
      }
      const confidence = parseConfidence(raw.confidence);
      if (!confidence.ok) {
        return { ok: false, error: { kind: "invalid-confidence", field: "confidence", detail: confidence.error } };
      }
      if (typeof raw.confidenceBar !== "number") {
        return { ok: false, error: { kind: "missing-field", field: "confidenceBar" } };
      }
      const confidenceBar = parseConfidence(raw.confidenceBar);
      if (!confidenceBar.ok) {
        return { ok: false, error: { kind: "invalid-confidence", field: "confidenceBar", detail: confidenceBar.error } };
      }
      return {
        ok: true,
        value: {
          outcome: "execute",
          action: action.value,
          confidence: confidence.value,
          confidenceBar: confidenceBar.value,
        },
      };
    }
    case "ask": {
      const missing = parseMissingFact(raw.missing);
      if (!missing.ok) return missing;
      return { ok: true, value: { outcome: "ask", action: action.value, missing: missing.value } };
    }
    case "defer": {
      const missing = parseMissingTime(raw.missing);
      if (!missing.ok) return missing;
      return { ok: true, value: { outcome: "defer", action: action.value, missing: missing.value } };
    }
    case "escalate": {
      const missing = parseMissingJudgment(raw.missing);
      if (!missing.ok) return missing;
      return { ok: true, value: { outcome: "escalate", action: action.value, missing: missing.value } };
    }
    case "refuse": {
      if (typeof raw.reason !== "string" || raw.reason.length === 0) {
        return { ok: false, error: { kind: "missing-field", field: "reason" } };
      }
      return { ok: true, value: { outcome: "refuse", action: action.value, reason: raw.reason } };
    }
  }
}
