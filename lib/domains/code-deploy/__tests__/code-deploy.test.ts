import { describe, it } from "vitest";
import { codeDeploy } from "../domain.js";
import { assertCaseDecidesAndReplaysAsExpected } from "../../shared/test-helpers.js";

/** See refund-approval's own test file header for what this asserts and why. */
describe("domain: code-deploy", () => {
  for (const testCase of codeDeploy.cases) {
    it(`${testCase.id} — ${testCase.title}`, () => {
      assertCaseDecidesAndReplaysAsExpected(testCase);
    });
  }
});
