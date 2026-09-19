import { parseAction } from "../../../lib/contracts/index";
import { requiredConfidence } from "../../../lib/cost-model/index";

/**
 * Force dynamic + Node.js runtime: without `dynamic = "force-dynamic"`,
 * Next.js may treat this route as statically renderable and serve a
 * prerendered response from build time forever after — at which point the
 * "live" cost-model check below becomes theatre, run once at build and
 * never again. The Node.js runtime (the default for route handlers, named
 * explicitly here so it's not an accident of a default that could change)
 * is required because this route imports lib/ directly, and lib/'s tests
 * and this project's whole premise assume real Node semantics, not the
 * edge runtime's restricted subset.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CostModelCheckResult {
  readonly pass: boolean;
  readonly elapsedMs: number;
  readonly detail: string;
}

/**
 * Real work, not a liveness ping: parses two Actions through M1's actual
 * parseAction, computes requiredConfidence for two different
 * (reversibility, cost) pairs, and asserts the central property the whole
 * project rests on — the asymmetry — right here, in the deployed process,
 * on every request. These are the same worked examples documented in
 * lib/cost-model/requiredConfidence.ts's module comment:
 *   requiredConfidence("reversible-no-trace", 5)   ~= 0.508 -> 0.60 clears it
 *   requiredConfidence("irreversible", 50_000)     ~= 0.978 -> 0.60 does not
 * A single fixed confidence (0.60) must clear the cheap/reversible bar and
 * fail the expensive/irreversible one. If it doesn't — or if anything here
 * throws — this reports failure; it never lets an exception escape past
 * the health endpoint.
 */
function runCostModelCheck(): CostModelCheckResult {
  const start = performance.now();
  try {
    const cheap = parseAction({
      domain: "health-check",
      type: "self-test",
      parameters: {},
      costOfBeingWrong: 5,
      reversibility: "reversible-no-trace",
    });
    if (!cheap.ok) {
      return {
        pass: false,
        elapsedMs: performance.now() - start,
        detail: `parseAction (cheap case) failed: ${cheap.error.kind}`,
      };
    }

    const expensive = parseAction({
      domain: "health-check",
      type: "self-test",
      parameters: {},
      costOfBeingWrong: 50_000,
      reversibility: "irreversible",
    });
    if (!expensive.ok) {
      return {
        pass: false,
        elapsedMs: performance.now() - start,
        detail: `parseAction (expensive case) failed: ${expensive.error.kind}`,
      };
    }

    const cheapBar = requiredConfidence(
      cheap.value.reversibility,
      cheap.value.costOfBeingWrong,
    );
    const expensiveBar = requiredConfidence(
      expensive.value.reversibility,
      expensive.value.costOfBeingWrong,
    );

    const fixedConfidence = 0.6;
    const clearsCheap = fixedConfidence >= cheapBar;
    const clearsExpensive = fixedConfidence >= expensiveBar;

    // The property under test: the SAME confidence must clear one bar and
    // fail the other. If both clear, or both fail, the asymmetry the
    // engine exists to enforce is not actually present.
    const asymmetryHolds = clearsCheap && !clearsExpensive;

    return {
      pass: asymmetryHolds,
      elapsedMs: performance.now() - start,
      detail: asymmetryHolds
        ? `confidence ${fixedConfidence} clears reversible-no-trace/$5 (bar ${cheapBar.toFixed(3)}) but not irreversible/$50000 (bar ${expensiveBar.toFixed(3)})`
        : `asymmetry did not hold: cheapBar=${cheapBar.toFixed(3)} expensiveBar=${expensiveBar.toFixed(3)} fixedConfidence=${fixedConfidence} clearsCheap=${clearsCheap} clearsExpensive=${clearsExpensive}`,
    };
  } catch (err) {
    return {
      pass: false,
      elapsedMs: performance.now() - start,
      detail: `cost model check threw: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

export async function GET(): Promise<Response> {
  const costModel = runCostModelCheck();

  // No secrets, no internal paths: the detail strings above are numbers
  // and outcome names only, and this project has no credentials to leak
  // in the first place (see .env.example) — asserting that is itself part
  // of what this endpoint is for.
  const body = {
    status: costModel.pass ? "ok" : "degraded",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown (local dev)",
    checks: {
      costModel: {
        pass: costModel.pass,
        elapsedMs: Math.round(costModel.elapsedMs * 1000) / 1000,
        detail: costModel.detail,
      },
    },
  };

  // Fail closed: a health endpoint that reports 200 while its core model
  // is broken is worse than no health endpoint at all.
  return Response.json(body, { status: costModel.pass ? 200 : 503 });
}
