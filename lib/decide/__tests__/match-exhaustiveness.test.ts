import { describe, expect, it } from "vitest";
import { matchDecision } from "../match.js";
import type { EvidencedDecision } from "../evidence.js";
import type { InputRejected } from "../decide.js";

/**
 * FIX 2 (M4 second independent verification) — the type-level proof that
 * `matchDecision`'s handlers object cannot compile with a missing case,
 * `inputRejected` included. This is the concrete answer to "add a
 * type-level test proving a missing input-rejected case fails to
 * compile": the thing being proven IS a compile error, so the proof has
 * to run at compile time, via `npm run typecheck`
 * (`tsc -p tsconfig.lib.json --noEmit`, which already includes all of
 * `lib/**\/*.ts`) — not via a runtime assertion, which could not observe
 * a compile failure even in principle.
 *
 * The `@ts-expect-error` comment requires tsc to report an error on the
 * very next line. If a future change to `DecisionHandlers` ever made
 * `inputRejected` optional (or removed it) — silently reopening the exact
 * gap FIX 2 closed — this call would start compiling cleanly, tsc would
 * instead report "Unused '@ts-expect-error' directive", and
 * `npm run typecheck` would fail. That failure mode is the actual
 * enforcement; nobody has to remember to look at this file.
 */
function missingInputRejected(result: EvidencedDecision | InputRejected): string {
  // @ts-expect-error — `inputRejected` is a required handler; omitting it must fail to compile.
  return matchDecision(result, {
    execute: () => "execute",
    ask: () => "ask",
    defer: () => "defer",
    escalate: () => "escalate",
    refuse: () => "refuse",
  });
}

/** Same proof, for a second case, so this isn't reading as a fluke of `inputRejected` specifically: every one of the six handlers is equally required. */
function missingRefuse(result: EvidencedDecision | InputRejected): string {
  // @ts-expect-error — `refuse` is a required handler; omitting it must fail to compile.
  return matchDecision(result, {
    inputRejected: () => "input-rejected",
    execute: () => "execute",
    ask: () => "ask",
    defer: () => "defer",
    escalate: () => "escalate",
  });
}

describe("matchDecision — handlers object is exhaustive at compile time", () => {
  it("both @ts-expect-error functions above exist only to be typechecked by `npm run typecheck`; this runtime test just confirms they're wired up as real functions", () => {
    expect(typeof missingInputRejected).toBe("function");
    expect(typeof missingRefuse).toBe("function");
  });
});
