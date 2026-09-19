import { parseConfidence, type Confidence } from "../../lib/contracts/confidence.js";
import type { Action } from "../../lib/contracts/action.js";
import { parseCostOfBeingWrong, type CostOfBeingWrong } from "../../lib/cost-model/cost.js";
import type { Reversibility } from "../../lib/cost-model/reversibility.js";
import {
  parseCapturedAt,
  parseMilliseconds,
  type CapturedAt,
  type Milliseconds,
} from "../../lib/signals/time.js";
import { createSignal, type Signal } from "../../lib/signals/signal.js";
import type { Provenance } from "../../lib/signals/provenance.js";
import type { Requirement } from "../../lib/signals/requirement.js";
import type { ValueConstraint } from "../../lib/signals/constraint.js";
import type { DecideInput } from "../../lib/decide/decide.js";
import type { Prohibition } from "../../lib/decide/prohibition.js";

/**
 * Shared, self-contained fixture helpers for tests/failures/**. Deliberately
 * NOT imported from lib/decide/__tests__/fixtures.ts or any other frozen
 * __tests__ helper: `lib/**` is frozen for M7 (`git diff main -- lib app`
 * must stay empty), and this suite's own independence from lib/'s test
 * infrastructure is part of the point — every builder below goes through
 * the same real, public parsers every other caller of lib/ has to use
 * (parseConfidence / parseCostOfBeingWrong / parseMilliseconds /
 * parseCapturedAt / createSignal), never a shortcut brand cast, mirroring
 * lib/domains/shared/fixtures.ts's own discipline one layer further out.
 */

export const NOW: CapturedAt = "2026-09-19T12:00:00.000Z" as CapturedAt;

export function mustConfidence(value: number): Confidence {
  const parsed = parseConfidence(value);
  if (!parsed.ok) throw new Error(`bad fixture confidence: ${value}`);
  return parsed.value;
}

export function mustCost(usd: number): CostOfBeingWrong {
  const parsed = parseCostOfBeingWrong(usd);
  if (!parsed.ok) throw new Error(`bad fixture cost: ${usd}`);
  return parsed.value;
}

export function mustMs(ms: number): Milliseconds {
  const parsed = parseMilliseconds(ms);
  if (!parsed.ok) throw new Error(`bad fixture duration: ${ms}`);
  return parsed.value;
}

export function mustCapturedAt(iso: string, relativeTo: CapturedAt = NOW): CapturedAt {
  const parsed = parseCapturedAt(iso, relativeTo);
  if (!parsed.ok) throw new Error(`bad fixture timestamp: ${iso} relative to ${relativeTo}`);
  return parsed.value;
}

export const HOURS = 60 * 60 * 1000;
export const MINUTES = 60 * 1000;

/** An ISO instant `msBefore` milliseconds before `now`. */
export function before(now: CapturedAt, msBefore: number): string {
  return new Date(Date.parse(now) - msBefore).toISOString();
}

export function makeAction(overrides: {
  readonly domain?: string;
  readonly type?: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly cost?: number;
  readonly reversibility?: Reversibility;
} = {}): Action {
  return {
    domain: overrides.domain ?? "failures-suite",
    type: overrides.type ?? "test-action",
    parameters: overrides.parameters ?? {},
    costOfBeingWrong: mustCost(overrides.cost ?? 100),
    reversibility: overrides.reversibility ?? "reversible-with-cost",
  };
}

export function makeSignal(overrides: {
  readonly id?: string;
  readonly kind?: string;
  readonly value?: unknown;
  readonly source?: Provenance;
  readonly capturedAtIso?: string;
  readonly confidence?: number;
  readonly now?: CapturedAt;
} = {}): Signal {
  const now = overrides.now ?? NOW;
  return createSignal({
    id: overrides.id ?? "sig-1",
    kind: overrides.kind ?? "test.signal",
    value: overrides.value ?? "value",
    source: overrides.source ?? { kind: "system", system: "test-system" },
    capturedAt: mustCapturedAt(overrides.capturedAtIso ?? now, now),
    confidence: mustConfidence(overrides.confidence ?? 0.9),
  });
}

export function makeRequirement(overrides: {
  readonly signalKind?: string;
  readonly description?: string;
  readonly minConfidence?: number;
  readonly maxAgeMs?: number;
  readonly supplier?: Requirement["supplier"];
  readonly valueConstraint?: ValueConstraint;
} = {}): Requirement {
  const base: Requirement = {
    signalKind: overrides.signalKind ?? "test.signal",
    description: overrides.description ?? "a test fact",
    minConfidence: mustConfidence(overrides.minConfidence ?? 0.5),
    maxAge: mustMs(overrides.maxAgeMs ?? 6 * HOURS),
    supplier: overrides.supplier ?? { kind: "counterparty", party: "the customer" },
  };
  return overrides.valueConstraint === undefined
    ? base
    : { ...base, valueConstraint: overrides.valueConstraint };
}

export function makeInput(overrides: {
  readonly action?: Action;
  readonly requirements?: readonly Requirement[];
  readonly signals?: readonly Signal[];
  readonly prohibitions?: readonly Prohibition[];
  readonly now?: CapturedAt;
} = {}): DecideInput {
  return {
    action: overrides.action ?? makeAction(),
    requirements: overrides.requirements ?? [],
    signals: overrides.signals ?? [],
    prohibitions: overrides.prohibitions ?? [],
    now: overrides.now ?? NOW,
  };
}
