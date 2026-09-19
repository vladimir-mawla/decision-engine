import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * INVARIANT `confidence-bar-is-a-function-not-a-constant`:
 * `requiredConfidence(reversibility, cost)` (lib/cost-model) is the ONLY
 * source of a confidence bar. No file under lib/decide/ may compare a
 * confidence or a bar against a bare fractional numeric literal (e.g.
 * `confidence > 0.8`) — every bar used in this package must trace back to
 * a `requiredConfidence(...)` call (see decide.ts's `computeConfidenceBar`
 * and stakes.ts's `isBarSaturated`, both of which derive every number they
 * compare from that one function, never from a literal).
 *
 * The pattern below targets a DECIMAL numeric literal (containing a `.`)
 * adjacent to a comparison operator, deliberately excluding bare-integer
 * comparisons like `gaps.length > 0` or `requirements.length === 0` —
 * those are cardinality checks ("is this list empty"), not confidence
 * thresholds, and conflating the two would make this test too broad to be
 * useful (see the invariant's own example: `confidence > 0.8`, a
 * fractional comparison). A fractional literal is specifically what a
 * hand-rolled confidence threshold looks like, because every Confidence
 * and every requiredConfidence output lives in [0, 1].
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const DECIDE_ROOT = join(REPO_ROOT, "lib", "decide");

const BARE_FRACTIONAL_THRESHOLD = /[<>]=?\s*[0-9]*\.[0-9]+|[0-9]+\.[0-9]+\s*[<>]=?/;

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

describe("confidence-bar-is-a-function-not-a-constant — no bare fractional threshold in lib/decide/", () => {
  it("no non-test source file under lib/decide/ compares against a bare decimal literal", () => {
    const offenders: string[] = [];
    for (const file of listSourceFiles(DECIDE_ROOT)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (BARE_FRACTIONAL_THRESHOLD.test(line)) {
          offenders.push(`${relative(REPO_ROOT, file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    if (offenders.length > 0) {
      throw new Error(
        "Found a bare fractional numeric comparison in lib/decide/ — every confidence bar must come " +
          "from requiredConfidence(reversibility, cost), never a literal compared inline:\n" +
          offenders.join("\n"),
      );
    }
    expect(offenders).toEqual([]);
  });

  it("sanity: the pattern actually detects the exact shape the invariant names as a violation", () => {
    expect(BARE_FRACTIONAL_THRESHOLD.test('if (confidence > 0.8) return "execute";')).toBe(true);
    expect(BARE_FRACTIONAL_THRESHOLD.test("if (aggregate.confidence >= 0.5) { }")).toBe(true);
  });

  it("sanity: ordinary cardinality checks (list length, zero) are NOT flagged — this test targets thresholds, not any number", () => {
    expect(BARE_FRACTIONAL_THRESHOLD.test("if (gaps.length > 0) { }")).toBe(false);
    expect(BARE_FRACTIONAL_THRESHOLD.test("if (requirements.length === 0) { }")).toBe(false);
  });

  it("sanity: the scan actually walked real files", () => {
    const files = listSourceFiles(DECIDE_ROOT);
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(files.some((f) => f.endsWith("decide.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("stakes.ts"))).toBe(true);
  });
});
