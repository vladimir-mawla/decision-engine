export { decide, type DecideInput, type InputRejected } from "./decide.js";

export {
  type EvidencedDecision,
  type EvidencedExecuteDecision,
  type EvidencedAskDecision,
  type EvidencedDeferDecision,
  type EvidencedEscalateDecision,
  type EvidencedRefuseDecision,
  toExecuteDecision,
  toAskDecision,
  toDeferDecision,
  toEscalateDecision,
  toRefuseDecision,
} from "./evidence.js";

export { findProhibition, type Prohibition } from "./prohibition.js";

export { matchDecision, isInputRejected, type DecisionHandlers } from "./match.js";

export { precedenceRank, gapPrecedenceRank, selectWinningGap } from "./precedence.js";

export { findSatisfaction, type Satisfaction } from "./satisfaction.js";

export { aggregateConfidence, type Aggregate } from "./aggregate.js";

export { isBarSaturated } from "./stakes.js";

export { deriveReconsiderAt } from "./reconsider.js";

export {
  humanGapReason,
  clockInconsistencyReason,
  costCeilingReason,
  insufficientNowReason,
  noRequirementsReason,
  internalErrorReason,
  internalInconsistencyReason,
  unusableInputReason,
  valueRejectionReason,
} from "./reasons.js";
