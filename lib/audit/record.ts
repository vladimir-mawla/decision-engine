import type { Action } from "../contracts/action.js";
import type {
  AskDecision,
  DeferDecision,
  EscalateDecision,
  ExecuteDecision,
  RefuseDecision,
} from "../contracts/decision.js";
import type { Requirement } from "../signals/requirement.js";
import type { CapturedAt } from "../signals/time.js";
import { decide, type DecideInput, type EvidencedDecision } from "../decide/index.js";
import { deriveRule, type RuleTrace } from "./rule.js";
import { toSignalSnapshot, type SignalSnapshot } from "./snapshot.js";

/**
 * `RecordedDecision` mirrors `lib/decide/evidence.ts`'s own
 * `Evidenced*Decision` pattern exactly, one layer up: where M4 wrapped
 * `Decision` with `{ evidence: readonly Signal[] }`, M5 wraps it with
 * `{ evidence: readonly SignalSnapshot[] }` — metadata only, so a
 * `RecordedDecision` is plain, JSON-safe data with no closures inside it
 * anywhere (unlike `EvidencedDecision`, whose `evidence` carries live
 * `Signal`s). That is precisely what makes two `RecordedDecision` values
 * comparable with an ordinary deep-equal (`replay.ts`) instead of running
 * into the closure-identity trap M4's own determinism test had to work
 * around (see decide/__tests__/determinism.test.ts's comment on why it
 * reuses signal references rather than re-building them).
 */
export type RecordedExecuteDecision = ExecuteDecision & { readonly evidence: readonly SignalSnapshot[] };
export type RecordedAskDecision = AskDecision & { readonly evidence: readonly SignalSnapshot[] };
export type RecordedDeferDecision = DeferDecision & { readonly evidence: readonly SignalSnapshot[] };
export type RecordedEscalateDecision = EscalateDecision & { readonly evidence: readonly SignalSnapshot[] };
export type RecordedRefuseDecision = RefuseDecision & { readonly evidence: readonly SignalSnapshot[] };

export type RecordedDecision =
  | RecordedExecuteDecision
  | RecordedAskDecision
  | RecordedDeferDecision
  | RecordedEscalateDecision
  | RecordedRefuseDecision;

/**
 * Converts a live `EvidencedDecision` (real `Signal`s, closures and all)
 * into a `RecordedDecision` (plain data). Fails closed rather than
 * throwing: if reading a signal's own metadata throws (a hostile getter
 * that DIDN'T throw the first time decide() itself read it, but throws
 * this time — see record.ts's own doc comment on why that residual risk
 * is accepted rather than defended field-by-field), this drops to an
 * empty evidence array and reports the failure via `ok: false` rather
 * than letting the exception escape or silently fabricating signals that
 * were never actually read.
 */
export function snapshotDecision(
  decision: EvidencedDecision,
): { readonly ok: true; readonly value: RecordedDecision } | { readonly ok: false; readonly error: string } {
  try {
    const evidence = decision.evidence.map(toSignalSnapshot);
    return { ok: true, value: { ...decision, evidence } as RecordedDecision };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unreadable evidence" };
  }
}

/**
 * A decision was actually made: `decide()` returned one of the five real
 * outcomes. Everything here is either lossless plain data copied straight
 * from the inputs (`action`, `requirements`, `now`) or a deliberate
 * projection of something that cannot be serialized as-is
 * (`prohibitionIds` stands in for `Prohibition.matches`, which is a
 * function — see rule.ts and .genesis/decisions/0003-audit-model.md's
 * PROHIBITIONS section).
 */
export interface DecisionAuditRecord {
  readonly kind: "decision";
  readonly id: string;
  readonly recordedAt: CapturedAt;
  readonly schemaVersion: 1;
  readonly action: Action;
  readonly requirements: readonly Requirement[];
  /** The ids of every prohibition `decide()` was given, IN ORDER — order matters because `findProhibition` checks in order (lib/decide/prohibition.ts). Not the predicates themselves: those are functions and cannot be serialized (ADR 0003). */
  readonly prohibitionIds: readonly string[];
  readonly now: CapturedAt;
  readonly decision: RecordedDecision;
  readonly rule: RuleTrace;
  /** Honest, non-empty only when some part of this record could not be captured faithfully (see recordDecision's per-field defenses below) — never silently dropped. */
  readonly snapshotWarnings: readonly string[];
}

/**
 * `decide()` never obtained a usable `Action` at all (lib/decide/decide.ts's
 * `InputRejected`) — there was nothing to decide about, so there is
 * nothing to replay. `replayable: false` states that plainly rather than
 * making a caller discover it by trying `replay()` and failing (see
 * `replay.ts`, whose signature only even accepts a `DecisionAuditRecord` —
 * calling it on this type is a compile error, not a runtime surprise).
 */
