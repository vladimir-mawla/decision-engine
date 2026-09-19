import type { Signal, SignalReading } from "./signal.js";
import type { CapturedAt, Milliseconds } from "./time.js";

/**
 * A `ValueConstraint` is a check on a signal's *value*, expressed as DATA
 * the engine interprets generically — never as a predicate closure. A
 * closure (`valueCheck?: (v: unknown) => boolean`) was considered and
 * rejected: it would reproduce the exact wart `Prohibition.matches`
 * already has (lib/decide/prohibition.ts) — an unserializable function
 * that forced M5's audit trail to record prohibitions by id and require
 * the caller to supply the real predicates again at replay time. A
 * constraint expressed as data stays replayable and auditable BY
 * CONSTRUCTION: `lib/audit/rule.ts` can name the exact constraint that
 * failed, directly in the audit record, with no external rule catalog
 * needed at replay (contrast `Prohibition`, whose `matches` can never be
 * recorded, only its id).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE OPERATOR SET — chosen deliberately, kept deliberately small
 * ─────────────────────────────────────────────────────────────────────────
 * Four operators, each earning its place against three real domains
 * (refund approval, code deploy, content moderation):
 *
 * - `equals`   — exact match for a CATEGORICAL verdict a domain signal
 *   reports as a discrete value: a fraud assessment reading exactly
 *   `"clear"`, a moderation classification reading exactly `"safe"`. This
 *   is the one every domain needs first — "did the signal say the one
 *   specific thing that clears this action" — and it is the case the
 *   milestone's headline example (fraud CLEAN vs. FRAUDULENT) exercises
 *   directly.
 * - `lte`      — an upper bound on a numeric SCORE: a fraud/risk score at
 *   or under a ceiling, a moderation toxicity score at or under a
 *   threshold, a deploy's blast-radius metric under a limit. Inclusive
 *   (`<=`), matching how every other bar in this project is stated
 *   (`requirement.minConfidence`/`requiredConfidence` are both `>=`/`<=`,
 *   never strict) — a policy author should not have to reason about an
 *   off-by-epsilon boundary that the rest of the codebase never asks them
 *   to reason about elsewhere.
 * - `gte`      — the symmetric floor: a code-review approval COUNT at or
 *   above a minimum, a reputation score at or above a minimum. Without
 *   this, "at least N" would have no honest expression at all — negating
 *   it through `lte` on a transformed value is exactly the kind of
 *   caller-side cleverness this project's fail-closed, no-surprises style
 *   avoids elsewhere (see e.g. cost.ts's own refusal to let a caller
 *   substitute a transformed number for a real one).
 * - `in`       — set membership against a short, explicit allow-list of
 *   discrete values: a moderation category in `{"safe", "low-risk"}`, a
 *   deploy target environment in `{"staging", "canary"}`. This is what
 *   keeps `equals` from being reached for twice with a manually-duplicated
 *   requirement when a domain genuinely has more than one acceptable
 *   discrete value — without it, a two-valued allow-list would need two
 *   separate Requirements for the same signal kind, which is a worse
 *   shape than one constraint naming the set once.
 *
 * DELIBERATELY LEFT OUT, and why — the operator set grows without limit
 * is exactly the "bespoke rules per domain" problem ADR 0001 rejected,
 * one layer down, so every omission below is a real decision, not an
 * oversight:
 *
 * - `notEquals` / a blocklist operator — an allow-list (`equals`/`in`)
 *   already says everything a blocklist would, for the closed, small
 *   value spaces these three domains actually use (a fraud verdict, a
 *   moderation category), and a blocklist invites an ever-growing set of
 *   "everything except X, Y, Z" special cases as new bad values are
 *   discovered — the allow-list has to be re-stated instead, which is the
 *   right amount of friction for a policy decision.
 * - `lt` / `gt` (strict variants) — every other bar in this codebase is
 *   inclusive; adding strict variants would double the numeric operator
 *   surface for a distinction (`< 3` vs. `<= 2.999...`) that no real
 *   policy in these three domains needs stated to floating-point
 *   precision.
 * - Regex / substring / "contains" — this would let the engine start
 *   pattern-matching the CONTENT of free text, which is a much larger
 *   step toward "the engine re-implements domain judgment" than a
 *   bounded numeric or categorical check; a domain that needs this should
 *   emit a categorical signal (a `moderation.classification` signal kind)
 *   computed by ITS OWN judgment, not ask the engine to classify text.
 * - Compound / boolean combinators (`and`/`or`/`not` of constraints) — a
 *   requirement is already the unit of composition (multiple Requirements
 *   already combine via aggregation/precedence, lib/decide/aggregate.ts
 *   and precedence.ts); a second, parallel composition mechanism INSIDE a
 *   single constraint would be the unbounded expression language this
 *   milestone is explicitly warned against building.
 * - Cross-signal comparison (`value of signal A vs. value of signal B`) —
 *   every constraint here is evaluated against exactly one signal's own
 *   value, matching how `Requirement` itself already names exactly one
 *   `signalKind`; comparing two signals to each other is a `derived`
 *   signal's job (lib/signals/provenance.ts's `derived` variant), computed
 *   by a domain and asserted as its own signal — not a new mode for the
 *   engine's own constraint evaluator to grow into.
 */
