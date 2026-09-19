import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { decide } from "../decide.js";
import { fixtureInput, fixtureRequirement, fixtureSignal } from "./fixtures.js";

/**
 * INVARIANT `no-outcome-without-signals`. Two proofs:
 *
 *   1. Structural: the ONLY place in lib/decide/ that writes an
 *      `outcome: "..."` object literal is evidence.ts's five builder
 *      functions, each of which requires an `evidence` parameter with no
 *      default — so a Decision literally cannot be constructed anywhere
 *      else in this package without supplying evidence. Checked here by
 *      grepping every non-test source file for the literal pattern.
 *   2. Behavioral: decide() called with signals=[] still returns a
 *      Decision whose `evidence` field is that same empty array — never
 *      omitted, never silently swapped for something else.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const DECIDE_ROOT = join(REPO_ROOT, "lib", "decide");
const EVIDENCE_FILE = join(DECIDE_ROOT, "evidence.ts");

const OUTCOME_LITERAL = /outcome:\s*["'](execute|ask|defer|escalate|refuse)["']/;

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

describe("no-outcome-without-signals — structural: only evidence.ts constructs a Decision literal", () => {
  it("no non-test source file under lib/decide/ other than evidence.ts writes an `outcome: \"...\"` literal", () => {
    const offenders: string[] = [];
    for (const file of listSourceFiles(DECIDE_ROOT)) {
      if (file === EVIDENCE_FILE) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (OUTCOME_LITERAL.test(line)) {
          offenders.push(`${relative(REPO_ROOT, file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("sanity: evidence.ts itself DOES construct all five outcome literals — the scan isn't vacuous", () => {
    const text = readFileSync(EVIDENCE_FILE, "utf8");
    for (const outcome of ["execute", "ask", "defer", "escalate", "refuse"]) {
      expect(text).toMatch(new RegExp(`outcome:\\s*"${outcome}"`));
    }
  });

  it("sanity: decide.ts is one of the files actually scanned", () => {
    const files = listSourceFiles(DECIDE_ROOT);
    expect(files.some((f) => f.endsWith("decide.ts"))).toBe(true);
  });
});

describe("no-outcome-without-signals — behavioral: evidence traces to the actual signals argument", () => {
  it("decide() called with signals=[] still returns evidence=[] — not omitted, not synthesized", () => {
    const requirement = fixtureRequirement({ minConfidence: 0.99 });
    const decision = decide(fixtureInput({ requirements: [requirement], signals: [] }));

    expect(decision.evidence).toBeDefined();
    expect(decision.evidence).toEqual([]);
  });

  it("a non-empty signals array is carried through verbatim on an execute decision", () => {
    const requirement = fixtureRequirement({ minConfidence: 0.1 });
    const signal = fixtureSignal({ confidence: 0.99 });

    const decision = decide(fixtureInput({ requirements: [requirement], signals: [signal] }));

    expect(decision.outcome).toBe("execute");
    expect(decision.evidence).toEqual([signal]);
  });

  it("evidence is carried through on every outcome kind, not only execute", () => {
    const signal = fixtureSignal({ confidence: 0.99 });

    const ask = decide(
      fixtureInput({
        requirements: [fixtureRequirement({ supplier: { kind: "counterparty", party: "c" } })],
        signals: [signal],
      }),
    );
    const defer = decide(
      fixtureInput({
        requirements: [fixtureRequirement({ supplier: { kind: "time", waitingOn: "t" } })],
        signals: [signal],
      }),
    );
    const escalate = decide(
      fixtureInput({
        requirements: [fixtureRequirement({ supplier: { kind: "human", reason: "h" } })],
        signals: [signal],
      }),
    );

    expect(ask.evidence).toEqual([signal]);
    expect(defer.evidence).toEqual([signal]);
    expect(escalate.evidence).toEqual([signal]);
  });

  it("a refuse from a matched prohibition carries evidence=[] even when non-empty signals were supplied — proving they were never read", () => {
    const decision = decide(
      fixtureInput({
        prohibitions: [{ id: "p", reason: "categorically forbidden", matches: () => true }],
        signals: [fixtureSignal(), fixtureSignal({ id: "sig-2" })],
      }),
    );
    expect(decision.outcome).toBe("refuse");
    expect(decision.evidence).toEqual([]);
  });
});