export interface RejectedAuditRecord {
  readonly kind: "input-rejected";
  readonly id: string;
  readonly recordedAt: CapturedAt;
  readonly schemaVersion: 1;
  readonly reason: string;
  readonly evidence: readonly SignalSnapshot[];
  readonly replayable: false;
  readonly replayNote: string;
}

export type AuditRecord = DecisionAuditRecord | RejectedAuditRecord;

function safeReadRequirements(input: DecideInput, warnings: string[]): readonly Requirement[] {
  try {
    const requirements = input.requirements;
    if (!Array.isArray(requirements)) {
      warnings.push("input.requirements was not an array; recorded as empty");
      return [];
    }
    return requirements;
  } catch {
    warnings.push("input.requirements could not be read; recorded as empty");
    return [];
  }
}

function safeReadProhibitionIds(input: DecideInput, warnings: string[]): readonly string[] {
  try {
    const prohibitions = input.prohibitions;
    if (!Array.isArray(prohibitions)) {
      warnings.push("input.prohibitions was not an array; recorded as empty");
      return [];
    }
    const ids: string[] = [];
    for (const p of prohibitions) {
      try {
        ids.push(typeof p?.id === "string" ? p.id : "");
      } catch {
        ids.push("");
      }
    }
    return ids;
  } catch {
    warnings.push("input.prohibitions could not be read; recorded as empty");
    return [];
  }
}

function safeReadNow(input: DecideInput, recordedAt: CapturedAt, warnings: string[]): CapturedAt {
  try {
    const now = input.now;
    if (typeof now !== "string") {
      warnings.push("input.now was not readable; recorded using recordedAt as a fallback");
      return recordedAt;
    }
    return now;
  } catch {
    warnings.push("input.now could not be read; recorded using recordedAt as a fallback");
    return recordedAt;
  }
}

/**
 * THE STRUCTURAL GUARANTEE BEHIND `no-unreplayable-decision`.
 *
 * `recordDecision` is the ONLY function in this package that constructs an
 * `AuditRecord`'s `decision` field, and it always does so by calling
 * `decide(input)` itself, right here — never by accepting an
 * already-computed `Decision`/`EvidencedDecision` as a parameter. That
 * closes off the entire class of bug this milestone's brief warns about
 * ("a record can be constructed that cannot be replayed"): there is no
 * code path in this module that lets a caller hand in a `decision` that
 * doesn't actually come from running `decide()` on the SAME `input` the
 * record also captures. Combined with `decide()`'s own proven purity
 * (lib/decide/__tests__/determinism.test.ts) and the fact that replay
 * reconstructs an input that is behaviorally identical to the original
 * (snapshot.ts's header comment — metadata-only signals are enough), this
 * makes an unreplayable `DecisionAuditRecord` a contradiction, not merely
 * an untested possibility: the exact same pure function that produced
 * `record.decision` the first time is the only function `replay()` ever
 * calls again.
 *
 * `id` and `recordedAt` are required, explicit parameters — never
 * generated internally via `crypto.randomUUID()`/`Date.now()` — for the
 * same reason `decide()` takes `now` explicitly rather than reading a
 * clock: it keeps this function itself a pure, testable mapping from its
 * arguments, and it is why "excluding id and timestamp fields" is even a
 * sensible thing for a replay test to say — those two fields are the only
 * ones this function does NOT derive from `input`, so they are exactly
 * the fields a caller-supplied identity/clock reading contributes and a
 * replay is not expected to reproduce.
 */
export function recordDecision(input: DecideInput, id: string, recordedAt: CapturedAt): AuditRecord {
  const decision = decide(input);

  if (decision.outcome === "input-rejected") {
    return {
      kind: "input-rejected",
      id,
      recordedAt,
      schemaVersion: 1,
      reason: decision.reason,
      evidence: [],
      replayable: false,
      replayNote:
        "decide() never obtained a usable action for this input — nothing was evaluated (no " +
        "action, no requirements, no signals were ever read), so there is nothing to replay. This " +
        "is not one of the five real outcomes and must not be treated as a cautious decision.",
    };
  }

  const warnings: string[] = [];

  const snapshot = snapshotDecision(decision);
  const recordedDecisionValue: RecordedDecision = snapshot.ok
    ? snapshot.value
    : ({ ...decision, evidence: [] } as RecordedDecision);
  if (!snapshot.ok) {
    warnings.push(`decision evidence could not be captured faithfully (${snapshot.error}); recorded as empty`);
  }

  const requirements = safeReadRequirements(input, warnings);
  const prohibitionIds = safeReadProhibitionIds(input, warnings);
  const now = safeReadNow(input, recordedAt, warnings);
  const rule = deriveRule(input);

  return {
    kind: "decision",
    id,
    recordedAt,
    schemaVersion: 1,
    action: decision.action,
    requirements,
    prohibitionIds,
    now,
    decision: recordedDecisionValue,
    rule,
    snapshotWarnings: warnings,
  };
}
