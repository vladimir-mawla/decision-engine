"use client";

import { useMemo, useRef, useState, type JSX, type KeyboardEvent } from "react";
import { REVERSIBILITY_LEVELS, type Reversibility } from "../lib/cost-model/reversibility.js";
import { parseCostOfBeingWrong } from "../lib/cost-model/cost.js";
import type { Action } from "../lib/contracts/action.js";
import type { DecisionAuditRecord } from "../lib/audit/record.js";
import { recordDecision } from "../lib/audit/record.js";
import { ALL_DOMAINS } from "../lib/domains/index.js";
import type { DomainCase } from "../lib/domains/types.js";
import { DecisionCard } from "./DecisionCard.js";
import { formatUsd, reversibilityLabel, reversibilityShort } from "./decision-helpers.js";

/**
 * THE CENTRAL CLAIM, AS AN INTERACTION.
 *
 * `decide()`, and everything it reads (`lib/contracts`, `lib/cost-model`,
 * `lib/signals`, `lib/decide`), is fully isomorphic — the ONLY `node:`
 * import anywhere in this engine is `node:util` inside `lib/audit/
 * replay.ts` (verified by grepping lib/ before writing this file; see
 * app/page.tsx's own header comment for the full architecture note). That
 * means this component can run the real, unmodified `decide()` — via
 * `recordDecision`, which wraps it and adds the audit trail
 * (`lib/audit/record.ts`, also isomorphic: it imports `./rule.js` and
 * `./snapshot.js`, never `./replay.js`) — DIRECTLY IN THE BROWSER, on
 * every slider move, with no network round-trip. That is a dramatically
 * more honest demonstration of "the same evidence produces a different
 * decision depending on what is at stake" than a form POST would be: a
 * server round-trip could always be hiding a cached answer or a second
 * decision function; an instant, client-computed flip is the engine's own
 * purity on display, not an assertion about it.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: it never imports `lib/audit/
 * index.ts` (whose barrel re-exports `replay.ts`) or `lib/audit/
 * replay.js` directly — either would pull `node:util` into this client
 * bundle. Replay verification (does feeding the recorded inputs back
 * through `decide()` reproduce this exact decision?) is real, and this
 * project ships it — just server-side, in app/page.tsx's static cards,
 * where Node is native. This widget shows the full decision AND its full
 * audit record (rule trace, requirements, evidence) instantly; only the
 * "verified by replay" badge is something only the server checks.
 *
 * REQUIREMENT CONSTRUCTION FROM REQUEST DATA (`.genesis/PLAN.md`'s M8
 * row): this widget takes exactly two numbers from the viewer — a cost
 * and a reversibility level — and both become fields of an `Action`, not
 * a `Requirement`. `requirements` below is always `base.requirements`,
 * copied verbatim from the real, frozen domain fixture
 * (`lib/domains/code-deploy/domain.ts`) — never rebuilt from anything
 * this component reads off the slider. So no `Requirement` is EVER
 * constructed from request data on this path, and `parseValueConstraint`
 * (whose one job is bounding a hand-built `Requirement`'s
 * `valueConstraint.in.values`) has nothing to validate here. The cost
 * input goes through `parseCostOfBeingWrong` (its own real parser,
 * rejecting negative/non-finite input) and the reversibility input is
 * restricted, by the segmented control itself, to one of
 * `REVERSIBILITY_LEVELS` — so both of this widget's two request-shaped
 * inputs are validated at their own real boundary, the same discipline
 * `lib/contracts/validation.ts` uses for a full `Action`.
 */

const MIN_LOG = 2; // $100
const MAX_LOG = 6.301; // ~$2,000,000

function logToCost(log: number): number {
  return Math.round(10 ** log);
}

function costToLog(cost: number): number {
  return Math.log10(Math.max(cost, 10 ** MIN_LOG));
}

interface Preset {
  readonly id: string;
  readonly label: string;
  readonly cost: number;
  readonly reversibility: Reversibility;
}

const codeDeploy = ALL_DOMAINS.find((d) => d.name === "code-deploy");
const d7Case = codeDeploy?.cases.find((c) => c.id === "deploy-d7-one-line-fraud-flag");
if (d7Case === undefined) {
  throw new Error("StakesExplorer: expected lib/domains/code-deploy to declare deploy-d7-one-line-fraud-flag");
}
/**
 * Re-bound to a fresh, explicitly-non-undefined `const` rather than relying
 * on the guard above to narrow `d7Case` inside functions declared further
 * down this module (`buildRecord`, the `useState` initializers) — TypeScript's
 * control-flow narrowing does not carry a module-scope `const`'s narrowed
 * type into a later function body, only into code that runs in the same
 * linear flow as the guard itself.
 */
const baseCase: DomainCase = d7Case;
const d1Case = codeDeploy?.cases.find((c) => c.id === "deploy-d1-flag-toggle-admin-tool");

const PRESETS: readonly Preset[] = [
  d1Case
    ? { id: "D1", label: "D1 — flag toggle, admin tool", cost: d1Case.action.costOfBeingWrong, reversibility: d1Case.action.reversibility }
    : { id: "D1", label: "Low stakes", cost: 800, reversibility: "reversible-no-trace" },
  { id: "D7", label: "D7 — flag disables fraud checks", cost: baseCase.action.costOfBeingWrong, reversibility: baseCase.action.reversibility },
];

