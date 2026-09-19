import { describe, it } from "vitest";
import { refundApproval } from "../domain.js";
import { assertCaseDecidesAndReplaysAsExpected } from "../../shared/test-helpers.js";

/**
 * Every case in this domain, run through the real, frozen `decide()`, and
 * asserted by `RuleTrace.kind`/structured fields — never by
 * the `reason` text inside `missing` (ADR 0001's amendment). See
 * `../../shared/test-helpers.ts` for what "asserted" means here: outcome,
 * mechanical cause, and a full audit record/replay round trip, all in one
 * call per case.
 */
describe("domain: refund-approval", () => {
  for (const testCase of refundApproval.cases) {
    it(`${testCase.id} — ${testCase.title}`, () => {
      assertCaseDecidesAndReplaysAsExpected(testCase);
    });
  }
});
