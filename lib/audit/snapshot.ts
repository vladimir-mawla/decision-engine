import type { Confidence } from "../contracts/confidence.js";
import type { Provenance } from "../signals/provenance.js";
import { createSignal, type Signal } from "../signals/signal.js";
import type { CapturedAt } from "../signals/time.js";

/**
 * THE VALUE-DISCLOSURE PROBLEM (see .genesis/decisions/0003-audit-model.md
 * for the full argument; this is the mechanism).
 *
 * M3's `Signal` deliberately hides its value in a closure — the only exit is
 * `.read(maxAge, now)`. `JSON.stringify(signal)`, a spread, `{...signal}`,
 * and `Reflect.ownKeys(signal)` all agree on this: `id`, `kind`, `source`,
 * `capturedAt`, and `confidence` are real own enumerable data properties on
 * the object `createSignal` returns, but `value` is not a property at all —
 * it lives only inside the closure `read` captures. So a *metadata*
 * snapshot of a Signal (this file) needs no special API and discloses
 * nothing: it is exactly what plain property access already gives you.
 * Disclosing the *value* is a different, deliberately separate act — see
 * `./disclose.ts`, which is the only place in this package that ever calls
 * `.read()`.
 *
 * WHY METADATA ALONE IS ENOUGH FOR REPLAY: every function `decide()` calls
 * to reach an outcome — `analyzeGaps`, `findSatisfaction`,
 * `aggregateConfidence` (lib/signals, lib/decide) — reads only
 * `signal.kind`, `signal.capturedAt`, and `signal.confidence` directly off
 * the Signal object. None of them ever calls `.read()`. `decide()`'s
 * outcome is therefore a pure function of that metadata alone; the actual
 * disclosed value never influences which of the five outcomes is returned.
 * That is what makes `fromSignalSnapshot` below sound: reconstructing a
 * Signal from ONLY its metadata, with a sentinel in place of the real
 * value, reproduces the exact same `decide()` behavior as the original —
 * because the original behavior never depended on the value either.
 */
export interface SignalSnapshot {
  readonly id: string;
  readonly kind: string;
  readonly source: Provenance;
  readonly capturedAt: CapturedAt;
  readonly confidence: Confidence;
}

/**
 * A visible, unmistakable stand-in for "this replay-reconstructed Signal
 * was never told the real value" — never the real disclosed value, and
 * never `undefined`/`null` either (those could be mistaken for a genuinely
 * asserted falsy fact, exactly the ambiguity `SignalReading`'s discriminated
 * union in lib/signals/signal.ts exists to prevent). Anything that
 * accidentally calls `.read()` on a replay-reconstructed signal and reads
 * `.value` gets this symbol back, not silence.
 */
export const UNDISCLOSED_VALUE: unique symbol = Symbol("audit.undisclosed-signal-value");

/**
 * Plain property reads — no `.read()` call, so this never touches the
 * hidden value. This can still throw if `signal` itself is hostile (a
 * getter on `id`/`kind`/`source`/`capturedAt`/`confidence` that throws);
 * callers that need a fail-closed guarantee wrap this themselves (see
 * `record.ts`'s `snapshotDecision`), the same division of responsibility
 * lib/decide/evidence.ts uses (a small, honest builder; the caller supplies
 * the fail-closed wrapper) rather than duplicating a try/catch inside every
 * single-purpose function in this file.
 */
export function toSignalSnapshot(signal: Signal): SignalSnapshot {
  return {
    id: signal.id,
    kind: signal.kind,
    source: signal.source,
    capturedAt: signal.capturedAt,
    confidence: signal.confidence,
  };
}

/**
 * Reconstructs a Signal from ONLY its metadata, for replay. `value` is
 * `UNDISCLOSED_VALUE` — never guessed, never omitted by making value
 * optional (which would just move the ambiguity into the type). Sound
 * specifically because `decide()` never reads it (see the header comment).
 */
export function fromSignalSnapshot(snapshot: SignalSnapshot): Signal {
  return createSignal({
    id: snapshot.id,
    kind: snapshot.kind,
    value: UNDISCLOSED_VALUE,
    source: snapshot.source,
    capturedAt: snapshot.capturedAt,
    confidence: snapshot.confidence,
  });
}
