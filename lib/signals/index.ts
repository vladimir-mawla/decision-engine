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
  evaluateConstraint,
  checkValueConstraint,
  type ValueConstraint,
  type ConstraintCheck,
  type ConstraintFailure,
} from "./constraint.js";

export {
  checkHumanSupplierAgainstSatisfyingSignal,
  type SupplierPlausibilityHazard,
} from "./supplier-plausibility.js";

export {
  parseSignal,
  parseProvenance,
  parseValueConstraint,
  type SignalValidationError,
  type ProvenanceValidationError,
  type ValueConstraintValidationError,
} from "./validation.js";