export type ValueConstraint =
  | { readonly op: "equals"; readonly value: string | number | boolean }
  | { readonly op: "lte"; readonly value: number }
  | { readonly op: "gte"; readonly value: number }
  | { readonly op: "in"; readonly values: readonly (string | number | boolean)[] };

/**
 * The result of checking one constraint against one actual value.
 * Deliberately NOT a bare boolean: `violated` (the value is exactly the
 * shape the constraint expects, and just doesn't clear it) is a genuinely
 * different fact from `type-mismatch` (the value isn't even comparable —
 * a string against `lte`, an object against `equals`, `undefined`) or
 * `malformed` (the constraint ITSELF isn't well-formed — an unknown `op`,
 * a missing/wrong-shaped `value`/`values`). All three collapse to "not
 * satisfied" for decision purposes (see decide.ts) — TYPE MISMATCHES FAIL
 * CLOSED, never throw, and are treated as "constraint not satisfied", the
 * same fail-closed instinct this project applies everywhere else (a
 * reversibility that can't be determined resolves to the worst case, a
 * cost that can't be parsed resolves to WORST_CASE_COST) — but keeping the
 * three reasons distinct is what lets a test (and a human reading an
 * audit trail) tell "the evidence disagreed" apart from "the evidence
 * wasn't even the right shape" apart from "the policy itself is broken",
 * without ever needing the actual value to explain which.
 */
export type ConstraintCheck =
  | { readonly satisfied: true }
  | {
      readonly satisfied: false;
      readonly reason: "violated" | "type-mismatch" | "malformed" | "unreadable";
    };

/** The failing half of `ConstraintCheck`, named so callers that already know a check failed don't have to re-narrow the union themselves. */
export type ConstraintFailure = Extract<ConstraintCheck, { readonly satisfied: false }>;

function isConstraintPrimitive(value: unknown): value is string | number | boolean {
  if (typeof value === "string" || typeof value === "boolean") return true;
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * The single defensive property read this module needs, reproduced
 * locally rather than imported — the same discipline every other
 * validation module in this project follows (lib/contracts/validation.ts,
 * lib/signals/validation.ts, lib/audit/validation.ts all reproduce this
 * exact helper rather than share it): `obj[key]` can throw for reasons
 * that have nothing to do with the constraint's shape (a getter that
 * throws, a Proxy `get` trap that throws), and a failed read is folded
 * into "absent", never allowed to propagate.
 */
