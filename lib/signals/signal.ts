import type { Confidence } from "../contracts/confidence.js";
import { ageOf, isFresh, type Age, type CapturedAt, type Milliseconds } from "./time.js";
import type { Provenance } from "./provenance.js";

/**
 * The result of reading a Signal's value through its one legitimate exit,
 * `Signal.read`. This is where "reading a value without considering its
 * age is awkward or impossible" (the milestone brief, restating the
 * `no-decision-path-reads-a-signal-without-provenance-and-freshness`
 * invariant) is made structural rather than a comment:
 *
 * - The `fresh` variant is the ONLY variant with a `value` field. A stale
 *   reading has no `value` at all — not `value: undefined`, not a `null`
 *   the caller could accidentally coerce past — so a caller who forgets to
 *   branch on `status` and reaches straight for `.value` on the union gets
 *   a compile error under TypeScript's discriminated-union narrowing, not
 *   a silent `undefined` at runtime. This is the exact same discipline
 *   lib/contracts uses to make an `ask` without a named fact fail to
 *   compile.
 * - `age` and (on `fresh`) `confidence` are returned alongside the value on
 *   purpose, even though the caller already had to supply `maxAge` to get
 *   here: the goal is not just gating the read, but making it structurally
 *   awkward to *discard* freshness/confidence after the gate — a caller
 *   that destructures `{ value }` and drops the rest had to type that
 *   destructure themselves, in code a reviewer can see, rather than the
 *   API handing back a bare value that never carried the other two in the
 *   first place.
 */
export type SignalReading<TValue> =
  | { readonly status: "fresh"; readonly value: TValue; readonly age: Milliseconds; readonly confidence: Confidence }
  | { readonly status: "stale"; readonly age: Milliseconds; readonly maxAge: Milliseconds }
  /**
   * `now` (the argument to `.read`) was earlier than this signal's own
   * `capturedAt` — a clock inconsistency between whoever validated the
   * signal and whoever is reading it now. Never treated as fresh (see
   * `ageOf`/`isFresh` in time.ts): a caller cannot compute a trustworthy
   * age here at all, so failing closed means refusing to hand back a
   * value, not guessing one.
   */
  | { readonly status: "clock-inconsistency" };

/**
 * A single piece of typed evidence with provenance. Deliberately NOT a
 * plain data interface: `value` is not one of its public fields. It is
 * captured in this factory's closure and reachable only through `.read`,
 * which forces every caller to state how fresh is fresh enough for their
 * purpose (see time.ts's "staleness is relative" discussion) before they
 * can see what the signal actually says.
 *
 * `read` takes `maxAge` explicitly on every call rather than storing one
 * per-signal — the SAME signal is fresh under one policy ("good enough for
 * a low-stakes ask") and stale under another ("not good enough to
 * autonomously execute an irreversible action"), and a signal cannot know
 * in advance which of its future readers will demand which bar. Baking a
 * single TTL into the signal itself is exactly the "fixed global TTL"
 * the milestone brief says would be wrong.
 *
 * KNOWN LIMIT (documented, not silently glossed over — see cost.ts's own
 * disclosure about branded-type casts for the same class of caveat):
 * `Signal<TValue>` is a structural TypeScript interface, so nothing stops
 * a caller from hand-writing an object that satisfies the shape without
 * going through `createSignal` — e.g. a `read` method that always reports
 * `"fresh"` regardless of age. TypeScript's structural typing cannot be
 * made to refuse that any more than it can refuse a deliberate brand cast
 * on one of lib/cost-model's or lib/contracts's own branded numeric types.
 * What `createSignal` DOES guarantee mechanically is that anyone who goes
 * through the one real constructor gets an honest `read`; the compile-time
 * obligation is that provenance/freshness/confidence are required
 * arguments to construct a signal at all (see
 * `__tests__/signal-shape.test.ts`), not that no one could ever forge a
 * dishonest object of the same shape.
 */
export interface Signal<TValue = unknown> {
  readonly id: string;
  readonly kind: string;
  readonly source: Provenance;
  readonly capturedAt: CapturedAt;
  readonly confidence: Confidence;
  read(maxAge: Milliseconds, now: CapturedAt): SignalReading<TValue>;
}

export interface SignalParams<TValue> {
  /**
   * Caller-assigned, like `Action.domain`/`Action.type` in lib/contracts —
   * deliberately a plain string, not a branded nominal type. There is no
   * conflation risk here the way there is for Confidence/CostOfBeingWrong
   * (a signal id being handed to the wrong slot doesn't silently change
   * the meaning of a comparison); it just needs to be stable enough for a
   * `derived` Provenance elsewhere to name it in `inputs`, so an audit
   * trail can walk from a derived signal back to the signals it read.
   */
  readonly id: string;
  /** What this signal is about, e.g. "customer.identity.verified" — domain-owned, matched against Requirement.signalKind in gap analysis. */
  readonly kind: string;
  /** What it asserts. Left as `TValue` (caller-supplied generic) rather than a fixed shape — M3 doesn't know every domain's evidence shapes; that's M6's job. */
  readonly value: TValue;
  readonly source: Provenance;
  readonly capturedAt: CapturedAt;
  readonly confidence: Confidence;
}

/**
 * The one real constructor. Every field on `SignalParams` is required —
 * there is no overload that lets a caller build a Signal without
 * `source`, `capturedAt`, or `confidence` (proven at compile time in
 * `__tests__/signal-shape.test.ts` via documented `@ts-expect-error`s).
 */
export function createSignal<TValue>(params: SignalParams<TValue>): Signal<TValue> {
  const { id, kind, value, source, capturedAt, confidence } = params;
  return {
    id,
    kind,
    source,
    capturedAt,
    confidence,
    read(maxAge: Milliseconds, now: CapturedAt): SignalReading<TValue> {
      const age: Age = ageOf(capturedAt, now);
      if (age.kind === "clock-inconsistency") {
        return { status: "clock-inconsistency" };
      }
      if (!isFresh(age, maxAge)) {
        return { status: "stale", age: age.ms, maxAge };
      }
      return { status: "fresh", value, age: age.ms, confidence };
    },
  };
}
