import { describe, it } from "vitest";
import { contentModeration } from "../domain.js";
import { assertCaseDecidesAndReplaysAsExpected } from "../../shared/test-helpers.js";

/** See refund-approval's own test file header for what this asserts and why. */
describe("domain: content-moderation", () => {
  for (const testCase of contentModeration.cases) {
    it(`${testCase.id} — ${testCase.title}`, () => {
      assertCaseDecidesAndReplaysAsExpected(testCase);
    });
  }
});
