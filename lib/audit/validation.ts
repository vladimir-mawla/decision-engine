import { parseConfidence, type InvalidConfidence } from "../contracts/confidence.js";
import { parseAction, parseDecision, type ActionValidationError } from "../contracts/validation.js";
import { parseProvenance, type ProvenanceValidationError } from "../signals/validation.js";
import {
  parseCapturedAt,
  parseMilliseconds,
  type CapturedAt,
  type InvalidCapturedAt,
  type InvalidMilliseconds,
} from "../signals/time.js";
import type { Requirement, Supplier } from "../signals/requirement.js";
import type { SignalSnapshot } from "./snapshot.js";
import type { RuleTrace } from "./rule.js";
import type { AuditRecord, DecisionAuditRecord, RecordedDecision, RejectedAuditRecord } from "./record.js";

/**
 * Boundary parser for `AuditRecord` arriving as untrusted JSON-shaped
 * input (a persisted record read back, a record from another process, one
 * that has been tampered with). Same discipline as
 * lib/contracts/validation.ts and lib/signals/validation.ts, deliberately
 * reproduced rather than imported (both are frozen for this milestone and
 * neither exports its `readField` helper): every property read goes
 * through `readProperty`, which swallows a throwing getter/Proxy trap
 * exactly like an absent field, and no code path here ever enumerates an
 * object's own keys (`Object.keys`, a spread, `JSON.stringify`,
 * `Reflect.ownKeys`) — so a circular reference or a 10MB payload costs the
 * same bounded amount of work as a small well-formed record: a fixed
 * number of named-key lookups, never a full traversal.
 *
 * FORWARD COMPATIBILITY ("a record from a future version with unknown
 * fields"): every parser below reads only the named fields it knows
 * about; an object with extra, unrecognized keys is not walked at all, so
 * those keys are silently ignored rather than rejected — the ordinary,
 * safe meaning of "unknown fields, nothing throws." A `schemaVersion`
 * other than `1`, specifically, is NOT guessed at or partially accepted —
 * this parser has no way to know what a future version's shape actually
 * promises, so it fails closed with a typed `unsupported-schema-version`
 * error instead of pretending compatibility it cannot verify.
 */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export type AuditRecordValidationError =
  | { readonly kind: "not-an-object"; readonly received: unknown }
  | { readonly kind: "missing-field"; readonly field: string }
  | { readonly kind: "invalid-field"; readonly field: string; readonly reason?: string }
  | { readonly kind: "unsupported-schema-version"; readonly received: unknown }
  | { readonly kind: "unknown-record-kind"; readonly received: unknown }
  | { readonly kind: "invalid-action"; readonly detail: ActionValidationError }
  | { readonly kind: "invalid-captured-at"; readonly field: string; readonly detail: InvalidCapturedAt }
  | { readonly kind: "invalid-confidence"; readonly field: string; readonly detail: InvalidConfidence }
  | { readonly kind: "invalid-milliseconds"; readonly field: string; readonly detail: InvalidMilliseconds }
  | { readonly kind: "invalid-provenance"; readonly field: string; readonly detail: ProvenanceValidationError }
  | { readonly kind: "invalid-decision"; readonly detail: unknown };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readProperty(
  obj: Record<string, unknown>,
  key: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
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

function isStringArray(value: unknown): value is readonly string[] {
  if (!Array.isArray(value)) return false;
  for (const entry of value) {
    if (typeof entry !== "string") return false;
  }
  return true;
}

function parseSupplier(raw: unknown): Result<Supplier, AuditRecordValidationError> {
  if (!isPlainObject(raw)) return { ok: false, error: { kind: "not-an-object", received: raw } };
  const kind = readField(raw, "kind");
  switch (kind) {
    case "counterparty": {
      const party = readField(raw, "party");
      if (typeof party !== "string" || party.length === 0) {
        return { ok: false, error: { kind: "missing-field", field: "supplier.party" } };
      }
      return { ok: true, value: { kind: "counterparty", party } };
    }
    case "time": {
      const waitingOn = readField(raw, "waitingOn");
      if (typeof waitingOn !== "string" || waitingOn.length === 0) {
        return { ok: false, error: { kind: "missing-field", field: "supplier.waitingOn" } };
      }
      return { ok: true, value: { kind: "time", waitingOn } };
    }
    case "human": {
      const reason = readField(raw, "reason");
      if (typeof reason !== "string" || reason.length === 0) {
        return { ok: false, error: { kind: "missing-field", field: "supplier.reason" } };
      }
      return { ok: true, value: { kind: "human", reason } };
    }
    default:
      return { ok: false, error: { kind: "invalid-field", field: "supplier.kind", reason: "unknown supplier kind" } };
  }
}

function parseRequirement(raw: unknown): Result<Requirement, AuditRecordValidationError> {
  if (!isPlainObject(raw)) return { ok: false, error: { kind: "not-an-object", received: raw } };

  const signalKind = readField(raw, "signalKind");
  if (typeof signalKind !== "string" || signalKind.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "requirement.signalKind" } };
  }
  const description = readField(raw, "description");
  if (typeof description !== "string" || description.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "requirement.description" } };
  }
  const minConfidenceRaw = readField(raw, "minConfidence");
  if (typeof minConfidenceRaw !== "number") {
    return { ok: false, error: { kind: "missing-field", field: "requirement.minConfidence" } };
  }
  const minConfidence = parseConfidence(minConfidenceRaw);
  if (!minConfidence.ok) {
    return { ok: false, error: { kind: "invalid-confidence", field: "requirement.minConfidence", detail: minConfidence.error } };
  }
  const maxAgeRaw = readField(raw, "maxAge");
  const maxAge = parseMilliseconds(maxAgeRaw);
  if (!maxAge.ok) {
    return { ok: false, error: { kind: "invalid-milliseconds", field: "requirement.maxAge", detail: maxAge.error } };
  }
  const supplier = parseSupplier(readField(raw, "supplier"));
  if (!supplier.ok) return supplier;

  return {
    ok: true,
    value: { signalKind, description, minConfidence: minConfidence.value, maxAge: maxAge.value, supplier: supplier.value },
  };
}

