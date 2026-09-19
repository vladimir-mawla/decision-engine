import { describe, expect, it } from "vitest";
import { decide } from "../../decide/index.js";
import { recordDecision } from "../record.js";
import { replay } from "../replay.js";
import { NOW, generateInput, mulberry32 } from "./fixtures.js";

const ID_PREFIX = "audit-property-";
const RECORDED_AT = NOW;

/**
 * THE CENTRAL PROPERTY OF THIS MILESTONE — `no-unreplayable-decision` —
 * proved for every recorded decision the suite produces, not a sample: for
 * each of many PRNG-generated `DecideInput`s (fixtures.ts's `generateInput`,
 * seeded so failures are reproducible), record the decision and replay it
 * with the SAME prohibition set, then assert the replayed outcome
 * deep-equals the recorded one — excluding `id`/`recordedAt` (the audit
 * record's own identity/clock fields, which `recordDecision` never derives
 * from the decision itself, so a replay is never expected to reproduce
 * them) — Decision itself carries no id/timestamp field to exclude.
 */
describe("no-unreplayable-decision — proved across many generated cases", () => {
  const SEED = 424242;
  const CASE_COUNT = 400;

  it(`every one of ${CASE_COUNT} generated decisions replays to the same outcome`, () => {
    const rng = mulberry32(SEED);
    const outcomesSeen = new Set<string>();
    let recordedCount = 0;
    let rejectedCount = 0;

    for (let i = 0; i < CASE_COUNT; i++) {
      const input = generateInput(rng, i);
      const decision = decide(input);
      const record = recordDecision(input, `${ID_PREFIX}${i}`, RECORDED_AT);

      if (decision.outcome === "input-rejected") {
        expect(record.kind).toBe("input-rejected");
        rejectedCount++;
        continue;
      }

      expect(record.kind).toBe("decision");
      if (record.kind !== "decision") continue;
      recordedCount++;
      outcomesSeen.add(decision.outcome);

      // Reconstruct an EQUIVALENT prohibition set — same ids, same order,
      // fresh objects (never the original references) — the way a real
      // caller would supply their own rule catalog at replay time.
      const suppliedProhibitions = input.prohibitions.map((p) => ({ id: p.id, reason: p.reason, matches: p.matches }));

      const result = replay(record, suppliedProhibitions);

      expect(result.ruleSetMatches).toBe(true);
      expect(result.matches).toBe(true);
      expect(result.replayed).toEqual(record.decision);
    }

    // Sanity: the generator actually produced real decisions to replay,
    // and covered more than one outcome — a passing loop over zero real
    // cases, or over only one outcome kind, would make this property test
    // vacuous.
    expect(recordedCount).toBeGreaterThan(300);
    expect(outcomesSeen.size).toBeGreaterThanOrEqual(3);
  });

  it("the generator actually produces every outcome kind at least once across the seeded run (not vacuous)", () => {
    const rng = mulberry32(SEED);
    const outcomesSeen = new Set<string>();
    for (let i = 0; i < CASE_COUNT; i++) {
      const input = generateInput(rng, i);
      outcomesSeen.add(decide(input).outcome);
    }
    for (const outcome of ["execute", "ask", "defer", "escalate", "refuse"]) {
      expect(outcomesSeen.has(outcome)).toBe(true);
    }
  });
});
