import { parseConfidence, type Confidence } from "../../contracts/confidence.js";
import type { Action } from "../../contracts/action.js";
import { parseCostOfBeingWrong } from "../../cost-model/cost.js";
import type { Reversibility } from "../../cost-model/reversibility.js";
import { parseCapturedAt, parseMilliseconds, type CapturedAt, type Milliseconds } from "../../signals/time.js";
import type { Requirement, Supplier } from "../../signals/requirement.js";
import { createSignal, type Signal } from "../../signals/signal.js";
import type { Provenance } from "../../signals/provenance.js";
import type { DecideInput, Prohibition } from "../../decide/index.js";

/** Same fixed "now" convention lib/decide and lib/signals's own fixtures use. */
export const NOW = "2026-09-19T12:00:00.000Z" as CapturedAt;

export function capturedAt(iso: string, relativeTo: CapturedAt = NOW): CapturedAt {
  const parsed = parseCapturedAt(iso, relativeTo);
  if (!parsed.ok) throw new Error(`fixture capturedAt ${iso} should be valid relative to ${relativeTo}`);
  return parsed.value;
}

export function confidence(value: number): Confidence {
  const parsed = parseConfidence(value);
  if (!parsed.ok) throw new Error(`fixture confidence ${value} should be valid`);
  return parsed.value;
}

export function millis(value: number): Milliseconds {
  const parsed = parseMilliseconds(value);
  if (!parsed.ok) throw new Error(`fixture millis ${value} should be valid`);
  return parsed.value;
}

const HOUR = 60 * 60 * 1000;

export function sampleAction(
  overrides: {
    readonly domain?: string;
    readonly type?: string;
    readonly parameters?: Readonly<Record<string, unknown>>;
    readonly cost?: number;
    readonly reversibility?: Reversibility;
  } = {},
): Action {
  const cost = parseCostOfBeingWrong(overrides.cost ?? 500);
  if (!cost.ok) throw new Error("fixture cost should be valid");
  return {
    domain: overrides.domain ?? "test",
    type: overrides.type ?? "test-action",
    parameters: overrides.parameters ?? {},
    costOfBeingWrong: cost.value,
    reversibility: overrides.reversibility ?? "reversible-with-cost",
  };
}

export function fixtureSignal(
  overrides: {
    readonly id?: string;
    readonly kind?: string;
    readonly value?: unknown;
    readonly source?: Provenance;
    readonly capturedAtIso?: string;
    readonly confidence?: number;
  } = {},
): Signal {
  return createSignal({
    id: overrides.id ?? "sig-1",
    kind: overrides.kind ?? "customer.identity.verified",
    value: overrides.value ?? true,
    source: overrides.source ?? { kind: "system", system: "identity-service" },
    capturedAt: capturedAt(overrides.capturedAtIso ?? new Date(Date.parse(NOW) - HOUR).toISOString()),
    confidence: confidence(overrides.confidence ?? 0.9),
  });
}

export function fixtureRequirement(
  overrides: {
    readonly signalKind?: string;
    readonly description?: string;
    readonly minConfidence?: number;
    readonly maxAgeMs?: number;
    readonly supplier?: Supplier;
  } = {},
): Requirement {
  return {
    signalKind: overrides.signalKind ?? "customer.identity.verified",
    description: overrides.description ?? "the customer's verified identity",
    minConfidence: confidence(overrides.minConfidence ?? 0.8),
    maxAge: millis(overrides.maxAgeMs ?? 24 * HOUR),
    supplier: overrides.supplier ?? { kind: "counterparty", party: "customer" },
  };
}

export function fixtureInput(
  overrides: {
    readonly action?: Action;
    readonly requirements?: readonly Requirement[];
    readonly signals?: readonly Signal[];
    readonly prohibitions?: readonly Prohibition[];
    readonly now?: CapturedAt;
  } = {},
): DecideInput {
  return {
    action: overrides.action ?? sampleAction(),
    requirements: overrides.requirements ?? [fixtureRequirement()],
    signals: overrides.signals ?? [fixtureSignal()],
    prohibitions: overrides.prohibitions ?? [],
    now: overrides.now ?? NOW,
  };
}

