import type { Confidence } from "../contracts/confidence.js";
import type { Provenance } from "../signals/provenance.js";
import type { Signal, SignalReading } from "../signals/signal.js";
import type { CapturedAt, Milliseconds } from "../signals/time.js";

/**
 * THE ONE PLACE IN THIS PACKAGE THAT DISCLOSES A SIGNAL'S ACTUAL VALUE.
 *
 * Everything else in lib/audit (recordDecision, replay, snapshot) works
 * from Signal *metadata* alone — see snapshot.ts's header comment for why
 * that is sufficient for replay and sufficient to satisfy
 * `no-outcome-without-signals`. Metadata alone, though, is not always
 * enough for a HUMAN reading the audit trail to sanity-check a decision
 * ("the record says a `customer.identity.verified` signal at confidence
 * 0.92 satisfied this — but was it actually `true`?"). Disclosing the
 * value can answer that, but it must never happen as a side effect of
 * building or serializing a record — that is exactly the "JSON.stringify
 * happens to leak it" failure mode M3 already closed off for every other
 * path.  So it is its own named function, called only when a caller
 * explicitly wants it, and it is never invoked by `recordDecision` or
 * `replay`.
 *
 * `discloseSignalValue` is a thin, honest wrapper around `Signal.read` —
 * it does not add a second freshness policy: the caller states `maxAge`
 * and `now` themselves (typically the same `requirement.maxAge` and
 * `record.now` a Gap/Satisfaction already used to decide this signal
 * mattered), so a `fresh` disclosure and a `stale` disclosure remain
 * exactly as meaningful as `SignalReading` already makes them elsewhere in
 * this project.
 */
export type SerializableSignalReading =
  | { readonly status: "fresh"; readonly value: unknown; readonly age: Milliseconds; readonly confidence: Confidence }
  | { readonly status: "stale"; readonly age: Milliseconds; readonly maxAge: Milliseconds }
  | { readonly status: "clock-inconsistency" };

export interface SignalDisclosure {
  readonly signalId: string;
  readonly signalKind: string;
  readonly source: Provenance;
  readonly requestedMaxAge: Milliseconds;
  readonly disclosedAt: CapturedAt;
  readonly reading: SerializableSignalReading;
}

/**
 * SENSITIVE DATA: calling this attaches whatever `value` the signal
 * actually carries to the returned `SignalDisclosure` — including
 * anything a customer, deploy diff, or moderation post signal might carry
 * once M6 wires real domains. This function makes that visible and
 * deliberate (a named call site a reviewer can grep for and an author can
 * choose not to make), but it does not itself redact, mask, or otherwise
 * limit what comes back — see .genesis/decisions/0003-audit-model.md's
 * SENSITIVE_DATA section for why redaction is left to a domain-specific
 * caller (this module has no way to know which of a domain's own value
 * shapes are sensitive) rather than attempted, generically and therefore
 * unreliably, here.
 */
export function discloseSignalValue(signal: Signal, maxAge: Milliseconds, now: CapturedAt): SignalDisclosure {
  const reading: SignalReading<unknown> = signal.read(maxAge, now);
  return {
    signalId: signal.id,
    signalKind: signal.kind,
    source: signal.source,
    requestedMaxAge: maxAge,
    disclosedAt: now,
    reading,
  };
}
