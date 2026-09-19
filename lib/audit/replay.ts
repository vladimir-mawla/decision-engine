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
 *
 * `knownSignals` — THE THIRD, OPTIONAL THING BEYOND THE RECORD REPLAY MAY
 * NEED, added for value constraints
 * (`.genesis/decisions/0004-value-constraints.md`): a `Requirement` with
 * `valueConstraint` (lib/signals/requirement.ts) makes `decide()` call
 * `Signal.read()` — for the FIRST time ever, as of this milestone — which
 * means `decide()`'s outcome can now depend on a signal's actual VALUE,
 * not only its metadata. `fromSignalSnapshot` (snapshot.ts) reconstructs
 * every evidence signal with `UNDISCLOSED_VALUE`, which can never equal or
 * compare to a real constraint threshold — sound for a decision whose
 * gap/escalate path never needed the value to AGREE with anything (a
 * `"constraint-violated"` Gap reproduces correctly: metadata alone is
 * enough to prove the value was present, fresh, and confident, and
 * `UNDISCLOSED_VALUE` failing every operator reproduces "not satisfied"
 * exactly, by construction — see reasons.ts's note on why `"violated"`
 * and `"type-mismatch"` render identically for exactly this reason), but
 * UNSOUND for a decision whose evidence depended on the constraint being
 * CLEARED: metadata-only replay cannot re-verify that, and will
 * (correctly, honestly) report `matches: false`, not because `decide()`
 * disagreed with itself, but because the value that made it agree the
 * first time was never recorded, by design.
 *
 * This is the exact same shape of limitation ADR 0003 already stated for
 * `Prohibition.matches` (a caller-supplied predicate that can't be
 * serialized, so replay requires it fresh, out of band) — applied to
 * values instead of predicates. `knownSignals`, when supplied, lets a
 * caller who legitimately holds the ORIGINAL signals (e.g. replaying
 * immediately, in the same process, for verification — never persisted
 * alongside the record) substitute the real signal for a recorded
 * evidence entry with the SAME id, so a constraint that was satisfied by
 * a real value replays with full fidelity too. A supplied signal is used
 * ONLY when its OWN metadata (`kind`/`capturedAt`/`confidence`/`source`)
 * deep-equals the recorded snapshot's — a signal with a matching id but
 * DIFFERENT metadata is not "the same evidence, now disclosed", it is a
 * different signal, and is rejected (falls back to the metadata-only
 * reconstruction) rather than silently substituted. Omitting
 * `knownSignals` (or passing `[]`) is always safe and never leaks
 * anything beyond what `fromSignalSnapshot` already reconstructs — this
 * parameter never causes a value to be RECORDED anywhere, only used
 * transiently for this one call, the same opt-in discipline
 * `discloseSignalValue` (disclose.ts) uses.
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

/** Plain-data comparison of a candidate real signal's metadata against a recorded snapshot — never touches `.read()`/`.value`. */
function metadataMatches(signal: Signal, snapshot: SignalSnapshot): boolean {
  try {
    return (
      signal.kind === snapshot.kind &&
      signal.capturedAt === snapshot.capturedAt &&
      signal.confidence === snapshot.confidence &&
      isDeepStrictEqual(signal.source, snapshot.source)
    );
  } catch {
    return false;
  }
}

/**
 * Reconstructs the Signal metadata the decision was recorded with — with
 * REAL signals (see `knownSignals` in the header comment above)
 * substituted in wherever one is supplied AND its own metadata matches
 * the recorded snapshot exactly; every other entry falls back to
 * `fromSignalSnapshot`'s metadata-only reconstruction (`UNDISCLOSED_VALUE`).
 * Fails closed per snapshot (rather than per whole array): a single
 * malformed/hostile `SignalSnapshot` entry is dropped, not fabricated —
 * dropping it can only make the replayed decision diverge from the
 * recorded one, which is the correct, detectable failure mode for a
 * corrupted record (see __tests__/fail-closed.test.ts and
 * __tests__/replay.test.ts's tamper-detection cases), never a silent,
 * accidental match.
 */
function signalsFromEvidence(evidence: unknown, knownSignals: readonly Signal[]): readonly Signal[] {
  if (!Array.isArray(evidence)) return [];
  const signals: Signal[] = [];
  for (const snapshot of evidence as readonly SignalSnapshot[]) {
    try {
      const known = knownSignals.find((s) => {
        try {
          return s.id === snapshot.id;
        } catch {
          return false;
        }
      });
      if (known !== undefined && metadataMatches(known, snapshot)) {
        signals.push(known);
      } else {
        signals.push(fromSignalSnapshot(snapshot));
      }
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

export function replay(
  record: DecisionAuditRecord,
  prohibitions: readonly Prohibition[],
  knownSignals: readonly Signal[] = [],
): ReplayResult {
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
    const signals = signalsFromEvidence(recordedDecision.evidence, knownSignals);

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