/**
 * Deterministic PRNG (mulberry32) — NOT `Math.random()`. Property tests in
 * this package generate "many cases, not three hand-picked ones" (the
 * milestone brief's own words), but they must stay reproducible: a flaky
 * failure that can't be reproduced from the same seed would be a strictly
 * worse test than three fixed examples. Seeded once per test file/describe
 * block, threaded explicitly — never a module-level global RNG.
 */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REVERSIBILITY_LEVELS: readonly Reversibility[] = [
  "reversible-no-trace",
  "reversible-with-cost",
  "reversible-with-delay",
  "irreversible",
];

const SUPPLIERS: readonly Supplier[] = [
  { kind: "counterparty", party: "customer" },
  { kind: "time", waitingOn: "a settlement" },
  { kind: "human", reason: "no confidence number would be enough" },
];

/**
 * Generates ONE varied, self-consistent DecideInput from a PRNG — varying
 * reversibility, cost, requirement count, per-requirement supplier/
 * freshness/confidence, and occasionally a prohibition — so the property
 * tests in __tests__/*.test.ts exercise every outcome family (execute,
 * ask, defer, escalate via multiple distinct reasons, refuse) across many
 * generated cases rather than repeating one shape.
 */
export function generateInput(rng: () => number, index: number): DecideInput {
  const reversibility = REVERSIBILITY_LEVELS[Math.floor(rng() * REVERSIBILITY_LEVELS.length)]!;
  const cost = Math.floor(rng() * 60_000);
  const action = sampleAction({ reversibility, cost, domain: "audit-property-test", type: `case-${index}` });

  const reqCount = 1 + Math.floor(rng() * 3);
  const requirements: Requirement[] = [];
  const signals: Signal[] = [];

  for (let i = 0; i < reqCount; i++) {
    const signalKind = `property.signal.${index}.${i}`;
    const supplier = SUPPLIERS[Math.floor(rng() * SUPPLIERS.length)]!;
    const req = fixtureRequirement({
      signalKind,
      description: `generated requirement ${index}.${i}`,
      minConfidence: 0.5 + rng() * 0.4,
      maxAgeMs: 30 * 60 * 1000,
      supplier,
    });
    requirements.push(req);

    // Roughly half the time, supply a satisfying-or-not signal; the rest
    // of the time, leave the requirement absent (no candidate at all) —
    // both are real, common shapes decide() must handle.
    if (rng() < 0.7) {
      const fresh = rng() < 0.8;
      const ageMs = fresh ? rng() * 20 * 60 * 1000 : (30 + rng() * 90) * 60 * 1000;
      signals.push(
        fixtureSignal({
          id: `property-sig-${index}-${i}`,
          kind: signalKind,
          confidence: rng(),
          capturedAtIso: new Date(Date.parse(NOW) - ageMs).toISOString(),
        }),
      );
    }
  }

  // `willMatch` is decided ONCE, here, and closed over — never re-drawn
  // from `rng()` inside `matches` itself. `matches` must be a pure,
  // repeatable predicate (like any real Prohibition — ADR 0002), and a
  // prohibition that consumes fresh randomness on every call would make
  // calling decide() twice on the SAME input disagree with itself, which
  // is exactly the non-determinism this whole milestone exists to rule
  // out — a bug in this generator would otherwise silently masquerade as
  // a replay failure in the code under test.
  const prohibitions: Prohibition[] = [];
  if (rng() < 0.15) {
    const willMatch = rng() < 0.5;
    prohibitions.push({
      id: `prohibition-${index}`,
      reason: "generated categorical prohibition",
      matches: () => willMatch,
    });
  }

  return { action, requirements, signals, prohibitions, now: NOW };
}