function parseSignalSnapshot(raw: unknown, now: CapturedAt): Result<SignalSnapshot, AuditRecordValidationError> {
  if (!isPlainObject(raw)) return { ok: false, error: { kind: "not-an-object", received: raw } };

  const id = readField(raw, "id");
  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "evidence[].id" } };
  }
  const kind = readField(raw, "kind");
  if (typeof kind !== "string" || kind.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "evidence[].kind" } };
  }
  const source = parseProvenance(readField(raw, "source"));
  if (!source.ok) {
    return { ok: false, error: { kind: "invalid-provenance", field: "evidence[].source", detail: source.error } };
  }
  const capturedAt = parseCapturedAt(readField(raw, "capturedAt"), now);
  if (!capturedAt.ok) {
    return { ok: false, error: { kind: "invalid-captured-at", field: "evidence[].capturedAt", detail: capturedAt.error } };
  }
  const confidenceRaw = readField(raw, "confidence");
  if (typeof confidenceRaw !== "number") {
    return { ok: false, error: { kind: "missing-field", field: "evidence[].confidence" } };
  }
  const confidence = parseConfidence(confidenceRaw);
  if (!confidence.ok) {
    return { ok: false, error: { kind: "invalid-confidence", field: "evidence[].confidence", detail: confidence.error } };
  }

  return { ok: true, value: { id, kind, source: source.value, capturedAt: capturedAt.value, confidence: confidence.value } };
}

function parseEvidence(raw: unknown, now: CapturedAt): Result<readonly SignalSnapshot[], AuditRecordValidationError> {
  if (!Array.isArray(raw)) return { ok: false, error: { kind: "invalid-field", field: "evidence", reason: "must be an array" } };
  const out: SignalSnapshot[] = [];
  for (const entry of raw) {
    const parsed = parseSignalSnapshot(entry, now);
    if (!parsed.ok) return parsed;
    out.push(parsed.value);
  }
  return { ok: true, value: out };
}

/**
 * `RuleTrace` (rule.ts) is this module's own derived value, never
 * something a legitimate caller round-trips through JSON independently of
 * `AuditRecord` — so this parser is intentionally lenient (structure and
 * `kind` only) rather than exhaustively re-validating every variant's
 * fields the way `parseRequirement`/`parseSignalSnapshot` do for data that
 * genuinely arrives from outside this package. A record whose `rule` is
 * malformed still parses (falling back to `internal-error`, the same
 * fail-closed value `deriveRule` itself returns for a hostile input)
 * rather than rejecting the whole record over a field that exists purely
 * for explanation, never for replay correctness.
 */
function parseRuleTrace(raw: unknown): RuleTrace {
  if (!isPlainObject(raw)) return { kind: "internal-error" };
  const kind = readField(raw, "kind");
  switch (kind) {
    case "prohibition": {
      const prohibitionId = readField(raw, "prohibitionId");
      const reason = readField(raw, "reason");
      if (typeof prohibitionId === "string" && typeof reason === "string") {
        return { kind: "prohibition", prohibitionId, reason };
      }
      return { kind: "internal-error" };
    }
    case "gap": {
      const gapReason = readField(raw, "gapReason");
      const supplierKind = readField(raw, "supplierKind");
      const requirementSignalKind = readField(raw, "requirementSignalKind");
      const signalId = readField(raw, "signalId");
      if (
        (gapReason === "absent" || gapReason === "stale" || gapReason === "below-confidence") &&
        (supplierKind === "counterparty" || supplierKind === "time" || supplierKind === "human") &&
        typeof requirementSignalKind === "string" &&
        (signalId === null || typeof signalId === "string")
      ) {
        return { kind: "gap", gapReason, supplierKind, requirementSignalKind, signalId };
      }
      return { kind: "internal-error" };
    }
    case "no-requirements":
      return { kind: "no-requirements" };
    case "internal-inconsistency": {
      const requirementSignalKind = readField(raw, "requirementSignalKind");
      return typeof requirementSignalKind === "string"
        ? { kind: "internal-inconsistency", requirementSignalKind }
        : { kind: "internal-error" };
    }
    case "confidence-bar": {
      const cleared = readField(raw, "cleared");
      const saturated = readField(raw, "saturated");
      const requirementSignalKind = readField(raw, "requirementSignalKind");
      const limitingSignalId = readField(raw, "limitingSignalId");
      const bar = readField(raw, "bar");
      const aggregate = readField(raw, "aggregate");
      if (
        typeof cleared === "boolean" &&
        typeof saturated === "boolean" &&
        typeof requirementSignalKind === "string" &&
        typeof limitingSignalId === "string" &&
        typeof bar === "number" &&
        typeof aggregate === "number"
      ) {
        return { kind: "confidence-bar", cleared, saturated, requirementSignalKind, limitingSignalId, bar, aggregate };
      }
      return { kind: "internal-error" };
    }
    default:
      return { kind: "internal-error" };
  }
}

