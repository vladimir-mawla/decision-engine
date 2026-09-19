import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * FIX 5 (M4 independent verification). "lib/ stays framework-free" has
 * been a real rule since M1 — `lib/` is the decision engine's own logic
 * and must not depend on Next.js or React, which `app/` (M2) layers on
 * top — but until now the rule was enforced only by a `grep` a human or
 * an agent had to remember to run from a build/verify prompt, never by
 * anything committed to this repository or wired into CI. This test is
 * that missing artefact: `npm test` (which already runs in CI) now fails
 * on its own if `lib/` ever grows a framework import, with no separate
 * command to remember.
 *
 * THE COLLISION THIS MATCHER AVOIDS (confirmed real during the M4
 * verification): the prior prompt-level check was
 * `grep -rniE '^\s*import .*(next|react)' lib/` — matching "next" or
 * "react" anywhere on an import LINE, case-insensitively. That matches
 * `import { fixtureAction } from "./fixtures.js"`, because
 * "fixtu**reAct**ion" contains "react" as a substring, even though this
 * line imports nothing from React and nothing from any package at all
 * named anything like it — it imports a local fixture helper.
 *
 * THE FIX: match on the actual import SPECIFIER (the quoted module path a
 * `from` clause — or a bare `import "…"` / dynamic `import(…)` — resolves
 * against), never the whole line and never an identifier being imported.
 * `fixtureAction` is an identifier, not a specifier, so it is never even
 * examined; `"./fixtures.js"` is the specifier actually checked, and it
 * plainly isn't `"react"` or `"next"` or a subpath of either.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const LIB_ROOT = join(REPO_ROOT, "lib");

/** Package names lib/ may never import from, directly or via a subpath (e.g. "react/jsx-runtime", "next/navigation"). */
const FORBIDDEN_PACKAGES: readonly string[] = ["react", "react-dom", "next"];

/**
 * Captures the specifier out of every import/export/dynamic-import form
 * this project's TypeScript actually uses:
 *   import X from "spec"; import { a, b } from "spec"; import type { A } from "spec";
 *   import * as ns from "spec"; import "spec"; export { a } from "spec"; export * from "spec";
 *   import("spec")
 * Deliberately does NOT match a bare identifier or anything outside a
 * quoted string following `from`/`import` — that is the whole point: an
 * identifier like `fixtureAction` is never a candidate, only the string
 * literal naming the module.
 */
const IMPORT_SPECIFIER = /(?:^\s*(?:import|export)\b[^;\n]*?\bfrom\s*|^\s*import\s*|\bimport\s*\()\s*["']([^"']+)["']/;

function isForbiddenSpecifier(specifier: string): boolean {
  return FORBIDDEN_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`));
}

interface Offender {
  readonly file: string;
  readonly line: number;
  readonly specifier: string;
  readonly text: string;
}

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

function scanForFrameworkImports(): Offender[] {
  const offenders: Offender[] = [];
  for (const file of listSourceFiles(LIB_ROOT)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      const match = IMPORT_SPECIFIER.exec(line);
      if (match && isForbiddenSpecifier(match[1] ?? "")) {
        offenders.push({
          file: relative(REPO_ROOT, file),
          line: index + 1,
          specifier: match[1] ?? "",
          text: line.trim(),
        });
      }
    });
  }
  return offenders;
}

describe("lib/ stays framework-free — no import from react, react-dom, or next", () => {
  it("no file under lib/ imports from a forbidden package specifier", () => {
    const offenders = scanForFrameworkImports();
    if (offenders.length > 0) {
      const report = offenders
        .map((o) => `${o.file}:${o.line}: imports "${o.specifier}" — ${o.text}`)
        .join("\n");
      throw new Error(
        `lib/ must stay framework-free (no Next.js, no React) — found ${offenders.length} offending ` +
          `import(s):\n${report}`,
      );
    }
    expect(offenders).toEqual([]);
  });

  it("sanity: the matcher actually flags a real framework import, not just a vacuous pass", () => {
    expect(isForbiddenSpecifier("react")).toBe(true);
    expect(isForbiddenSpecifier("react-dom")).toBe(true);
    expect(isForbiddenSpecifier("react-dom/client")).toBe(true);
    expect(isForbiddenSpecifier("react/jsx-runtime")).toBe(true);
    expect(isForbiddenSpecifier("next")).toBe(true);
    expect(isForbiddenSpecifier("next/navigation")).toBe(true);

    const line = 'import { useState } from "react";';
    const match = IMPORT_SPECIFIER.exec(line);
    expect(match?.[1]).toBe("react");
    expect(isForbiddenSpecifier(match?.[1] ?? "")).toBe(true);
  });

  /**
   * THE ACTUAL COLLISION, reproduced directly: the prior grep-based check
   * (`^\s*import .*(next|react)`, case-insensitive) matches this exact
   * line, because "fixtu**reAct**ion" contains "react". This project's
   * matcher must not.
   */
  it("does NOT false-positive on an identifier that merely contains \"react\" as a substring (the fixtureAction collision)", () => {
    const line = 'import { fixtureAction } from "./fixtures.js";';

    // The old prompt-level check, reproduced, to show it WOULD have
    // flagged this line (documenting exactly what this test replaces).
    const OLD_GREP_PATTERN = /^\s*import .*(next|react)/i;
    expect(OLD_GREP_PATTERN.test(line)).toBe(true);

    // This project's matcher: the specifier is "./fixtures.js", a local
    // relative path, never a forbidden package — no false positive.
    const match = IMPORT_SPECIFIER.exec(line);
    expect(match?.[1]).toBe("./fixtures.js");
    expect(isForbiddenSpecifier(match?.[1] ?? "")).toBe(false);
  });

  it("does not false-positive on ordinary relative/local imports used throughout lib/", () => {
    const specifiers = [
      "./decide.js",
      "../contracts/action.js",
      "../../signals/requirement.js",
      "node:fs",
      "node:path",
    ];
    for (const specifier of specifiers) {
      expect(isForbiddenSpecifier(specifier)).toBe(false);
    }
  });

  it("sanity: the scan actually walked real files under lib/", () => {
    const files = listSourceFiles(LIB_ROOT);
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.endsWith("decide.ts"))).toBe(true);
  });
});
