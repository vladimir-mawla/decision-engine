import { describe, expect, it } from "vitest";
import { parseAction } from "../../lib/contracts/validation.js";
import { parseDecision } from "../../lib/contracts/validation.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * PART TWO — REGRESSION: real historical defect, M1
 * ══════════════════════════════════════════════════════════════════════
 * DEFECT (M1, found by independent verification): `parseAction` and
 * `parseDecision` (lib/contracts/validation.ts) both carry a doc comment
 * promising they "never throw ... for any input, including ... an object
 * whose properties are actively hostile." The first implementation broke
 * that promise: reading a field directly (`raw.domain`, `raw.outcome`, …)
 * on an object with a throwing getter, or on a Proxy whose `get` trap
 * throws, propagated the exception straight out of the parser — the exact
 * opposite of "reject, don't guess, and never crash" this project's
 * boundary parsers exist to guarantee. It was fixed by routing every field
 * read through `readProperty`/`readField`, which wrap the single property
 * access in try/catch and fold a throw into "field absent."
 *
 * This is a real, already-fixed defect; this test pins it as a permanent
 * regression using ONLY the public API (`parseAction`/`parseDecision`,
 * lib/contracts/index.ts) — never touching the frozen implementation.
 */
describe("REGRESSION (M1) — parseAction/parseDecision never throw on a hostile accessor", () => {
  it("parseAction does not throw when `domain` is a throwing getter", () => {
    const hostile: Record<string, unknown> = {
      type: "t",
      parameters: {},
      costOfBeingWrong: 5,
      reversibility: "reversible-with-cost",
    };
    Object.defineProperty(hostile, "domain", {
      enumerable: true,
      get() {
        throw new Error("hostile getter: domain");
      },
    });

    let result;
    expect(() => {
      result = parseAction(hostile);
    }).not.toThrow();
    expect(result!.ok).toBe(false);
  });

  it("parseAction does not throw when `costOfBeingWrong` is a throwing getter", () => {
    const hostile: Record<string, unknown> = {
      domain: "d",
      type: "t",
      parameters: {},
      reversibility: "reversible-with-cost",
    };
    Object.defineProperty(hostile, "costOfBeingWrong", {
      enumerable: true,
      get() {
        throw new Error("hostile getter: costOfBeingWrong");
      },
    });

    let result;
    expect(() => {
      result = parseAction(hostile);
    }).not.toThrow();
    expect(result!.ok).toBe(false);
  });

  it("parseAction does not throw when handed a Proxy whose get trap always throws", () => {
    const proxy = new Proxy(
      {},
      {
        get() {
          throw new Error("hostile Proxy get trap");
        },
      },
    );

    let result;
    expect(() => {
      result = parseAction(proxy);
    }).not.toThrow();
    expect(result!.ok).toBe(false);
  });

  it("parseDecision does not throw when handed a top-level hostile Proxy (throws on `outcome` itself)", () => {
    const proxy = new Proxy(
      {},
      {
        get() {
          throw new Error("hostile Proxy get trap");
        },
      },
    );

    let result;
    expect(() => {
      result = parseDecision(proxy);
    }).not.toThrow();
    expect(result!.ok).toBe(false);
  });

  it("parseDecision does not throw when `action` is a throwing getter on an otherwise well-formed payload", () => {
    const hostile: Record<string, unknown> = { outcome: "refuse", reason: "because" };
    Object.defineProperty(hostile, "action", {
      enumerable: true,
      get() {
        throw new Error("hostile getter: action");
      },
    });

    let result;
    expect(() => {
      result = parseDecision(hostile);
    }).not.toThrow();
    expect(result!.ok).toBe(false);
  });

  it("parseDecision does not throw when `missing` is a throwing getter on an `ask` payload", () => {
    const hostile: Record<string, unknown> = {
      outcome: "ask",
      action: {
        domain: "d",
        type: "t",
        parameters: {},
        costOfBeingWrong: 5,
        reversibility: "reversible-with-cost",
      },
    };
    Object.defineProperty(hostile, "missing", {
      enumerable: true,
      get() {
        throw new Error("hostile getter: missing");
      },
    });

    let result;
    expect(() => {
      result = parseDecision(hostile);
    }).not.toThrow();
    expect(result!.ok).toBe(false);
  });

  it("a getter inherited from the prototype chain (not an own property) is defended identically", () => {
    const proto = {};
    Object.defineProperty(proto, "domain", {
      enumerable: true,
      get() {
        throw new Error("hostile inherited getter: domain");
      },
    });
    const hostile = Object.create(proto) as Record<string, unknown>;
    hostile.type = "t";
    hostile.parameters = {};
    hostile.costOfBeingWrong = 5;
    hostile.reversibility = "reversible-with-cost";

    let result;
    expect(() => {
      result = parseAction(hostile);
    }).not.toThrow();
    expect(result!.ok).toBe(false);
  });
});
