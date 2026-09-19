/**
 * Two branded primitives underlie every freshness decision in this module:
 *
 * - `CapturedAt`  — the instant a signal was observed, as a strict ISO-8601
 *                    UTC instant. Branded for the same reason Confidence and
 *                    CostOfBeingWrong are branded in lib/contracts and
 *                    lib/cost-model: a bare string ("timestamp? some
 *                    string?") can't be assigned where a validated instant
 *                    is expected without going through `parseCapturedAt`,
 *                    where the ISO-8601 shape AND the clock-skew rule below
 *                    are actually enforced.
 * - `Milliseconds` — a non-negative duration. Used for both "how old is too
 *                    old" (a requirement's freshness threshold) and "how
 *                    old is this, actually" (a computed age). Branding it
 *                    stops a confidence value (also a bare number in the
 *                    0..1 range) or a raw millisecond epoch timestamp from
 *                    being handed to a parameter that expects a *duration*
 *                    — those are easy to transpose by accident and the
 *                    bugs they'd cause are exactly the kind that silently
 *                    make stale evidence look fresh.
 *
 * WHY REJECT A FUTURE-DATED OBSERVATION (CLOCK SKEW) OUTRIGHT
 * ─────────────────────────────────────────────────────────────────────────
 * `parseCapturedAt` takes the constructing clock's own `now` and refuses to
 * produce a `CapturedAt` later than it. This is a deliberate fail-closed
 * choice, not an oversight of "real" clock skew between distributed
 * systems:
 *
 *   1. Freshness in this module is entirely a function of `now - capturedAt`
 *      (see `ageMs` below). A future `capturedAt` makes that quantity
 *      negative, which would make the signal look *younger than zero* —
 *      i.e. impossibly, permanently fresh, no matter how the caller states
 *      the threshold. That is the single most dangerous failure mode this
 *      module could have: it would let an attacker (or a broken upstream
 *      clock) manufacture unconditionally-fresh evidence just by claiming a
 *      timestamp slightly ahead of "now".
 *   2. There is no principled amount of tolerance to bake in here, because
 *      how much clock skew is "normal" depends entirely on the deployment
 *      (co-located services vs. a signal relayed through a slow queue) —
 *      exactly the kind of policy decision this project pushes to the
 *      caller rather than hard-coding (see the per-requirement `maxAge` in
 *      requirement.ts). A caller integrating a system with known clock
 *      drift can add its own tolerance *before* calling `parseCapturedAt`
 *      (e.g. clamp small skew to `now`); this module does not guess one.
 *
 * So: any `capturedAt` strictly after the `now` passed to `parseCapturedAt`
 * is rejected as `InvalidCapturedAt` — a typed error, never a throw, and
 * never a signal that silently claims to be from the future.
 */
declare const capturedAtBrand: unique symbol;
export type CapturedAt = string & { readonly [capturedAtBrand]: "CapturedAt" };

declare const millisecondsBrand: unique symbol;
export type Milliseconds = number & { readonly [millisecondsBrand]: "Milliseconds" };

export interface InvalidCapturedAt {
  readonly kind: "not-a-string" | "not-iso-8601" | "future-dated";
  readonly received: unknown;
}

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

// Deliberately strict — not the permissive `Date.parse`-accepts-almost-
// anything grammar. Requires a full calendar date, a time, and an explicit
// UTC offset (`Z` or `+HH:MM`/`-HH:MM`); a bare date, a bare year, or a
// timestamp with no offset (locale-ambiguous) is rejected rather than
// guessed at.
const ISO_8601_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Strict boundary constructor for `CapturedAt`. Requires the caller's own
 * `now` (also a `CapturedAt`) explicitly, rather than reaching for
 * `Date.now()` internally — that is what keeps every function in this
 * module a pure function of its arguments (see gap.ts), and it's what makes
 * the clock-skew rule testable with an injected, fixed "now" instead of
 * real wall-clock time racing the test.
 */
export function parseCapturedAt(value: unknown, now: CapturedAt): Result<CapturedAt, InvalidCapturedAt> {
  if (typeof value !== "string") {
    return { ok: false, error: { kind: "not-a-string", received: value } };
  }
  if (!ISO_8601_INSTANT.test(value)) {
    return { ok: false, error: { kind: "not-iso-8601", received: value } };
  }
  const parsedMs = Date.parse(value);
  if (Number.isNaN(parsedMs)) {
    // Matches the regex shape but is still not a real calendar instant,
    // e.g. month 13 or day 32 — `Date.parse` is the actual calendar
    // authority; the regex only rules out ambiguous/incomplete shapes.
    return { ok: false, error: { kind: "not-iso-8601", received: value } };
  }
  const nowMs = Date.parse(now);
  if (parsedMs > nowMs) {
    return { ok: false, error: { kind: "future-dated", received: value } };
  }
  return { ok: true, value: value as CapturedAt };
}

export interface InvalidMilliseconds {
  readonly kind: "not-finite" | "negative";
  readonly received: unknown;
}

/** Strict boundary constructor for a non-negative duration. */
export function parseMilliseconds(value: unknown): Result<Milliseconds, InvalidMilliseconds> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: { kind: "not-finite", received: value } };
  }
  if (value < 0) {
    return { ok: false, error: { kind: "negative", received: value } };
  }
  return { ok: true, value: value as Milliseconds };
}

/**
 * The one real-clock touchpoint in this module. Everything else — parsing,
 * age computation, freshness comparison, gap analysis — takes `now` as an
 * explicit argument and is otherwise pure. Isolating the single impure call
 * here means every other function stays trivially testable with a fixed,
 * injected instant, and a reviewer auditing for "does this secretly read
 * the wall clock" has exactly one function to check.
 */
export function systemNow(): CapturedAt {
  return new Date().toISOString() as CapturedAt;
}

/**
 * How old `capturedAt` is, as measured from `now`. Not exported as a bare
 * number: callers get either a well-formed `Milliseconds` age (when
 * `capturedAt` is at or before `now`) or an explicit signal that the two
 * instants are inconsistent (`now` is earlier than `capturedAt`) — which
 * can only happen if a caller reuses a stale `now` against a signal that
 * was validated against a later clock reading, since `parseCapturedAt`
 * already refuses to construct a `CapturedAt` later than *its own*
 * `now` at construction time. Folding that inconsistency into "the age is
 * simply negative" would let a `Milliseconds` value (documented everywhere
 * else as non-negative) silently go negative; instead it is its own named
 * case, and every caller (Signal.read, gap analysis) treats it as the
 * worst case — maximally stale — never as "impossibly, perfectly fresh".
 */
export type Age =
  | { readonly kind: "elapsed"; readonly ms: Milliseconds }
  | { readonly kind: "clock-inconsistency" };

export function ageOf(capturedAt: CapturedAt, now: CapturedAt): Age {
  const deltaMs = Date.parse(now) - Date.parse(capturedAt);
  if (deltaMs < 0) {
    return { kind: "clock-inconsistency" };
  }
  return { kind: "elapsed", ms: deltaMs as Milliseconds };
}

/** True only for an already-computed `Age` that is at or under `maxAge`. A clock inconsistency is never fresh, by construction — see `ageOf`. */
export function isFresh(age: Age, maxAge: Milliseconds): boolean {
  return age.kind === "elapsed" && age.ms <= maxAge;
}
