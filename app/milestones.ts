/**
 * Single source of truth for the progress shown on the landing page
 * (app/page.tsx). On an earlier project, the landing page's prose hardcoded
 * its milestone number directly ("we're on milestone 4...") and that text
 * went stale on a public URL for two whole milestones because updating it
 * meant remembering to hunt down the sentence. The fix here is structural,
 * not procedural: exactly one place — this array — knows the milestone
 * list and each one's status. app/page.tsx only ever reads MILESTONES and
 * currentMilestone(); it never writes a milestone number into its own
 * text. Advancing progress is a one-line edit to this file.
 *
 * Mirrors the milestone table in .genesis/PLAN.md (titles shortened for
 * display). This file is NOT read by the genesis loop tooling — PLAN.md
 * remains the machine-parseable source for loops; this is the human-facing
 * mirror for the deployed page. Keep the two in sync when a milestone's
 * title or status changes.
 */
export interface Milestone {
  readonly id: number;
  readonly title: string;
  readonly status: "done" | "in-progress" | "planned";
}

export const MILESTONES: readonly Milestone[] = [
  { id: 1, title: "Contracts: the five outcomes and the cost model", status: "done" },
  { id: 2, title: "Deploy a live skeleton to Vercel", status: "in-progress" },
  { id: 3, title: "Signals: typed evidence with provenance", status: "done" },
  { id: 4, title: "The decision engine", status: "done" },
  { id: 5, title: "The audit trail", status: "done" },
  { id: 6, title: "Three domains with realistic data", status: "done" },
  { id: 7, title: "The failure suite", status: "done" },
  { id: 8, title: "The demo UI", status: "in-progress" },
  { id: 9, title: "Deliverables", status: "done" },
] as const;

/**
 * The milestone the page should describe as "current". Prefers an
 * in-progress milestone; falls back to the first not-yet-done one if
 * none is explicitly marked in-progress (e.g. between loop runs); returns
 * undefined only if every milestone is done, in which case the page
 * should say so rather than name a milestone at all.
 */
export function currentMilestone(): Milestone | undefined {
  return (
    MILESTONES.find((m) => m.status === "in-progress") ??
    MILESTONES.find((m) => m.status === "planned")
  );
}
