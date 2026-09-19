export { refundApproval } from "./refund-approval/domain.js";
export { codeDeploy } from "./code-deploy/domain.js";
export { contentModeration } from "./content-moderation/domain.js";
export type { Domain, DomainCase, ExpectedOutcome } from "./types.js";

import { refundApproval } from "./refund-approval/domain.js";
import { codeDeploy } from "./code-deploy/domain.js";
import { contentModeration } from "./content-moderation/domain.js";
import type { Domain } from "./types.js";

/** All three M6 domains, in the order the plan lists them (refund approval, code deploy, content moderation). */
export const ALL_DOMAINS: readonly Domain[] = [refundApproval, codeDeploy, contentModeration];
