export {
  parseCapturedAt,
  parseMilliseconds,
  systemNow,
  ageOf,
  isFresh,
  type CapturedAt,
  type Milliseconds,
  type InvalidCapturedAt,
  type InvalidMilliseconds,
  type Age,
} from "./time.js";

export {
  PROVENANCE_KINDS,
  type Provenance,
  type InvalidProvenance,
} from "./provenance.js";

export {
  createSignal,
  type Signal,
  type SignalParams,
  type SignalReading,
} from "./signal.js";

export { type Requirement, type Supplier } from "./requirement.js";

export { analyzeGaps, type Gap } from "./gap.js";

export {
  parseSignal,
  parseProvenance,
  type SignalValidationError,
  type ProvenanceValidationError,
} from "./validation.js";
