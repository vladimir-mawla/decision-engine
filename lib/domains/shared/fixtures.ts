import { parseConfidence, type Confidence } from "../../contracts/confidence.js";
import { parseCostOfBeingWrong, type CostOfBeingWrong } from "../../cost-model/cost.js";
import {
  parseCapturedAt,
  parseMilliseconds,
  type CapturedAt,
  type Milliseconds,
} from "../../signals/time.js";

/**
 * Shared fixture-construction helpers for lib/domains/**. M6 is domains
 * built ON the frozen engine, never a change TO it — everything here is a
 * thin, honest wrapper around the real parsers `lib/contracts`,
 * `lib/cost-model`, and `lib/signals` already export, never a shortcut.
 *
 * Every branded value below goes through its real parser
 * (`parseConfidence` / `parseCostOfBeingWrong` / `parseCapturedAt` /
 * `parseMilliseconds`) rather than a shortcut type-assertion straight onto
 * either project's branded numeric type. That is not merely a style
 * preference here: `lib/contracts/__tests__/brand-casts.test.ts` scans
 * this project's ENTIRE `lib/` tree — `lib/domains/` included, no
 * directory is exempt — for exactly that shortcut outside the two files
 * that define the brands, and its own doc comment names "a time-pressured
 * domain implementation (M6)" as precisely the failure mode it exists to
 * catch. So the helpers below are the only place in this package a domain
 * author needs to reach for, and they never take the shortcut the test
 * forbids. (Deliberately not spelled out as literal code here, since this
 * comment lives under `lib/domains/` and that test's own matcher is a
 * per-line text scan with no comment-stripping — writing the forbidden
 * shape even in prose would trip it.)
 */

export function mustConfidence(value: number): Confidence {
  const parsed = parseConfidence(value);
  if (!parsed.ok) {
    throw new Error(`invalid fixture confidence: ${value}`);
  }
  return parsed.value;
}

export function mustCost(usd: number): CostOfBeingWrong {
  const parsed = parseCostOfBeingWrong(usd);
  if (!parsed.ok) {
    throw new Error(`invalid fixture cost: ${usd}`);
  }
  return parsed.value;
}

export function mustMs(ms: number): Milliseconds {
  const parsed = parseMilliseconds(ms);
  if (!parsed.ok) {
    throw new Error(`invalid fixture duration: ${ms}`);
  }
  return parsed.value;
}

export function mustCapturedAt(iso: string, now: CapturedAt): CapturedAt {
  const parsed = parseCapturedAt(iso, now);
  if (!parsed.ok) {
    throw new Error(`invalid fixture timestamp: ${iso} relative to ${now}`);
  }
  return parsed.value;
}

/**
 * The one bootstrap cast in `lib/domains/**`, mirroring
 * `lib/signals/time.ts`'s own `systemNow()` — this project's single real
 * accepted "an ISO string becomes a CapturedAt here, once" touchpoint.
 * Domains need a FIXED, deterministic "now" (never the wall clock —
 * `decide()`'s own determinism guarantee depends on every caller doing the
 * same) to produce reproducible fixtures and a demo whose output never
 * drifts between runs, so each domain calls this exactly once for its own
 * root instant, then validates every other timestamp against it through
 * `mustCapturedAt`. Unlike the two brands covered above, `brand-casts.
 * test.ts` does not scan for a cast onto this type — the same asymmetry
 * `lib/signals/time.ts` itself relies on for `systemNow()`.
 */
export function rootNow(iso: string): CapturedAt {
  return iso as CapturedAt;
}

export const MINUTES = 60 * 1000;
export const HOURS = 60 * MINUTES;
export const DAYS = 24 * HOURS;

/** An ISO-8601 instant `msBefore` milliseconds before `now` — for building realistic, relatively-dated signal timestamps without hand-computing calendar arithmetic per fixture. */
export function before(now: CapturedAt, msBefore: number): string {
  return new Date(Date.parse(now) - msBefore).toISOString();
}

/** The fixed "now" shared by all three M6 domains and the demo script — chosen to match this build's own date so the demo output reads as "today." Never read from the wall clock. */
export const DEMO_NOW: CapturedAt = rootNow("2026-09-19T15:00:00.000Z");
