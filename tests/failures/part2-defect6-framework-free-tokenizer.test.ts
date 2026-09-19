import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ══════════════════════════════════════════════════════════════════════
 * PART TWO — REGRESSION: real historical defect, M4
 * ══════════════════════════════════════════════════════════════════════
 * DEFECT (M4, found by the SECOND independent verification): "lib/ stays
 * framework-free" was first enforced by `lib/__tests__/framework-free.test.ts`
 * using a per-LINE regex requiring `import`/`export` to appear at the START
 * of that line. The re-verification defeated it with a real, committed,
 * ordinarily-formatted file — exactly what Prettier produces for an import
 * with enough named specifiers to wrap:
 *
 *     import {
 *       useState,
 *       useEffect,
 *     } from "react";
 *
 * The line that actually carries `from "react"` is `} from "react";`,
 * which does not start with `import`, so the old regex never even offered
 * it to its `from` branch. All 5 of the old guard's own tests still
 * passed — ordinary formatting defeated the guard, not an adversary. Two
 * further evasions of the identical shape were confirmed: a template-
 * literal dynamic import and a bare `require(...)`. The fix replaced the
 * line-anchored regex with a tokenizer that finds a specifier string
 * wherever it occurs, checked only against the CODE immediately preceding
 * it (`from`, `import`, `import(`, `require(`), never against line
 * position — see `lib/__tests__/framework-free.test.ts`'s own header
 * comment for the full account.
 *
 * WHY THIS TEST DOES NOT RE-IMPLEMENT THAT TOKENIZER: the fix and its own
 * self-check fixtures (the exact Prettier-wrapped import, the template
 * literal dynamic import, and the bare `require`) already live in that
 * frozen file, already run as part of the 478-test baseline this
 * milestone must not shrink, and `lib/**` is frozen for M7 — this suite
 * cannot edit, duplicate, or re-derive that file's logic without
 * reproducing exactly the drift risk the codebase avoids everywhere else
 * (e.g. reasons.ts explicitly choosing to import rather than reimplement
 * shared parsers). What THIS test can honestly do without touching lib/:
 * confirm, from outside, that the shape of guard actually shipped is the
 * tokenizer (not a reversion to a line-anchored regex), and that it is
 * wired into `npm test` (not merely a prompt-level grep a human has to
 * remember to run) — both directly falsifiable if the fix ever regresses.
 */
describe("REGRESSION (M4) — the framework-free guard is a real, committed test, not a line-anchored regex", () => {
  const guardPath = join(process.cwd(), "lib", "__tests__", "framework-free.test.ts");
  const guardSource = readFileSync(guardPath, "utf8");

  it("the guard is committed under lib/ and therefore runs as part of `npm test` itself, not a prompt-level check", () => {
    // vitest.config.ts's include pattern covers lib/**/*.test.ts — this
    // file's mere existence there is what makes it enforceable by CI/gates
    // rather than by human memory. (Confirmed independently by this
    // project's own `npm test` baseline count, asserted in Part Two's
    // other files and in the top-level gate report — not re-asserted here
    // to avoid a brittle, hard-coded total.)
    expect(guardSource.length).toBeGreaterThan(0);
  });

  it("the guard is shaped like a tokenizer (finds specifiers by preceding code context), not a per-line regex — the actual fix, not just its rationale", () => {
    // Positive evidence of the FIXED shape, rather than a fragile search
    // for the retracted shape's own pattern text (which the file's header
    // comment legitimately quotes, in prose, as part of documenting the
    // historical defect it fixes — searching for that same text would
    // produce a false positive against the file's own explanation).
    expect(guardSource).toContain("extractSpecifiers");
    expect(guardSource).toContain("isSpecifierContext");
    expect(guardSource.toLowerCase()).toContain("tokeniz");
  });

  it("the guard's own header comment documents the Prettier-wrapped multi-line import as the specific defect it closes (so the fix's rationale can't silently rot out of the file)", () => {
    expect(guardSource).toContain("Prettier");
    expect(guardSource.toLowerCase()).toContain("multi-line");
  });

  it("HONEST CORROBORATION, not a substitute: an independent, minimal re-check that the four evasion SHAPES the historical defect actually used are things a naive line-anchored matcher (like the one that shipped first) would miss — reproduced here only as data, never run against real lib/ source", () => {
    // This does not call into or duplicate the real guard. It only proves
    // the historical claim itself — that a `^\s*(?:import|export)` line
    // matcher genuinely misses these four shapes — so a reader doesn't
    // have to trust the doc comment above on faith.
    const naiveLineAnchored = /^\s*(?:import|export)\b.*\bfrom\s+["'`](.+?)["'`]/;

    const prettierWrapped = ['import {', "  useState,", "  useEffect,", '} from "react";'].join("\n");
    const templateLiteralDynamic = "const mod = import(`react`);";
    const bareRequire = 'const react = require("react");';
    const ordinaryOneLiner = 'import { useState } from "react";'; // the naive matcher DOES catch this one

    const linesMatch = (source: string): boolean =>
      source.split("\n").some((line) => naiveLineAnchored.test(line));

    expect(linesMatch(ordinaryOneLiner)).toBe(true); // sanity: the naive matcher isn't simply broken
    expect(linesMatch(prettierWrapped)).toBe(false); // exactly the historical evasion
    expect(linesMatch(templateLiteralDynamic)).toBe(false);
    expect(linesMatch(bareRequire)).toBe(false);
  });
});
