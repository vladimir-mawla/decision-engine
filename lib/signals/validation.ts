import { parseConfidence, type InvalidConfidence } from "../contracts/confidence.js";
import {
  parseCapturedAt,
  type CapturedAt,
  type InvalidCapturedAt,
} from "./time.js";
import { PROVENANCE_KINDS, type InvalidProvenance, type Provenance } from "./provenance.js";
import { createSignal, type Signal } from "./signal.js";

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Same discipline as lib/contracts/validation.ts's `readProperty`/
 * `readField`, reproduced locally rather than imported: lib/contracts is
 * frozen for this milestone (`git diff main -- lib/contracts` must stay
 * empty) and the helper isn't part of its public `index.ts` surface
 * anyway. `obj[key]` is wrapped in try/catch because it can throw for
 * reasons that have nothing to do with the data's shape — an own or
 * inherited getter that throws, or a Proxy `get` trap that throws (see
 * `__tests__/hostile-input.test.ts`) — and a failed read is folded into
 * "absent field", never allowed to escape as an exception.
 *
 * Two more hostile shapes this module is deliberately built to survive,
 * by construction rather than by a special case:
 *
 *   - `__proto__` as a data key. Every parser below only ever reads a
 *     small, fixed set of named keys via `readField(raw, "capturedAt")`
 *     etc. — never `Object.keys`, never `{...raw}` / `Object.assign({},
 *     raw)`, never iterating `raw`'s own keys at all. `Object.assign`
 *     is the actual prototype-pollution vector for a JSON-parsed
 *     `__proto__` own-property (it goes through `[[Set]]`, which *does*
 *     walk the prototype chain and can invoke `Object.prototype`'s
 *     `__proto__` accessor); this module never calls it on untrusted
 *     input, so that vector never opens.
 *   - Deep/circular structure. Nothing here recursively walks `raw` (no
 *     `JSON.stringify`, no deep-equal, no generic clone) — every read is
 *     a bounded number of named-key lookups, so a payload with a cycle,
 *     or one that is merely huge, costs the same fixed amount of work as
 *     a small well-formed one.
 */
function readProperty(obj: Record<string, unknown>, key: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    return { ok: true, value: obj[key] };
  } catch {
    return { ok: false };
  }
}

function readField(obj: Record<string, unknown>, key: string): unknown {
  const result = readProperty(obj, key);
  return result.ok ? result.value : undefined;
}

export type ProvenanceValidationError = InvalidProvenance;

/**
 * Strict boundary parser for Provenance. Rejects, never guesses: anything
 * that isn't one of the four known `kind`s (typo, a kind from some other
 * project's vocabulary, a hostile object claiming an unrecognized kind) is
 * `unknown-provenance-kind` — never silently coerced into, say,
 * `{ kind: "system", system: "unknown" }`, which would manufacture
 * provenance that was never actually asserted.
 */
export function parseProvenance(raw: unknown): Result<Provenance, ProvenanceValidationError> {
  if (!isPlainObject(raw)) {
    return { ok: false, error: { kind: "not-an-object", received: raw } };
  }
  const kind = readField(raw, "kind");
  if (typeof kind !== "string" || !(PROVENANCE_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: { kind: "unknown-provenance-kind", received: kind } };
  }

  switch (kind as Provenance["kind"]) {
    case "counterparty": {
      const party = readField(raw, "party");
      if (typeof party !== "string" || party.length === 0) {
        return { ok: false, error: { kind: "invalid-field", field: "party" } };
      }
      return { ok: true, value: { kind: "counterparty", party } };
    }
    case "system": {
      const system = readField(raw, "system");
      if (typeof system !== "string" || system.length === 0) {
        return { ok: false, error: { kind: "invalid-field", field: "system" } };
      }
      return { ok: true, value: { kind: "system", system } };
    }
    case "human": {
      const who = readField(raw, "who");
      if (typeof who !== "string" || who.length === 0) {
        return { ok: false, error: { kind: "invalid-field", field: "who" } };
      }
      return { ok: true, value: { kind: "human", who } };
    }
    case "derived": {
      const rule = readField(raw, "rule");
      if (typeof rule !== "string" || rule.length === 0) {
        return { ok: false, error: { kind: "invalid-field", field: "rule" } };
      }
      const inputsRaw = readField(raw, "inputs");
      if (!Array.isArray(inputsRaw) || inputsRaw.length === 0) {
        return { ok: false, error: { kind: "invalid-field", field: "inputs" } };
      }
      const inputs: string[] = [];
      for (const entry of inputsRaw) {
        if (typeof entry !== "string" || entry.length === 0) {
          return { ok: false, error: { kind: "invalid-field", field: "inputs" } };
        }
        inputs.push(entry);
      }
      return { ok: true, value: { kind: "derived", rule, inputs } };
    }
  }
}

