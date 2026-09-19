import { defineConfig } from "vitest/config";

// Kept deliberately minimal: no framework plugin (no Next.js, no React) because
// lib/ must stay framework-free through M2's Next.js adoption. Later milestones
// that add app/ or components/ can layer a separate vitest project config on
// top of this one rather than editing it, so M1's config never has to know
// about UI concerns.
//
// M7 addition: "tests/**/*.test.ts" — purely additive, same shape as the
// package.json precedent context-graph.json's freeze_boundary_notes already
// documents ("every milestone that ships a runnable demo has added exactly
// one new npm script ... purely additive and non-behavioural"). M7's own
// freeze boundary (.genesis/PLAN.md) is `tests/failures/**` — a new
// top-level directory outside both `lib/` and `app/` — and this file is the
// one place that has to know that directory exists for `npm test -- failures`
// to select it at all. Every existing include glob, and everything every
// existing test file does, is untouched: no lib/app test's behavior changes.
export default defineConfig({
  test: {
    environment: "node",
    // app/ is included so the milestone drift guard can run. The dependency
    // direction is unaffected: app/ may import lib/, never the reverse, and
    // no lib/ test imports anything under app/.
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "tests/**/*.test.ts"],
    watch: false,
  },
});
