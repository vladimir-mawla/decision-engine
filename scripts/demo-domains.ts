import { ALL_DOMAINS } from "../lib/domains/index.js";
import { decide } from "../lib/decide/decide.js";
import { deriveRule } from "../lib/audit/rule.js";
import { recordDecision } from "../lib/audit/record.js";
import { replay } from "../lib/audit/replay.js";
import { matchesExpectedOutcome, describeExpectedOutcome, describeRule } from "../lib/domains/shared/expectations.js";
import type { DomainCase } from "../lib/domains/types.js";

/**
 * `npm run demo:domains` — runs every case in every M6 domain through the
 * real, frozen engine (`decide()`, `deriveRule()`, `recordDecision()`,
 * `replay()`), prints the action, the decision, and the SPECIFIC reason
 * (the rule that fired and the field that decided it) for each, and exits
 * non-zero if any case produces an outcome other than the one it declares
 * — a demo that narrates a wrong answer is worse than none.
 *
 * This script contains no decision logic of its own: every outcome shown
 * below is `decide()`'s own answer, and every pass/fail check is
 * `matchesExpectedOutcome` (lib/domains/shared/expectations.ts) comparing
 * against `RuleTrace.kind` — never a string match against the `reason` text inside `missing`.
 *
 * REPLAY LIMITATION, SHOWN NOT JUST DOCUMENTED (FIX 4, M6 independent
 * verification follow-up): every case below always passed `knownSignals`
 * to `replay()`, so every one printed "audit replay: matches exactly" —
 * true, but it hid a real, honestly-documented limitation of
 * `lib/audit/replay.ts`'s two-argument form (see its own header comment
 * and `.genesis/decisions/0004-value-constraints.md`'s amendment): a
 * metadata-only replay of a SATISFIED value constraint can manufacture a
 * `constraint-violated` Gap purely from `UNDISCLOSED_VALUE` failing every
 * operator by construction, which can flip the replayed outcome even
 * though `decide()` never disagreed with itself. `refund-r1-clean-
 * approval` is exactly this shape — an `execute` that depends on three
 * satisfied value constraints — and is the same case
 * `lib/domains/__tests__/replay-limitation.test.ts` uses to prove it. For
 * that one case, `printCase` below prints BOTH replays — WITH
 * `knownSignals` (full fidelity) and WITHOUT it (metadata only) — labeled
 * plainly, so a demo viewer sees the limitation exist rather than only
 * ever seeing the passing path. The WITHOUT-knownSignals mismatch there
 * is EXPECTED and must not affect the pass/fail check or the exit code —
 * only the WITH-knownSignals replay (the same one every other case uses)
 * counts toward `replayOk`.
 */

const DIVIDER = "─".repeat(78);

/** Cases demonstrated with both replay forms, by id — see the header comment above. */
const DEMONSTRATE_REPLAY_LIMITATION = new Set(["refund-r1-clean-approval"]);

function printCase(testCase: DomainCase): boolean {
  const input = {
    action: testCase.action,
    requirements: testCase.requirements,
    signals: testCase.signals,
    prohibitions: testCase.prohibitions,
    now: testCase.now,
  };

  const decision = decide(input);
  const rule = deriveRule(input);
  const ok = decision.outcome === testCase.expected.outcome && matchesExpectedOutcome(testCase.expected, rule);

  console.log(`  [${testCase.id}] ${testCase.title}`);
  console.log(`    action:         ${testCase.action.domain}/${testCase.action.type}`);
  console.log(
    `    reversibility:  ${testCase.action.reversibility}  (cost of being wrong: $${testCase.action.costOfBeingWrong.toLocaleString()})`,
  );
  console.log(`    reversibility argument: ${testCase.reversibilityRationale}`);
  console.log(`    decision:       ${decision.outcome}`);
  console.log(`    reason:         ${describeRule(rule)}`);
  console.log(`    expected:       ${describeExpectedOutcome(testCase.expected)}  ->  ${ok ? "PASS" : "FAIL"}`);

  // Audit round trip: record the decision, then replay it. `knownSignals`
  // is supplied (the original signals, held in-process — never persisted
  // alongside the record) so a case whose outcome depends on a SATISFIED
  // value constraint still replays with full fidelity; see
  // .genesis/decisions/0004-value-constraints.md's amendment and
  // lib/domains/__tests__/replay-limitation.test.ts for the two-argument
  // form's own documented, honest limitation without it.
  const record = recordDecision(input, `demo-${testCase.id}`, testCase.now);
  let replayOk = false;
  if (record.kind === "decision") {
    const result = replay(record, testCase.prohibitions, testCase.signals);
    replayOk = result.matches && result.ruleSetMatches;

    if (DEMONSTRATE_REPLAY_LIMITATION.has(testCase.id)) {
      const withoutKnownSignals = replay(record, testCase.prohibitions); // no knownSignals — metadata only
      console.log(`    audit replay (with known signals):    ${replayOk ? "matches exactly" : "MISMATCH"}`);
      console.log(
        `    audit replay (metadata only, no known signals): ${withoutKnownSignals.matches ? "matches exactly" : "MISMATCH (expected)"}`,
      );
      console.log(
        "      -> this is ADR-0004's documented limitation, not a bug: this case's execute depends on " +
          "three SATISFIED value constraints, and a metadata-only replay cannot re-verify a satisfied " +
          "constraint — fromSignalSnapshot's UNDISCLOSED_VALUE fails every operator by construction, so " +
          "the constraint reads as violated and can flip the outcome, even though decide() never " +
          "disagreed with itself. Only the 'with known signals' replay above counts toward this case's " +
          "PASS/FAIL and the run's exit code.",
      );
    } else {
      console.log(`    audit replay:   ${replayOk ? "matches exactly" : "MISMATCH"}`);
    }
  } else {
    console.log(`    audit replay:   ${replayOk ? "matches exactly" : "MISMATCH"}`);
  }
  console.log("");

  return ok && replayOk;
}

function main(): number {
  console.log(DIVIDER);
  console.log("M6 DOMAIN DEMO — three domains, one engine, no domain-specific outcome logic");
  console.log(DIVIDER);
  console.log("");

  let total = 0;
  let failures = 0;
  const outcomeCounts: Record<string, number> = {};

  for (const domain of ALL_DOMAINS) {
    console.log(`DOMAIN: ${domain.name}`);
    console.log(`  ${domain.description}`);
    console.log("");

    for (const testCase of domain.cases) {
      total += 1;
      const passed = printCase(testCase);
      if (!passed) failures += 1;
      outcomeCounts[testCase.expected.outcome] = (outcomeCounts[testCase.expected.outcome] ?? 0) + 1;
    }
  }

  console.log(DIVIDER);
  console.log(`SUMMARY: ${total} cases across ${ALL_DOMAINS.length} domains, ${total - failures} passed, ${failures} failed`);
  console.log(
    "  outcome distribution: " +
      Object.entries(outcomeCounts)
        .map(([k, v]) => `${k}=${v}`)
        .join(", "),
  );
  console.log(DIVIDER);

  if (failures > 0) {
    console.error(`\n${failures} case(s) produced an unexpected outcome or failed to replay exactly. Failing.`);
    return 1;
  }

  console.log("\nAll cases produced their expected outcome, with an exact audit replay. OK.");
  return 0;
}

process.exitCode = main();
