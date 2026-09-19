import { isDeepStrictEqual } from "node:util";
import { decide, type DecideInput, type InputRejected, type Prohibition } from "../decide/index.js";
import type { Signal } from "../signals/signal.js";
import { fromSignalSnapshot, type SignalSnapshot } from "./snapshot.js";
import { snapshotDecision, type DecisionAuditRecord, type RecordedDecision } from "./record.js";

/**
 * `replay(record, prohibitions)` — the signature states, explicitly, the
 * ONE thing beyond the record itself that replay needs: the prohibition
 * set. `Prohibition.matches` is a function (lib/decide/prohibition.ts) and
 * cannot be serialized into `record.prohibitionIds`, so a record is only
 * ever replayable RELATIVE TO a rule set the caller supplies — see
 * .genesis/decisions/0003-audit-model.md's PROHIBITIONS section. Nothing
 * else is implicit: no ambient clock (`record.now` is reused, never
 * `systemNow()`), no ambient signal store (the record's own evidence
 * snapshot is reconstructed via `fromSignalSnapshot`, never re-fetched
 * from anywhere).
 *
 * Only a `DecisionAuditRecord` can be passed here — a `RejectedAuditRecord`
 * (lib/audit/record.ts) has no `action`/`requirements`/`now` to replay at
 * all, and TypeScript refuses the call at compile time rather than this
 * function discovering it's been handed the wrong kind of record at
 * runtime.
 *
 * FAIL CLOSED, independently of `decide()`'s own guarantee: `record` is
 * typed as a trusted `DecisionAuditRecord`, but this project's own tests
 * (matching decide()'s own convention — see lib/decide/__tests__/fail-
 * closed.test.ts) routinely hand-build a *hostile* value and assert it
 * via `as unknown as DecisionAuditRecord` — a tampered/corrupted record is
 * exactly that shape. Every read of `record`'s own fields below is
 * therefore defensive, mirroring decide.ts's own "read once, never
 * re-read a value that could throw" discipline: if `record` itself (or
 * one of its fields) throws on access, `replay()` reports
 * `matches: false` (there is nothing honest to compare) rather than
 * letting the exception escape.
 */
export interface ReplayResult {
  /**
   * Whether the SUPPLIED prohibition set's ids, in order, match
   * `record.prohibitionIds` exactly. `false` here means this replay ran
   * against a DIFFERENT rule set than the one the decision was originally
   * recorded under — the milestone brief's "replay with a different
   * prohibition set produces a detectably different result rather than
   * silently diverging" is this field: it is computed and reported
   * unconditionally, whether or not `matches` below happens to still be
   * `true` by coincidence (e.g. the differing prohibition never actually
   * mattered for this action) — a coincidental match is not the same
   * claim as "this replayed under the recorded rules," and `ruleSetMatches`
   * keeps those two claims from being confused with each other.
   */
  readonly ruleSetMatches: boolean;
  /** Whether replaying actually reproduced the recorded decision (deep-equal, evidence metadata included). */
  readonly matches: boolean;
  readonly replayed: RecordedDecision | InputRejected;
  /** `null` only when `record.decision` itself could not be read at all (a hostile/corrupted record) — never fabricated. */
  readonly recorded: RecordedDecision | null;
}

function safeProhibitionIds(prohibitions: readonly Prohibition[]): readonly string[] {
  try {
    if (!Array.isArray(prohibitions)) return [];
    return prohibitions.map((p) => {
      try {
        return typeof p?.id === "string" ? p.id : "";
      } catch {
        return "";
      }
    });
  } catch {
    return [];
  }
}

function idsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Reconstructs the exact Signal metadata the decision was recorded with.
 * Fails closed per snapshot (rather than per whole array): a single
 * malformed/hostile `SignalSnapshot` entry is dropped, not fabricated —
 * dropping it can only make the replayed decision diverge from the
 * recorded one, which is the correct, detectable failure mode for a
 * corrupted record (see __tests__/fail-closed.test.ts and
 * __tests__/replay.test.ts's tamper-detection cases), never a silent,
 * accidental match.
 */
function signalsFromEvidence(evidence: unknown): readonly Signal[] {
  if (!Array.isArray(evidence)) return [];
  const signals: Signal[] = [];
  for (const snapshot of evidence as readonly SignalSnapshot[]) {
    try {
      signals.push(fromSignalSnapshot(snapshot));
    } catch {
      // Dropped — see doc comment above.
    }
  }
  return signals;
}

const UNREADABLE_RECORD_REPLAYED: InputRejected = {
  outcome: "input-rejected",
  reason: "replay() could not read this record well enough to reconstruct an input to decide()",
  evidence: [],
};

export function replay(record: DecisionAuditRecord, prohibitions: readonly Prohibition[]): ReplayResult {
  const suppliedIds = safeProhibitionIds(prohibitions);

  let recordedProhibitionIds: readonly string[] = [];
  try {
    recordedProhibitionIds = Array.isArray(record?.prohibitionIds) ? record.prohibitionIds : [];
  } catch {
    recordedProhibitionIds = [];
  }
  const ruleSetMatches = idsEqual(suppliedIds, recordedProhibitionIds);

  let recordedDecision: RecordedDecision | null;
  try {
    recordedDecision = record.decision ?? null;
  } catch {
    recordedDecision = null;
  }

  if (recordedDecision === null) {
    return { ruleSetMatches, matches: false, replayed: UNREADABLE_RECORD_REPLAYED, recorded: null };
  }

  try {
    const action = record.action;
    const requirementsRaw = record.requirements;
    const requirements = Array.isArray(requirementsRaw) ? requirementsRaw : [];
    const now = record.now;
    const signals = signalsFromEvidence(recordedDecision.evidence);

    const input: DecideInput = { action, requirements, signals, prohibitions, now };
    const replayedDecision = decide(input);

    let replayed: RecordedDecision | InputRejected;
    if (replayedDecision.outcome === "input-rejected") {
      replayed = replayedDecision;
    } else {
      const snapshot = snapshotDecision(replayedDecision);
      replayed = snapshot.ok ? snapshot.value : ({ ...replayedDecision, evidence: [] } as RecordedDecision);
    }

    const matches = isDeepStrictEqual(replayed, recordedDecision);
    return { ruleSetMatches, matches, replayed, recorded: recordedDecision };
  } catch {
    return { ruleSetMatches, matches: false, replayed: UNREADABLE_RECORD_REPLAYED, recorded: recordedDecision };
  }
}
