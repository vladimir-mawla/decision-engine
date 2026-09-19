import { defineConfig } from "vitest/config";

// Kept deliberately minimal: no framework plugin (no Next.js, no React) because
// lib/ must stay framework-free through M2's Next.js adoption. Later milestones
// that add app/ or components/ can layer a separate vitest project config on
// top of this one rather than editing it, so M1's config never has to know
// about UI concerns.
export default defineConfig({
  test: {
    environment: "node",
    // app/ is included so the milestone drift guard can run. The dependency
    // direction is unaffected: app/ may import lib/, never the reverse, and
    // no lib/ test imports anything under app/.
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    watch: false,
  },
});