function parseRecordedDecision(raw: unknown, now: CapturedAt): Result<RecordedDecision, AuditRecordValidationError> {
  if (!isPlainObject(raw)) return { ok: false, error: { kind: "not-an-object", received: raw } };

  // Reuse lib/contracts's own strict Decision parser for everything
  // except `evidence` (which it doesn't know about — Decision itself,
  // frozen, deliberately carries no evidence field; see
  // lib/contracts/decision.ts's own note on why the audit trail wraps
  // it instead). Extra fields (including `evidence` itself) are simply
  // never read by parseDecision, so its presence here is harmless.
  const base = parseDecision(raw);
  if (!base.ok) return { ok: false, error: { kind: "invalid-decision", detail: base.error } };

  const evidence = parseEvidence(readField(raw, "evidence"), now);
  if (!evidence.ok) return evidence;

  return { ok: true, value: { ...base.value, evidence: evidence.value } as RecordedDecision };
}

export function parseAuditRecord(raw: unknown, now: CapturedAt): Result<AuditRecord, AuditRecordValidationError> {
  if (!isPlainObject(raw)) {
    return { ok: false, error: { kind: "not-an-object", received: raw } };
  }

  const schemaVersion = readField(raw, "schemaVersion");
  if (schemaVersion !== 1) {
    return { ok: false, error: { kind: "unsupported-schema-version", received: schemaVersion } };
  }

  const id = readField(raw, "id");
  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: { kind: "missing-field", field: "id" } };
  }
  const recordedAt = parseCapturedAt(readField(raw, "recordedAt"), now);
  if (!recordedAt.ok) {
    return { ok: false, error: { kind: "invalid-captured-at", field: "recordedAt", detail: recordedAt.error } };
  }

  const kind = readField(raw, "kind");

  if (kind === "input-rejected") {
    const reason = readField(raw, "reason");
    if (typeof reason !== "string" || reason.length === 0) {
      return { ok: false, error: { kind: "missing-field", field: "reason" } };
    }
    const evidence = parseEvidence(readField(raw, "evidence"), now);
    if (!evidence.ok) return evidence;
    const replayNote = readField(raw, "replayNote");
    return {
      ok: true,
      value: {
        kind: "input-rejected",
        id,
        recordedAt: recordedAt.value,
        schemaVersion: 1,
        reason,
        evidence: evidence.value,
        replayable: false,
        replayNote: typeof replayNote === "string" ? replayNote : "",
      } satisfies RejectedAuditRecord,
    };
  }

  if (kind === "decision") {
    const action = parseAction(readField(raw, "action"));
    if (!action.ok) return { ok: false, error: { kind: "invalid-action", detail: action.error } };

    const requirementsRaw = readField(raw, "requirements");
    if (!Array.isArray(requirementsRaw)) {
      return { ok: false, error: { kind: "invalid-field", field: "requirements", reason: "must be an array" } };
    }
    const requirements: Requirement[] = [];
    for (const entry of requirementsRaw) {
      const parsed = parseRequirement(entry);
      if (!parsed.ok) return parsed;
      requirements.push(parsed.value);
    }

    const prohibitionIds = readField(raw, "prohibitionIds");
    if (!isStringArray(prohibitionIds)) {
      return { ok: false, error: { kind: "invalid-field", field: "prohibitionIds", reason: "must be an array of strings" } };
    }

    const nowField = parseCapturedAt(readField(raw, "now"), now);
    if (!nowField.ok) {
      return { ok: false, error: { kind: "invalid-captured-at", field: "now", detail: nowField.error } };
    }

    const decision = parseRecordedDecision(readField(raw, "decision"), now);
    if (!decision.ok) return decision;

    const rule = parseRuleTrace(readField(raw, "rule"));

    const warningsRaw = readField(raw, "snapshotWarnings");
    const snapshotWarnings = isStringArray(warningsRaw) ? warningsRaw : [];

    return {
      ok: true,
      value: {
        kind: "decision",
        id,
        recordedAt: recordedAt.value,
        schemaVersion: 1,
        action: action.value,
        requirements,
        prohibitionIds,
        now: nowField.value,
        decision: decision.value,
        rule,
        snapshotWarnings,
      } satisfies DecisionAuditRecord,
    };
  }

  return { ok: false, error: { kind: "unknown-record-kind", received: kind } };
}
