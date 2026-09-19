import { describe, expect, it } from "vitest";
import { recordDecision } from "../record.js";
import { discloseSignalValue } from "../disclose.js";
import type { SignalSnapshot } from "../snapshot.js";
import { capturedAt, fixtureInput, fixtureRequirement, fixtureSignal, NOW } from "./fixtures.js";

/**
 * THE STRUCTURAL, MUTATION-PROOF SHAPE CHECK — the model this file's own
 * two "never discloses a value" tests now follow, mirroring snapshot.
 * test.ts's `"value" in snapshot` check rather than a string-absence
 * search. An evidence entry is provably plain metadata only if it has
 * EXACTLY the SignalSnapshot keys (id/kind/source/capturedAt/confidence),
 * no `value` key, and no function-valued property anywhere on it — the
 * last check is what catches a raw `Signal` (which carries a `.read`
 * function) slipping in undetected by everything else.
 */
function assertPlainSignalSnapshot(entry: SignalSnapshot): void {
  expect(Object.keys(entry).sort()).toEqual(["capturedAt", "confidence", "id", "kind", "source"]);
  expect("value" in entry).toBe(false);
  for (const key of Object.keys(entry)) {
    expect(typeof (entry as unknown as Record<string, unknown>)[key]).not.toBe("function");
  }
}

const ID = "audit-1";
const RECORDED_AT = NOW;

