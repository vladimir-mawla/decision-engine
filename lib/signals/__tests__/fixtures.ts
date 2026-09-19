import { parseConfidence, type Confidence } from "../../contracts/confidence.js";
import { parseCapturedAt, parseMilliseconds, type CapturedAt, type Milliseconds } from "../time.js";
import type { Requirement, Supplier } from "../requirement.js";
import { createSignal, type Signal } from "../signal.js";
import type { Provenance } from "../provenance.js";

/** Fixed "now" for every test in this suite — 2026-09-19, the day this milestone was built. Never read from the wall clock (see time.ts's `systemNow` isolation note). */
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

export function fixtureSignal(overrides: {
  readonly id?: string;
  readonly kind?: string;
  readonly value?: unknown;
  readonly source?: Provenance;
  readonly capturedAtIso?: string;
  readonly confidence?: number;
} = {}): Signal {
  return createSignal({
    id: overrides.id ?? "sig-1",
    kind: overrides.kind ?? "customer.identity.verified",
    value: overrides.value ?? true,
    source: overrides.source ?? { kind: "system", system: "identity-service" },
    capturedAt: capturedAt(overrides.capturedAtIso ?? new Date(Date.parse(NOW) - HOUR).toISOString()),
    confidence: confidence(overrides.confidence ?? 0.9),
  });
}

export function fixtureRequirement(overrides: {
  readonly signalKind?: string;
  readonly description?: string;
  readonly minConfidence?: number;
  readonly maxAgeMs?: number;
  readonly supplier?: Supplier;
} = {}): Requirement {
  return {
    signalKind: overrides.signalKind ?? "customer.identity.verified",
    description: overrides.description ?? "the customer's verified identity",
    minConfidence: confidence(overrides.minConfidence ?? 0.8),
    maxAge: millis(overrides.maxAgeMs ?? 24 * HOUR),
    supplier: overrides.supplier ?? { kind: "counterparty", party: "customer" },
  };
}
