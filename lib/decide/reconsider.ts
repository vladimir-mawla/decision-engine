import type { CapturedAt, Milliseconds } from "../signals/time.js";

/**
 * DECISION 5 — where `reconsiderAt` comes from.
 *
 * M1's `MissingTime.reconsiderAt` is required, and M3 explicitly does not
 * supply it (Requirement's `Supplier.time` variant carries `waitingOn` —
 * WHAT the clock is waiting for — but deliberately not WHEN, because "M4
 * still owns *when* to reconsider... that's a scheduling policy, not a fact
 * about the requirement" — requirement.ts). So this is squarely M4's job,
 * and the brief's warning is explicit: derive it from something real, never
 * invent a plausible-looking timestamp.
 *
 * The one field guaranteed to exist on every `time`-supplier Gap,
 * regardless of *why* the requirement is unmet (`absent` / `stale` /
 * `below-confidence` — see gap.ts), is `requirement.maxAge`: the domain
 * author's own stated answer to "how fresh does evidence of this kind need
 * to be." That is a real, declared fact about the requirement, not a
 * fabrication — and reading it as "how often evidence of this kind is
 * expected to be refreshed" is the most direct, honest interpretation
 * available. `reconsiderAt = now + requirement.maxAge`.
 *
 * Two alternatives were considered and rejected:
 *
 *   - Anchoring to the stale/below-confidence candidate's own `capturedAt`
 *     (`capturedAt + maxAge`) — genuinely "real" for a `stale` Gap, but by
 *     construction that instant is ALREADY IN THE PAST once a signal is
 *     stale (staleness means `now` is already past `capturedAt + maxAge`).
 *     Reporting a `reconsiderAt` that already elapsed does not tell anyone
 *     when to check back — it just restates that the signal expired.
 *   - It also does not generalize to an `absent` Gap, which has no signal
 *     and therefore no `capturedAt` to anchor to at all. A rule that only
 *     works for one of the three Gap reasons would force decide() into
 *     exactly the "pile of conditionals" this milestone's brief warns
 *     against, for a distinction (why the requirement is unmet) that has
 *     no bearing on when it is worth checking again.
 *
 * `now + maxAge` is real (both operands are actual values decide() was
 * given, not guesses), uniform across all three Gap reasons, and always in
 * the future relative to the clock decide() was actually called with.
 *
 * If `requirement.maxAge` cannot honestly be used — specifically, when the
 * only reason there is nothing to wait on is a clock inconsistency (see
 * DECISION 6 in decide.ts) — this function is never called at all for that
 * gap; decide.ts escalates instead of calling `deriveReconsiderAt`, so an
 * undeterminable `reconsiderAt` is visible as a different outcome, never
 * silently defaulted (see decide.ts's clock-inconsistency branch).
 */
export function deriveReconsiderAt(now: CapturedAt, maxAge: Milliseconds): string {
  // `MissingTime.reconsiderAt` (lib/contracts/decision.ts) is a plain
  // `string`, not a branded `CapturedAt` — it explicitly allows a
  // non-clock-based description ("when the price settles") as an
  // alternative to an instant, so it is not re-validated through
  // `parseCapturedAt` here. `maxAge` is a non-negative `Milliseconds` by
  // construction (lib/signals/time.ts's `parseMilliseconds` rejects
  // negative durations), so this sum is always at or after `now`.
  return new Date(Date.parse(now) + maxAge).toISOString();
}