describe("recordDecision — a full audit trail per decision", () => {
  it("records id and recordedAt verbatim, exactly as supplied (never generated internally)", () => {
    const record = recordDecision(fixtureInput(), ID, RECORDED_AT);
    expect(record.id).toBe(ID);
    expect(record.recordedAt).toBe(RECORDED_AT);
  });

  it("no-outcome-without-signals: the record carries the exact evidence, not just the verdict", () => {
    const signal = fixtureSignal({ id: "sig-a", confidence: 0.95 });
    const record = recordDecision(
      fixtureInput({ requirements: [fixtureRequirement({ minConfidence: 0.1 })], signals: [signal] }),
      ID,
      RECORDED_AT,
    );
    expect(record.kind).toBe("decision");
    if (record.kind === "decision") {
      expect(record.decision.outcome).toBe("execute");
      expect(record.decision.evidence).toEqual([
        { id: "sig-a", kind: signal.kind, source: signal.source, capturedAt: signal.capturedAt, confidence: signal.confidence },
      ]);
    }
  });

  it("never discloses a signal's value — evidence entries are structurally plain metadata, even when the underlying signal carries something sensitive", () => {
    const sensitive = fixtureSignal({ id: "sig-sensitive", value: { ssn: "000-00-0000" }, confidence: 0.95 });
    const record = recordDecision(
      fixtureInput({ requirements: [fixtureRequirement({ minConfidence: 0.1 })], signals: [sensitive] }),
      ID,
      RECORDED_AT,
    );
    expect(record.kind).toBe("decision");
    if (record.kind !== "decision") return;

    // THE PRIMARY GUARANTEE, structural rather than string-based: every
    // evidence entry is provably plain metadata — no `value` key, no
    // function-valued property (which would catch a raw `Signal`'s
    // `.read` closure slipping in). This is the mutation-proof version:
    // it fails if recordDecision ever embeds a raw `Signal` (closures and
    // all) instead of mapping through `toSignalSnapshot`, regardless of
    // whether the underlying value happens to be reachable by string
    // search — see the comment below on why a string search cannot tell
    // the difference either way.
    for (const entry of record.decision.evidence) {
      assertPlainSignalSnapshot(entry);
    }

    // SECONDARY, and INSUFFICIENT ALONE AS A GUARANTEE: this used to be
    // the ONLY assertion in this test, and it is vacuous as a security
    // check by itself. A Signal's value lives inside a closure
    // (snapshot.ts's header comment) — `JSON.stringify` cannot reach it
    // whether recordDecision maps through `toSignalSnapshot` (the correct
    // behavior) OR embeds the raw `Signal` directly (a real regression:
    // verified by temporarily making record.ts do exactly that — see this
    // milestone's audit fix — which leaves this string check passing).
    // Kept only as a secondary, non-load-bearing sanity check.
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("000-00-0000");
    expect(serialized).not.toContain("ssn");
  });

  it("disclosure remains available, separately and by name, for a caller who deliberately wants it", () => {
    const sensitive = fixtureSignal({ id: "sig-sensitive-2", value: 12345, confidence: 0.95 });
    const record = recordDecision(
      fixtureInput({ requirements: [fixtureRequirement({ minConfidence: 0.1 })], signals: [sensitive] }),
      ID,
      RECORDED_AT,
    );
    expect(record.kind).toBe("decision");
    if (record.kind === "decision") {
      // Same structural guarantee as the previous test, checked again
      // here because this test's own point is that disclosure is a
      // SEPARATE, deliberate act — it must not accidentally be true only
      // because recordDecision happened to omit `value` this one time.
      for (const entry of record.decision.evidence) {
        assertPlainSignalSnapshot(entry);
      }
    }
    // SECONDARY, and INSUFFICIENT ALONE — see the comment on the previous
    // test: a closure-hidden value defeats this string check regardless
    // of whether the record actually holds a snapshot or a raw Signal.
    expect(JSON.stringify(record)).not.toContain("12345");
    const disclosure = discloseSignalValue(sensitive, fixtureRequirement().maxAge, NOW);
    expect(disclosure.reading.status).toBe("fresh");
    if (disclosure.reading.status === "fresh") {
      expect(disclosure.reading.value).toBe(12345);
    }
  });

  it("names the exact rule that fired, alongside the outcome", () => {
    const record = recordDecision(
      fixtureInput({ prohibitions: [{ id: "no-frozen", reason: "account frozen", matches: () => true }] }),
      ID,
      RECORDED_AT,
    );
    expect(record.kind).toBe("decision");
    if (record.kind === "decision") {
      expect(record.decision.outcome).toBe("refuse");
      expect(record.rule).toEqual({ kind: "prohibition", prohibitionId: "no-frozen", reason: "account frozen" });
    }
  });

  it("records the prohibition ids in order, standing in for the un-serializable `matches` predicates", () => {
    const record = recordDecision(
      fixtureInput({
        prohibitions: [
          { id: "p1", reason: "r1", matches: () => false },
          { id: "p2", reason: "r2", matches: () => false },
        ],
      }),
      ID,
      RECORDED_AT,
    );
    expect(record.kind).toBe("decision");
    if (record.kind === "decision") {
      expect(record.prohibitionIds).toEqual(["p1", "p2"]);
    }
  });

  it("records requirements and now verbatim, lossless (plain data, no functions)", () => {
    const requirement = fixtureRequirement({ signalKind: "x", minConfidence: 0.1 });
    const record = recordDecision(fixtureInput({ requirements: [requirement], now: NOW }), ID, RECORDED_AT);
    expect(record.kind).toBe("decision");
    if (record.kind === "decision") {
      expect(record.requirements).toEqual([requirement]);
      expect(record.now).toBe(NOW);
    }
  });

  it("carries no snapshotWarnings for an ordinary, well-formed input", () => {
    const record = recordDecision(fixtureInput(), ID, RECORDED_AT);
    expect(record.kind).toBe("decision");
    if (record.kind === "decision") {
      expect(record.snapshotWarnings).toEqual([]);
    }
  });

  /**
   * SWEEP FINDING (see this milestone's audit fix report): every other
   * test in this file, and in every other file in this directory, calls
   * `recordDecision` with `now === recordedAt` (both are `NOW`/
   * `RECORDED_AT`, which are the same fixture constant everywhere). That
   * makes `record.now` and `record.recordedAt` indistinguishable across
   * the entire suite — a `safeReadNow` that silently ignored
   * `input.now` and always returned `recordedAt` instead would satisfy
   * every existing assertion (verified: exactly that mutation left all
   * 63 audit tests green). This test uses a `now` far from `recordedAt`
   * specifically to make that bug detectable.
   */
  it("now is recorded from input.now, independently of recordedAt (not just coincidentally equal to it, unlike every other test in this file)", () => {
    const distinctNow = capturedAt("2020-01-01T00:00:00.000Z");
    const record = recordDecision(fixtureInput({ now: distinctNow }), ID, RECORDED_AT);
    expect(record.kind).toBe("decision");
    if (record.kind === "decision") {
      expect(record.now).toBe(distinctNow);
      expect(record.now).not.toBe(record.recordedAt);
    }
  });
});