function buildRecord(cost: number, reversibility: Reversibility): DecisionAuditRecord | null {
  const parsedCost = parseCostOfBeingWrong(cost);
  if (!parsedCost.ok) return null;

  const action: Action = {
    ...baseCase.action,
    costOfBeingWrong: parsedCost.value,
    reversibility,
  };

  const record = recordDecision(
    { action, requirements: baseCase.requirements, signals: baseCase.signals, prohibitions: baseCase.prohibitions, now: baseCase.now },
    `stakes-explorer:${reversibility}:${Math.round(cost)}`,
    baseCase.now,
  );

  return record.kind === "decision" ? record : null;
}

export function StakesExplorer(): JSX.Element {
  const [logCost, setLogCost] = useState(() => costToLog(baseCase.action.costOfBeingWrong));
  const [reversibility, setReversibility] = useState<Reversibility>(() => baseCase.action.reversibility);
  const segmentRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const cost = useMemo(() => logToCost(logCost), [logCost]);
  const record = useMemo(() => buildRecord(cost, reversibility), [cost, reversibility]);
  /**
   * Every stakes combination this widget can produce replays the SAME
   * evidence — D7's (PR #5402, deploy-d7) — at different stakes; the
   * decision that flips is never a different action. With D1's stakes
   * dialed in, the previous title (`baseCase.title`, verbatim: "HARD CASE
   * — one line changed, disables fraud checks on checkout") read as if
   * D1's $800/reversible action disabled a fraud check — a mismatch a
   * skimming viewer reasonably hits inside seconds. The card must say what
   * is actually happening itself, not rely on the paragraph above it.
   */
  const activePreset = PRESETS.find((preset) => preset.cost === cost && preset.reversibility === reversibility);
  const stakesDescriptor = activePreset ? `${activePreset.id}'s` : "these";
  const title = `Same evidence (PR #5402, deploy-d7) at ${stakesDescriptor} stakes: ${formatUsd(cost)}, ${reversibilityLabel(reversibility).toLowerCase()}`;

  /**
   * `role="radiogroup"`/`role="radio"` (below) promise the ARIA APG's
   * roving-tabindex arrow-key pattern: exactly one segment is a Tab stop
   * (`tabIndex 0`, the checked one), the rest are `tabIndex -1`, and
   * Left/Right/Up/Down both move focus AND change the selection, wrapping
   * at the ends. Tab+Enter/Space already worked (native <button>
   * semantics); this closes the gap between the roles asserted and the
   * behaviour actually implemented, rather than quietly downgrading the
   * roles to match a lesser behaviour.
   */
  function handleSegmentKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const lastIndex = REVERSIBILITY_LEVELS.length - 1;
    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = index === lastIndex ? 0 : index + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = index === 0 ? lastIndex : index - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = lastIndex;
        break;
      default:
        return;
    }
    const nextLevel = REVERSIBILITY_LEVELS[nextIndex];
    if (nextLevel === undefined) return;
    event.preventDefault();
    setReversibility(nextLevel);
    segmentRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="stakes-explorer">
      <div className="stakes-explorer__controls">
        <div className="stakes-explorer__presets">
          {PRESETS.map((preset) => {
            const active = preset.cost === cost && preset.reversibility === reversibility;
            return (
              <button
                key={preset.label}
                type="button"
                className={`stakes-explorer__preset${active ? " stakes-explorer__preset--active" : ""}`}
                onClick={() => {
                  setLogCost(costToLog(preset.cost));
                  setReversibility(preset.reversibility);
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <label className="stakes-explorer__control">
          <span className="stakes-explorer__control-label">
            Cost of being wrong: <span className="mono">{formatUsd(cost)}</span>
          </span>
          <input
            type="range"
            min={MIN_LOG}
            max={MAX_LOG}
            step={0.01}
            value={logCost}
            onChange={(event) => setLogCost(Number(event.currentTarget.value))}
            aria-label="Cost of being wrong"
          />
        </label>

        <div className="stakes-explorer__control">
          <span className="stakes-explorer__control-label">Reversibility</span>
          <div className="stakes-explorer__segmented" role="radiogroup" aria-label="Reversibility">
            {REVERSIBILITY_LEVELS.map((level, index) => (
              <button
                key={level}
                ref={(el) => {
                  segmentRefs.current[index] = el;
                }}
                type="button"
                role="radio"
                aria-checked={level === reversibility}
                tabIndex={level === reversibility ? 0 : -1}
                className={`stakes-explorer__segment${level === reversibility ? " stakes-explorer__segment--active" : ""}`}
                onClick={() => setReversibility(level)}
                onKeyDown={(event) => handleSegmentKeyDown(event, index)}
              >
                {reversibilityShort(level)}
              </button>
            ))}
          </div>
        </div>

        <p className="stakes-explorer__note">
          The evidence below never changes {"—"} review approvals, CI status, and a static-analysis
          reading, all exactly as recorded for PR #5402 (deploy-d7). Only this action&rsquo;s stakes move.
        </p>
        <p className="stakes-explorer__note">
          Every drag re-runs the full decision engine {"—"} outcome, confidence, and audit trail
          {" "}{"—"} right here in this tab, not on a server: open your browser&rsquo;s Network tab
          and drag; nothing fires.
        </p>
      </div>

      {record ? (
        <DecisionCard record={record} title={title} />
      ) : (
        <p role="alert">Cost value out of range.</p>
      )}
    </div>
  );
}