function readProp(obj: object, key: string): unknown {
  try {
    return (obj as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/**
 * Evaluates a constraint against an already-obtained value. Accepts
 * `unknown` for BOTH arguments — not just `actualValue` — because a
 * constraint can arrive from the same untrusted places a `Requirement`
 * can (a replayed audit record, a hand-built hostile test fixture): an
 * unknown `op`, a `value`/`values` that is the wrong shape, or a `value`
 * behind a throwing getter must all fail closed to "not satisfied", never
 * throw. The whole body is wrapped in one try/catch as a last-resort
 * backstop (mirroring decide.ts's own outer guard) on top of the
 * per-branch defensive reads below, so a hostile constraint that is also a
 * throwing Proxy at the top level (not just on one property) still
 * resolves to `malformed` rather than escaping this function.
 */
export function evaluateConstraint(constraint: unknown, actualValue: unknown): ConstraintCheck {
  try {
    if (typeof constraint !== "object" || constraint === null) {
      return { satisfied: false, reason: "malformed" };
    }

    const op = readProp(constraint, "op");

    switch (op) {
      case "equals": {
        const expected = readProp(constraint, "value");
        if (!isConstraintPrimitive(expected)) return { satisfied: false, reason: "malformed" };
        if (!isConstraintPrimitive(actualValue)) return { satisfied: false, reason: "type-mismatch" };
        return actualValue === expected ? { satisfied: true } : { satisfied: false, reason: "violated" };
      }
      case "lte": {
        const bound = readProp(constraint, "value");
        if (typeof bound !== "number" || !Number.isFinite(bound)) {
          return { satisfied: false, reason: "malformed" };
        }
        if (typeof actualValue !== "number" || !Number.isFinite(actualValue)) {
          return { satisfied: false, reason: "type-mismatch" };
        }
        return actualValue <= bound ? { satisfied: true } : { satisfied: false, reason: "violated" };
      }
      case "gte": {
        const bound = readProp(constraint, "value");
        if (typeof bound !== "number" || !Number.isFinite(bound)) {
          return { satisfied: false, reason: "malformed" };
        }
        if (typeof actualValue !== "number" || !Number.isFinite(actualValue)) {
          return { satisfied: false, reason: "type-mismatch" };
        }
        return actualValue >= bound ? { satisfied: true } : { satisfied: false, reason: "violated" };
      }
      case "in": {
        const valuesRaw = readProp(constraint, "values");
        if (!Array.isArray(valuesRaw) || valuesRaw.length === 0 || !valuesRaw.every(isConstraintPrimitive)) {
          return { satisfied: false, reason: "malformed" };
        }
        if (!isConstraintPrimitive(actualValue)) return { satisfied: false, reason: "type-mismatch" };
        return (valuesRaw as readonly (string | number | boolean)[]).includes(actualValue)
          ? { satisfied: true }
          : { satisfied: false, reason: "violated" };
      }
      default:
        // Unknown/missing op — fails closed to "malformed", never "doesn't
        // apply". A constraint this engine cannot even interpret must
        // never be silently treated as satisfied.
        return { satisfied: false, reason: "malformed" };
    }
  } catch {
    return { satisfied: false, reason: "malformed" };
  }
}

/**
 * The one real caller of `Signal.read` inside the engine (see gap.ts's and
 * satisfaction.ts's own callers of THIS function for where it is actually
 * invoked). Every other place `lib/decide`/`lib/signals` touches a Signal
 * reads only its metadata (`kind`/`capturedAt`/`confidence`) directly —
 * `.read()` has had elaborate staleness narrowing since M3 with no
 * decision-path caller until now.
 *
 * PRECONDITION, enforced by every real caller, never by this function
 * itself: a constraint runs only AFTER the existing freshness and
 * confidence checks already passed for this exact candidate (same
 * `maxAge`/`now` — see gap.ts's `satisfying`/satisfaction.ts's identical
 * filter). So `signal.read(maxAge, now)` here should always report
 * `"fresh"` — it re-derives the same age from the same two inputs
 * `isFresh`/`ageOf` already checked. The `"stale"`/`"clock-inconsistency"`
 * branches below are kept anyway, explicit and honest, rather than
 * assumed unreachable: if a caller's own freshness check and `Signal.read`
 * ever disagreed (a defensive-programming scenario, not a normal one),
 * this fails closed to `"unreadable"` — collapsed into "not satisfied" by
 * every caller, exactly like `type-mismatch`/`malformed` — rather than
 * fabricating an answer from a reading it was never given.
 */
export function checkValueConstraint(
  signal: Signal,
  constraint: ValueConstraint,
  maxAge: Milliseconds,
  now: CapturedAt,
): ConstraintCheck {
  let reading: SignalReading<unknown>;
  try {
    reading = signal.read(maxAge, now);
  } catch {
    return { satisfied: false, reason: "unreadable" };
  }

  switch (reading.status) {
    case "fresh":
      return evaluateConstraint(constraint, reading.value);
    case "stale":
    case "clock-inconsistency":
      return { satisfied: false, reason: "unreadable" };
  }
}
