import { describe, expect, it } from "vitest";
import { decide } from "../../lib/decide/decide.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * PART TWO — REGRESSION: real historical defect, M4 (CRITICAL)
 * ══════════════════════════════════════════════════════════════════════
 * DEFECT (M4, found by independent verification — the most severe of the
 * nine): `decide()`'s doc comment promises it "never throws, for any
 * input." The original implementation wrapped its body in try/catch, but
 * the CATCH HANDLER ITSELF re-read `input.action` to build the escalate
 * fallback it was constructing. When `input` was itself the hostile thing
 * — `null`, `undefined`, or a Proxy whose `get` trap throws on every
 * property including `action` — that second read threw INSIDE the catch,
 * with nothing left to catch it: `decide(null)` and `decide(undefined)`
 * threw `TypeError: Cannot read properties of null/undefined (reading
 * 'action')` straight out of the function, directly falsifying its own
 * "never throws" comment from inside the exact code path that existed to
 * prevent that.
 *
 * The fix: read `input.action` exactly ONCE, defensively, before either
 * try block runs, into a local the fallback reuses — and introduce a new,
 * deliberately non-`Decision` `InputRejected` result for when there is
 * nothing usable to reason about at all (no honest `Action` exists to
 * attach to any of the five real outcomes).
 */
describe("REGRESSION (M4, CRITICAL) — decide() never throws, not even on unusable top-level input", () => {
  it("decide(null) does not throw and returns input-rejected", () => {
    let result;
    expect(() => {
      // @ts-expect-error — deliberately hostile top-level input.
      result = decide(null);
    }).not.toThrow();
    expect(result!.outcome).toBe("input-rejected");
  });

  it("decide(undefined) does not throw and returns input-rejected", () => {
    let result;
    expect(() => {
      // @ts-expect-error — deliberately hostile top-level input.
      result = decide(undefined);
    }).not.toThrow();
    expect(result!.outcome).toBe("input-rejected");
  });

  it("decide() on a Proxy whose get trap throws on every property, including `action`, does not throw", () => {
    const hostileInput = new Proxy(
      {},
      {
        get() {
          throw new Error("hostile Proxy: every property access throws, including `action`");
        },
      },
    );

    let result;
    expect(() => {
      // @ts-expect-error — deliberately hostile top-level input.
      result = decide(hostileInput);
    }).not.toThrow();
    expect(result!.outcome).toBe("input-rejected");
  });

  it("decide({}) — action missing entirely, not merely unreadable — also returns input-rejected without throwing", () => {
    let result;
    expect(() => {
      // @ts-expect-error — deliberately missing `action`.
      result = decide({});
    }).not.toThrow();
    expect(result!.outcome).toBe("input-rejected");
  });

  it("input-rejected is never one of the five real Decision outcomes, and is never mistaken for a cautious decision", () => {
    // @ts-expect-error — deliberately hostile top-level input.
    const result = decide(null);
    const realOutcomes = ["execute", "ask", "defer", "escalate", "refuse"];
    expect(realOutcomes).not.toContain(result.outcome);
    // FIX 1 (M4 second independent verification): this result carries no
    // `action` field at all — asserting that directly, since fabricating a
    // placeholder Action would misrepresent what was evaluated (nothing).
    expect("action" in result).toBe(false);
  });
});