export type SignalValidationError =
  | { readonly kind: "not-an-object"; readonly received: unknown }
  | { readonly kind: "missing-field"; readonly field: string }
  | { readonly kind: "invalid-field"; readonly field: string }
  | { readonly kind: "invalid-provenance"; readonly detail: ProvenanceValidationError }
  | { readonly kind: "invalid-captured-at"; readonly detail: InvalidCapturedAt }
  | { readonly kind: "invalid-confidence"; readonly detail: InvalidConfidence };

/**
 * Strict boundary parser for a Signal arriving as untrusted JSON-shaped
 * input. `now` must be supplied by the caller (see time.ts) so the
 * clock-skew check in `parseCapturedAt` is testable and so this function,
 * like everything else in lib/signals, never reaches for the wall clock
 * on its own.
 *
 * `value` is read defensively but NOT type-checked against anything —
 * this module doesn't know what a `customer.balance` signal's value
 * should look like (that's the domain's job, M6), so any value that can
 * be read at all (including `null`, `0`, `false` — all legitimate
 * asserted facts) is accepted as-is. Only a `value` key that is itself
 * absent, or whose read throws (collapsed into "absent" by
 * `readProperty`, same rule as lib/contracts/validation.ts), is rejected.
 */
export function parseSignal(raw: unknown, now: CapturedAt): Result<Signal, SignalValidationError> {
  if (!isPlainObject(raw)) {
    return { ok: false, error: { kind: "not-an-object", received: raw } };
  }

  const id = readField(raw, "id");
  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "id" } };
  }
  const signalKind = readField(raw, "kind");
  if (typeof signalKind !== "string" || signalKind.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "kind" } };
  }

  const valueRead = readProperty(raw, "value");
  if (!valueRead.ok || valueRead.value === undefined) {
    return { ok: false, error: { kind: "missing-field", field: "value" } };
  }

  const provenance = parseProvenance(readField(raw, "source"));
  if (!provenance.ok) {
    return { ok: false, error: { kind: "invalid-provenance", detail: provenance.error } };
  }

  const capturedAtRaw = readField(raw, "capturedAt");
  const capturedAt = parseCapturedAt(capturedAtRaw, now);
  if (!capturedAt.ok) {
    return { ok: false, error: { kind: "invalid-captured-at", detail: capturedAt.error } };
  }

  const confidenceRaw = readField(raw, "confidence");
  if (typeof confidenceRaw !== "number") {
    return { ok: false, error: { kind: "missing-field", field: "confidence" } };
  }
  const confidence = parseConfidence(confidenceRaw);
  if (!confidence.ok) {
    return { ok: false, error: { kind: "invalid-confidence", detail: confidence.error } };
  }

  return {
    ok: true,
    value: createSignal({
      id,
      kind: signalKind,
      value: valueRead.value,
      source: provenance.value,
      capturedAt: capturedAt.value,
      confidence: confidence.value,
    }),
  };
}
