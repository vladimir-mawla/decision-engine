import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * FIX 5 (M4 first independent verification) added this file so
 * "lib/ stays framework-free" — real since M1, `lib/` is the decision
 * engine's own logic and must not depend on Next.js or React, which
 * `app/` (M2) layers on top — would be enforced by `npm test` itself,
 * not by a prompt-level grep a human had to remember to run.
 *
 * FIX 1 (M4 SECOND independent verification, this round). The
 * re-verification defeated that first guard with a real, committed
 * file:
 *
 *     import {
 *       useState,
 *       useEffect,
 *     } from "react";
 *
 * All 5 of the old tests passed. The old matcher examined each LINE
 * independently and required the import/export keyword to appear at the
 * START of that line (`^\s*(?:import|export)\b`). The line that actually
 * carries `from "react"` is `} from "react";` — it does not start with
 * `import`, so it was never even offered to the regex's `from` branch.
 * This is not a contrived attack shape: it is exactly what Prettier
 * produces for any import with enough named specifiers to wrap, so
 * ordinary formatting — not an adversary — defeated the guard added to
 * close this exact gap. Two further evasions were confirmed in the same
 * review: a template-literal dynamic import (`` import(`react`) ``) and
 * a bare `require("react")`, neither of which the old matcher's three
 * line-anchored alternatives could ever reach either — the same class of
 * gap, three more times over.
 *
 * THE FIX: stop recognizing STATEMENTS (which requires knowing where one
 * begins, i.e. line position) and instead find SPECIFIERS wherever they
 * occur — any `from "X"`, any `import("X")`/`` import(`X`) ``, any
 * `require("X")` — because a specifier is the thing that actually names a
 * module, and multi-line formatting is irrelevant to it: the `from "…"`
 * fragment (or `import(…)`/`require(…)` call) is always on one line by
 * itself even when the specifier list above it wraps across several.
 *
 * THE NEW HAZARD THIS INTRODUCES, AND HOW IT IS AVOIDED: matching a
 * specifier "wherever it occurs" is dangerous if "occurs" means "anywhere
 * in the file's raw text", because this very file's own sanity tests
 * below embed literal strings like `'import { useState } from "react";'`
 * as DATA to test the matcher with — not as real code. A naive
 * whole-file regex over raw text would find `from "react"` inside that
 * data string and flag this file for violating the very rule it tests.
 * The scanner below avoids that by tokenizing rather than pattern-
 * matching blindly: it walks the source one character at a time, tracks
 * comments and string/template literals as opaque spans (as a real
 * lexer would), and only asks "is this string a specifier?" by checking
 * what CODE — never string contents, never comment text — immediately
 * precedes it: `from`, `import`, `import(`, or `require(`. The nested
 * `"react"` inside the outer `'...'` string above is never independently
 * inspected: the whole outer string is consumed as one opaque token whose
 * preceding code is `const line = `, which is none of those four
 * contexts, so it is correctly ignored — the same way a real parser
 * would never see it as an import.
 *
 * This also satisfies "strip comments first": a comment's content is
 * skipped by the tokenizer exactly like a string's is, so a prose
 * comment that mentions React or Next by name (this repository has a
 * few, deliberately) is never even offered to the specifier check.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const LIB_ROOT = join(REPO_ROOT, "lib");

/** Package names lib/ may never import from, directly or via a subpath (e.g. "react/jsx-runtime", "next/navigation"). */
const FORBIDDEN_PACKAGES: readonly string[] = ["react", "react-dom", "next"];

