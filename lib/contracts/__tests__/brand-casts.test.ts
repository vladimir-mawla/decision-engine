import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * lib/cost-model/cost.ts documents CostOfBeingWrong (and
 * lib/contracts/confidence.ts documents Confidence) as branded types that
 * stop a plain number from being *assigned* where a branded value is
 * expected — but a brand built as `number & { [brand]: ... }` cannot stop
 * a deliberate cast. `(x as number) as CostOfBeingWrong` compiles with
 * zero errors or warnings, because a cast is an explicit assertion, not an
 * assignment, and that is exactly the shortcut a time-pressured domain
 * implementation (M6) would reach for instead of calling
 * parseCostOfBeingWrong/parseConfidence.
 *
 * No ESLint is installed in this project, and adding it for a single rule
 * would be disproportionate to the problem. So instead this test scans the
 * actual source text under lib/ and fails the build if the cast appears
 * anywhere outside the one file that legitimately performs it once, inside
 * its own parseX constructor.
 *
 * Excluded, by explicit path (never a directory glob — a glob could
 * accidentally swallow a real offender in the same directory):
 *   - lib/cost-model/cost.ts       (defines CostOfBeingWrong, casts once)
 *   - lib/contracts/confidence.ts  (defines Confidence, casts once)
 * and every `*.test.ts` file, since fixtures are allowed to construct
 * branded test values directly (see decision-shape.test.ts) without going
 * through a real parser — a test file casting a literal into a branded
 * fixture is not the "domain implementation reached for a shortcut"
 * failure mode this test exists to catch.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const LIB_ROOT = join(REPO_ROOT, "lib");

const DEFINING_FILES = new Set([
  join(REPO_ROOT, "lib", "cost-model", "cost.ts"),
  join(REPO_ROOT, "lib", "contracts", "confidence.ts"),
]);

// Matches `as CostOfBeingWrong` / `as Confidence` as a type assertion,
// wherever it appears on a line (start of a cast chain or the end of one),
// but not merely a substring of a longer identifier: `\b` on both sides.
const CAST_PATTERN = /\bas\s+(CostOfBeingWrong|Confidence)\b/;

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

function scanForBrandCasts(): string[] {
  const sourceFiles = listSourceFiles(LIB_ROOT).filter((f) => !DEFINING_FILES.has(f));
  const offenders: string[] = [];

  for (const file of sourceFiles) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (CAST_PATTERN.test(line)) {
        offenders.push(`${relative(REPO_ROOT, file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  return offenders;
}

describe("branded casts stay inside the file that defines the brand", () => {
  it("no `as CostOfBeingWrong` or `as Confidence` cast appears in lib/ outside cost.ts / confidence.ts", () => {
    const offenders = scanForBrandCasts();
    if (offenders.length > 0) {
      throw new Error(
        "Found a branded type cast outside its defining file. A cast defeats the brand " +
          "(TypeScript cannot refuse an explicit `as`), so construct the value through the " +
          "real parser instead — parseCostOfBeingWrong(...) or parseConfidence(...):\n" +
          offenders.join("\n"),
      );
    }
    expect(offenders).toEqual([]);
  });

  it("sanity: the scan actually walks real source files, so a passing result isn't vacuous", () => {
    const sourceFiles = listSourceFiles(LIB_ROOT).filter((f) => !DEFINING_FILES.has(f));
    // At minimum, every non-test .ts file under lib/contracts and
    // lib/cost-model other than the two defining files should show up.
    expect(sourceFiles.length).toBeGreaterThanOrEqual(6);
    expect(sourceFiles.some((f) => f.endsWith("validation.ts"))).toBe(true);
  });

  it("the defining files themselves are excluded by exact path, not swept up by a directory glob", () => {
    expect(DEFINING_FILES.has(join(REPO_ROOT, "lib", "cost-model", "cost.ts"))).toBe(true);
    expect(DEFINING_FILES.has(join(REPO_ROOT, "lib", "contracts", "confidence.ts"))).toBe(true);
    // A sibling file in the same directory as a defining file is NOT
    // excluded just because it lives alongside it.
    const sibling = join(REPO_ROOT, "lib", "cost-model", "reversibility.ts");
    expect(DEFINING_FILES.has(sibling)).toBe(false);
  });
});
