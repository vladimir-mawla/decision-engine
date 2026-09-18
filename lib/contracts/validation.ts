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
 * total function: it returns a Result and never throws, for any input,
 * including the wrong type entirely (a string, an array, null, undefined)
 * AND including an object whose properties are actively hostile rather
 * than merely wrong-typed — a getter (own or inherited from the prototype
 * chain) that throws when read, or a Proxy whose `get` trap throws.
 *
 * That guarantee is upheld by reading every field through `readProperty`
 * below, which wraps the single property access in try/catch: a throwing
 * accessor is treated exactly like an absent field (the read fails, the
 * value is `undefined`, and the ordinary "missing/invalid field" error
 * comes back through the normal Result channel) rather than letting the
 * exception escape past this module. Two things keep that guarantee
 * precise rather than an overclaim:
 *
 *   - these parsers only ever perform a plain `obj[key]` read — never `in`,
 *     `Object.keys`/`Object.getOwnPropertyNames`, or a property-descriptor
 *     lookup — so a Proxy's `has`, `ownKeys`, or `getOwnPropertyDescriptor`
 *     traps are never invoked by this code at all, throwing or not;
 *   - every type check on a read value is `typeof`, `Array.isArray`, or an
 *     equality/`includes` comparison, never an implicit coercion (`+x`,
 *     string concatenation, a template literal) — so a value with a
 *     throwing `valueOf`/`toString` is never coerced by this module either;
 *     it is only ever compared by `typeof`, which cannot invoke either.
 *
 * (Real `JSON.parse` output can never contain a getter or a Proxy in the
 * first place, so this defends against a narrower, deliberately-adversarial
 * class of input than "JSON" — see lib/contracts/__tests__/validation.test.ts
 * for the getter/Proxy reproductions this guards against, and their
 * "structured failure, not a throw" assertions.)
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
 * The one place that reads a property off untrusted input. `obj[key]` can
 * throw for reasons that have nothing to do with the shape of the data —
 * an own or inherited getter that throws, or (for a Proxy) a `get` trap
 * that throws — so the read is wrapped in try/catch and a failed read
 * comes back as `{ ok: false }` rather than propagating the exception.
 * Every caller below treats a failed read exactly like an absent field.
 */
function readProperty(obj: Record<string, unknown>, key: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    return { ok: true, value: obj[key] };
  } catch {
    return { ok: false };
  }
}

/** Convenience: the value of a defensive read, or `undefined` if the read itself threw — collapsing "threw" into "absent" is exactly the guarantee this module makes. */
function readField(obj: Record<string, unknown>, key: string): unknown {
  const result = readProperty(obj, key);
  return result.ok ? result.value : undefined;
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

  const domain = readField(raw, "domain");
  if (typeof domain !== "string" || domain.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "domain" } };
  }
  const type = readField(raw, "type");
  if (typeof type !== "string" || type.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "type" } };
  }
  const parameters = readField(raw, "parameters");
  if (!isPlainObject(parameters)) {
    return {
      ok: false,
      error: { kind: "invalid-field", field: "parameters", reason: "must be a plain object" },
    };
  }
  const costOfBeingWrongRaw = readField(raw, "costOfBeingWrong");
  if (typeof costOfBeingWrongRaw !== "number") {
    return {
      ok: false,
      error: { kind: "invalid-field", field: "costOfBeingWrong", reason: "must be a number" },
    };
  }
  const cost = parseCostOfBeingWrong(costOfBeingWrongRaw);
  if (!cost.ok) {
    return { ok: false, error: { kind: "invalid-cost", detail: cost.error } };
  }
  const reversibility = readField(raw, "reversibility");
  if (!isReversibility(reversibility)) {
    return { ok: false, error: { kind: "unknown-reversibility", received: reversibility } };
  }

  return {
    ok: true,
    value: {
      domain,
      type,
      parameters,
      costOfBeingWrong: cost.value,
      reversibility,
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
  const fact = readField(raw, "fact");
  if (typeof fact !== "string" || fact.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "missing.fact" } };
  }
  const counterparty = readField(raw, "counterparty");
  if (typeof counterparty !== "string" || counterparty.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "missing.counterparty" } };
  }
  return { ok: true, value: { kind: "fact", fact, counterparty } };
}

function parseMissingTime(raw: unknown): Result<MissingTime, DecisionValidationError> {
  if (!isPlainObject(raw)) return { ok: false, error: { kind: "not-an-object", received: raw } };
  const waitingOn = readField(raw, "waitingOn");
  if (typeof waitingOn !== "string" || waitingOn.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "missing.waitingOn" } };
  }
  const reconsiderAt = readField(raw, "reconsiderAt");
  if (typeof reconsiderAt !== "string" || reconsiderAt.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "missing.reconsiderAt" } };
  }
  return { ok: true, value: { kind: "time", waitingOn, reconsiderAt } };
}

function parseMissingJudgment(raw: unknown): Result<MissingJudgment, DecisionValidationError> {
  if (!isPlainObject(raw)) return { ok: false, error: { kind: "not-an-object", received: raw } };
  const reason = readField(raw, "reason");
  if (typeof reason !== "string" || reason.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "missing.reason" } };
  }
  return { ok: true, value: { kind: "human-judgment", reason } };
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

  const outcome = readField(raw, "outcome");
  if (typeof outcome !== "string" || !(OUTCOMES as readonly string[]).includes(outcome)) {
    return { ok: false, error: { kind: "unknown-outcome", received: outcome } };
  }

  const action = parseAction(readField(raw, "action"));
  if (!action.ok) {
    return { ok: false, error: { kind: "invalid-action", detail: action.error } };
  }

  switch (outcome as Decision["outcome"]) {
    case "execute": {
      const confidenceRaw = readField(raw, "confidence");
      if (typeof confidenceRaw !== "number") {
        return { ok: false, error: { kind: "missing-field", field: "confidence" } };
      }
      const confidence = parseConfidence(confidenceRaw);
      if (!confidence.ok) {
        return { ok: false, error: { kind: "invalid-confidence", field: "confidence", detail: confidence.error } };
      }
      const confidenceBarRaw = readField(raw, "confidenceBar");
      if (typeof confidenceBarRaw !== "number") {
        return { ok: false, error: { kind: "missing-field", field: "confidenceBar" } };
      }
      const confidenceBar = parseConfidence(confidenceBarRaw);
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
      const missing = parseMissingFact(readField(raw, "missing"));
      if (!missing.ok) return missing;
      return { ok: true, value: { outcome: "ask", action: action.value, missing: missing.value } };
    }
    case "defer": {
      const missing = parseMissingTime(readField(raw, "missing"));
      if (!missing.ok) return missing;
      return { ok: true, value: { outcome: "defer", action: action.value, missing: missing.value } };
    }
    case "escalate": {
      const missing = parseMissingJudgment(readField(raw, "missing"));
      if (!missing.ok) return missing;
      return { ok: true, value: { outcome: "escalate", action: action.value, missing: missing.value } };
    }
    case "refuse": {
      const reason = readField(raw, "reason");
      if (typeof reason !== "string" || reason.length === 0) {
        return { ok: false, error: { kind: "missing-field", field: "reason" } };
      }
      return { ok: true, value: { outcome: "refuse", action: action.value, reason } };
    }
  }
}