function isForbiddenSpecifier(specifier: string): boolean {
  return FORBIDDEN_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`));
}

interface FoundSpecifier {
  readonly specifier: string;
  readonly line: number;
}

interface Offender {
  readonly file: string;
  readonly line: number;
  readonly specifier: string;
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

/**
 * The four contexts (checked against the CODE immediately preceding a
 * string/template literal, never its contents) that make that literal a
 * module specifier rather than an ordinary string value:
 *   - `from "X"`                        (import ... from / export ... from)
 *   - `import "X"`                      (bare side-effect import)
 *   - `import("X")` / `` import(`X`) `` (dynamic import)
 *   - `require("X")`                    (CommonJS require)
 * Each pattern is anchored with `$` to the END of the accumulated
 * code-only tail, so it only fires when that exact keyword shape is the
 * LAST thing before the string starts — not merely present somewhere
 * earlier in the file. That end-anchoring is also what makes
 * `export { from } from "pkg"` resolve correctly: the LAST "from" before
 * the string is the real clause, and the earlier one (a renamed binding
 * called `from`) cannot match because it isn't at the tail's end.
 */
const SPECIFIER_CONTEXT_PATTERNS: readonly RegExp[] = [
  /\bfrom\s*$/,
  /\bimport\s*$/,
  /\bimport\s*\(\s*$/,
  /\brequire\s*\(\s*$/,
];

function isSpecifierContext(codeTail: string): boolean {
  return SPECIFIER_CONTEXT_PATTERNS.some((pattern) => pattern.test(codeTail));
}

/**
 * Tokenizes `source` well enough to find every specifier string that
 * follows one of the four contexts above, while treating comments and
 * string/template-literal CONTENTS as opaque — never re-scanned for a
 * nested specifier, never allowed to feed the "what precedes this
 * string" context check. Only the trailing ~60 characters of code seen
 * so far are kept (`codeTail`): enough to match any of the four
 * contexts, cheap to keep bounded across a whole file.
 *
 * Known, deliberate simplification: a backtick nested inside a template
 * literal's `${…}` interpolation is not specially handled — the scanner
 * ends the outer template at the first backtick it sees, same as it
 * would for any string. This codebase's actual source has no such
 * nesting; handling it exactly would need a full expression parser,
 * which this test does not need.
 */
function extractSpecifiers(source: string): readonly FoundSpecifier[] {
  const found: FoundSpecifier[] = [];
  const n = source.length;
  let i = 0;
  let line = 1;
  let codeTail = "";

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    // Line comment: skip up to (not past) the newline. Contributes
    // nothing to codeTail, so whatever preceded the comment can never
    // combine with whatever follows it to form a false specifier
    // context, and any framework name mentioned in the comment's prose
    // is never examined at all.
    if (c === "/" && next === "/") {
      while (i < n && source[i] !== "\n") i++;
      codeTail = "";
      continue;
    }

    // Block comment: same idea, but must track newlines inside it for
    // accurate line numbers.
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") line++;
        i++;
      }
      i += 2;
      codeTail = "";
      continue;
    }

    // String or template literal: the only place a specifier can be
    // found. Decide whether this is a specifier position from codeTail
    // BEFORE consuming the string, then consume the whole string as one
    // opaque token — its contents are never re-scanned for anything.
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      const startLine = line;
      const specifierPosition = isSpecifierContext(codeTail);

      let content = "";
      i++; // step past opening quote
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") {
          content += source[i] + (source[i + 1] ?? "");
          if (source[i + 1] === "\n") line++;
          i += 2;
          continue;
        }
        if (source[i] === "\n") line++;
        content += source[i];
        i++;
      }
      i++; // step past closing quote (or EOF, harmlessly)

      // A template literal with real interpolation (`${...}`) is not a
      // static specifier — nothing here can resolve it, and resolving it
      // is out of this scanner's scope.
      if (specifierPosition && !content.includes("${")) {
        found.push({ specifier: content, line: startLine });
      }

      // The string is consumed; reset codeTail so nothing on the far
      // side of it can combine with code from before it (e.g. the tail
      // must not still "end with `from`" just because `from` appeared
      // long before some unrelated later string).
      codeTail = "";
      continue;
    }

    if (c === "\n") line++;
    codeTail = (codeTail + c).slice(-60);
    i++;
  }

  return found;
}

function scanForFrameworkImports(): Offender[] {
  const offenders: Offender[] = [];
  for (const file of listSourceFiles(LIB_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const { specifier, line } of extractSpecifiers(source)) {
      if (isForbiddenSpecifier(specifier)) {
        offenders.push({ file: relative(REPO_ROOT, file), line, specifier });
      }
    }
  }
  return offenders;
}

describe("lib/ stays framework-free — no import from react, react-dom, or next", () => {
  it("no file under lib/ imports a forbidden package specifier, in any form", () => {
    const offenders = scanForFrameworkImports();
    if (offenders.length > 0) {
      const report = offenders.map((o) => `${o.file}:${o.line}: imports "${o.specifier}"`).join("\n");
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

    expect(extractSpecifiers('import { useState } from "react";')).toEqual([
      { specifier: "react", line: 1 },
    ]);
  });

  describe("teeth: each of the four evasions confirmed during the second verification is caught", () => {
    it("a multi-line named import — the exact shape Prettier produces, and the one that defeated the original matcher", () => {
      const source = ["import {", "  useState,", "  useEffect,", '} from "react";'].join("\n");
      const found = extractSpecifiers(source);
      expect(found).toEqual([{ specifier: "react", line: 4 }]);
      expect(isForbiddenSpecifier(found[0]!.specifier)).toBe(true);
    });

    it("a template-literal dynamic import with no interpolation", () => {
      const source = "const mod = await import(`react`);";
      const found = extractSpecifiers(source);
      expect(found).toEqual([{ specifier: "react", line: 1 }]);
      expect(isForbiddenSpecifier(found[0]!.specifier)).toBe(true);
    });

    it("a string-literal dynamic import, including a forbidden subpath", () => {
      const source = 'const mod = await import("next/navigation");';
      const found = extractSpecifiers(source);
      expect(found).toEqual([{ specifier: "next/navigation", line: 1 }]);
      expect(isForbiddenSpecifier(found[0]!.specifier)).toBe(true);
    });

    it("a bare require()", () => {
      const source = 'const react = require("react");';
      const found = extractSpecifiers(source);
      expect(found).toEqual([{ specifier: "react", line: 1 }]);
      expect(isForbiddenSpecifier(found[0]!.specifier)).toBe(true);
    });

    it("an ordinary single-line import — the shape the original check already caught, kept as a control", () => {
      const source = 'import { useState } from "react";';
      const found = extractSpecifiers(source);
      expect(found).toEqual([{ specifier: "react", line: 1 }]);
      expect(isForbiddenSpecifier(found[0]!.specifier)).toBe(true);
    });
  });

  describe("false-positive discipline: specifiers only, never identifiers, comments, or unrelated strings", () => {
    it('does NOT false-positive on an identifier that merely contains "react" as a substring — the fixtureAction collision the original grep hit', () => {
      const line = 'import { fixtureAction } from "./fixtures.js";';

      // The original prompt-level check, reproduced, to document exactly
      // what this matcher replaces and why it had to change.
      const OLD_GREP_PATTERN = /^\s*import .*(next|react)/i;
      expect(OLD_GREP_PATTERN.test(line)).toBe(true);

      const found = extractSpecifiers(line);
      expect(found).toEqual([{ specifier: "./fixtures.js", line: 1 }]);
      expect(isForbiddenSpecifier(found[0]!.specifier)).toBe(false);
    });

    it('does NOT count "react-select" as "react"', () => {
      expect(isForbiddenSpecifier("react-select")).toBe(false);
      const found = extractSpecifiers('import Select from "react-select";');
      expect(found).toEqual([{ specifier: "react-select", line: 1 }]);
      expect(isForbiddenSpecifier(found[0]!.specifier)).toBe(false);
    });

    it("does not false-positive on ordinary relative/local imports or node: specifiers used throughout lib/", () => {
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

    it("does NOT false-positive on a comment that mentions React or Next by name — comments are stripped, not scanned", () => {
      const source = [
        "// This module deliberately avoids importing from react or next.",
        "/* lib/ must never depend on react-dom either. */",
        'import { helper } from "./helper.js";',
      ].join("\n");
      expect(extractSpecifiers(source)).toEqual([{ specifier: "./helper.js", line: 3 }]);
    });

    it('does NOT false-positive on this very file\'s own sanity-test strings that contain a fake "from react" import as plain data', () => {
      // This is the hazard a naive whole-file regex would fall into: the
      // text `from "react"` appears below, inside a string, purely as
      // test data. It must not be found as a specifier, because the code
      // immediately preceding the OUTER string is `const line = `, not
      // `from`/`import`/`require(`.
      const line = 'const line = \'import { useState } from "react";\';';
      expect(extractSpecifiers(line)).toEqual([]);
    });
  });

  it("sanity: the scan actually walked real files under lib/", () => {
    const files = listSourceFiles(LIB_ROOT);
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.endsWith("decide.ts"))).toBe(true);
  });
});
