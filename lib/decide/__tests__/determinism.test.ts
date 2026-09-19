import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { decide } from "../decide.js";
import { sampleAction, fixtureInput, fixtureRequirement, fixtureSignal, NOW } from "./fixtures.js";
// (sampleAction is used below for the "different container, same evidence" proof.)

/**
 * INVARIANT `no-unreplayable-decision`: decide() must be a pure function
 * of its inputs plus an explicit clock. Same inputs, same outcome, always
 * — no hidden `Date.now()`, no randomness, no ambient state.
 *
 * Two proofs, deliberately not just one:
 *   1. A structural grep of lib/decide/**\/*.ts (excluding tests) for any
 *      wall-clock or RNG touchpoint — the same technique
 *      lib/contracts/__tests__/brand-casts.test.ts uses for its own
 *      invariant, adapted here.
 *   2. A behavioral test: the same DecideInput, run through decide()
 *      twice, deep-equals itself. This is what M5 will actually depend on
 *      (replaying recorded inputs and expecting the same outcome).
 *
 * The grep alone could pass vacuously if decide() simply never needed the
 * wall clock for its current logic; the behavioral test alone could pass
 * by coincidence if a hidden clock read happened to return the same value
 * twice in a fast test run. Together they're a real proof: nothing in the
 * source touches an ambient clock/RNG AND running it twice, live, proves
 * indistinguishable output.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const DECIDE_ROOT = join(REPO_ROOT, "lib", "decide");

const FORBIDDEN = [
  /\bDate\.now\s*\(/,
  /\bnew\s+Date\s*\(\s*\)/, // `new Date()` with no argument reads the wall clock.
  /\bMath\.random\s*\(/,
  /\bsystemNow\s*\(/, // lib/signals's own "the one real-clock touchpoint" — decide() must never call it.
];

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

describe("no-unreplayable-decision — structural proof: no ambient clock or RNG in lib/decide/", () => {
  it("no source file under lib/decide/ (excluding tests) reads the wall clock or randomness directly", () => {
    const offenders: string[] = [];
    for (const file of listSourceFiles(DECIDE_ROOT)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        for (const pattern of FORBIDDEN) {
          if (pattern.test(line)) {
            offenders.push(`${relative(REPO_ROOT, file)}:${index + 1}: ${line.trim()}`);
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("sanity: the scan actually walked real files", () => {
    const files = listSourceFiles(DECIDE_ROOT);
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(files.some((f) => f.endsWith("decide.ts"))).toBe(true);
  });
});

describe("no-unreplayable-decision — behavioral proof: identical inputs, run twice, deep-equal outcomes", () => {
  it("execute path is deterministic", () => {
    const input = fixtureInput({
      requirements: [fixtureRequirement({ minConfidence: 0.1 })],
      signals: [fixtureSignal({ confidence: 0.95 })],
    });
    expect(decide(input)).toEqual(decide(input));

    // Also across a DIFFERENT DecideInput *container* — proves the
    // function doesn't depend on the identity of the argument object
    // itself, only its contents. The nested Requirement/Signal values are
    // deliberately the SAME references in both containers (rather than
    // freshly re-built, structurally-equal ones): Signal carries a `read`
    // closure (lib/signals/signal.ts), and two independently-constructed
    // signals with identical parameters still produce two DIFFERENT
    // function references for `.read` — which `toEqual` correctly reports
    // as unequal, but that would be testing object-identity-of-closures,
    // not decide()'s own purity. Reusing the same requirement/signal
    // values isolates the thing this test actually claims: a fresh
    // top-level `DecideInput` object wrapping the same evidence yields
    // the same decision.
    const requirement = fixtureRequirement({ minConfidence: 0.1 });
    const signal = fixtureSignal({ confidence: 0.95 });
    const a = { action: sampleAction(), requirements: [requirement], signals: [signal], prohibitions: [], now: fixtureInput().now };
    const b = { action: a.action, requirements: [requirement], signals: [signal], prohibitions: [], now: a.now };
    expect(a).not.toBe(b);
    expect(decide(a)).toEqual(decide(b));
  });

  it("ask/defer/escalate/refuse paths are all deterministic too", () => {
    const askInput = fixtureInput({
      requirements: [fixtureRequirement({ supplier: { kind: "counterparty", party: "customer" } })],
      signals: [],
    });
    const deferInput = fixtureInput({
      requirements: [fixtureRequirement({ supplier: { kind: "time", waitingOn: "x" } })],
      signals: [],
    });
    const escalateInput = fixtureInput({
      requirements: [fixtureRequirement({ supplier: { kind: "human", reason: "x" } })],
      signals: [],
    });
    const refuseInput = fixtureInput({
      prohibitions: [{ id: "p", reason: "no", matches: () => true }],
    });

    for (const input of [askInput, deferInput, escalateInput, refuseInput]) {
      expect(decide(input)).toEqual(decide(input));
    }
  });

  it("varying only `now` (a genuinely different explicit clock) is allowed to change the outcome — purity is about ambient state, not about `now` itself being an input", () => {
    const action = sampleAction({ reversibility: "reversible-with-cost", cost: 500 });
    const requirement = fixtureRequirement({
      maxAgeMs: 60 * 60 * 1000,
      supplier: { kind: "counterparty", party: "customer" },
    });
    const signal = fixtureSignal({ confidence: 0.9, capturedAtIso: "2026-09-19T11:30:00.000Z" });

    const freshNow = NOW; // signal is 30 minutes old, within the 1h maxAge
    const staleNow = "2026-09-19T14:00:00.000Z" as never; // signal would be 2.5h old — beyond maxAge

    const withFreshNow = decide(
      fixtureInput({ action, requirements: [requirement], signals: [signal], now: freshNow }),
    );
    const withStaleNow = decide(
      fixtureInput({ action, requirements: [requirement], signals: [signal], now: staleNow }),
    );

    // Same `now`, run twice, must still agree with itself.
    expect(decide(fixtureInput({ action, requirements: [requirement], signals: [signal], now: freshNow }))).toEqual(
      withFreshNow,
    );
    // Different `now` may legitimately produce a different outcome — that
    // is `now` doing its job as an explicit input, not a purity violation.
    expect(withFreshNow.outcome).not.toBe(withStaleNow.outcome);
  });
});
