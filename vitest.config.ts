import { defineConfig } from "vitest/config";

// Kept deliberately minimal: no framework plugin (no Next.js, no React) because
// lib/ must stay framework-free through M2's Next.js adoption. Later milestones
// that add app/ or components/ can layer a separate vitest project config on
// top of this one rather than editing it, so M1's config never has to know
// about UI concerns.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    watch: false,
  },
});
