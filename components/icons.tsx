/**
 * Small inline glyphs, one per outcome/escalate-cause, so an outcome is
 * legible by SHAPE as well as colour and text (design brief: "distinguishable
 * at a glance without reading"). Deliberately not emoji (brief: "no emoji
 * section markers") — plain stroked SVG, `currentColor`, sized by the
 * caller's font-size via `1em` so no colour is hard-coded here at all;
 * every colour a glyph ends up rendered in comes from the CSS token applied
 * to its containing badge (app/globals.css), never from this file.
 */
import type { JSX } from "react";

type IconProps = { readonly className?: string };

const base = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function CheckIcon({ className }: IconProps): JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

export function QuestionIcon({ className }: IconProps): JSX.Element {
  return (
    <svg {...base} className={className}>
      <circle cx="10" cy="10" r="7.4" />
      <path d="M7.6 8.1a2.4 2.4 0 1 1 3.6 2.1c-.7.5-1.2.9-1.2 1.9" />
      <circle cx="10" cy="14.3" r="0.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ClockIcon({ className }: IconProps): JSX.Element {
  return (
    <svg {...base} className={className}>
      <circle cx="10" cy="10" r="7.4" />
      <path d="M10 5.8V10l3 2.2" />
    </svg>
  );
}

export function StopIcon({ className }: IconProps): JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M6.2 2.8h7.6l3.4 3.4v7.6l-3.4 3.4H6.2l-3.4-3.4V6.2z" />
      <path d="M7.2 7.2l5.6 5.6M12.8 7.2l-5.6 5.6" />
    </svg>
  );
}

/** escalate / human — someone must sign off. */
export function PersonIcon({ className }: IconProps): JSX.Element {
  return (
    <svg {...base} className={className}>
      <circle cx="10" cy="6.6" r="3.1" />
      <path d="M3.6 17c.6-3.6 3.4-5.6 6.4-5.6s5.8 2 6.4 5.6" />
    </svg>
  );
}

/** escalate / value-rejected — the evidence itself said no. */
export function ShieldSlashIcon({ className }: IconProps): JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M10 2.6l6 2.2v5c0 4-2.6 6.8-6 7.6-3.4-.8-6-4.6-6-7.6v-5z" />
      <path d="M6.8 6.8l6.4 6.4" />
    </svg>
  );
}

/** escalate / cost-ceiling — the bar has hit its ceiling; a bigger stated cost cannot push it further. */
export function CeilingIcon({ className }: IconProps): JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M3 4.4h14" />
      <path d="M6 4.4v9.4M10 4.4v6.6M14 4.4v3.6" />
      <path d="M4.4 4.4l-1 1.6M14.6 4.4l1 1.6" />
    </svg>
  );
}

/** escalate / insufficient-now — headroom remains; better evidence could still clear it. */
export function GaugeIcon({ className }: IconProps): JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M3 14.6a7 7 0 1 1 14 0" />
      <path d="M10 14.6l3-5.4" />
      <path d="M3 14.6h14" />
    </svg>
  );
}

/** escalate / other — a defensive, fail-closed cause (no-requirements, internal-inconsistency, internal-error) that none of the 23 real domain cases actually trigger. */
export function AlertIcon({ className }: IconProps): JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M10 3.2l7.4 13H2.6z" />
      <path d="M10 8.4v4M10 14.6v.15" />
    </svg>
  );
}

export function ReplayIcon({ className }: IconProps): JSX.Element {
  return (
    <svg {...base} className={className}>
      <path d="M4 10a6 6 0 1 0 1.8-4.3" />
      <path d="M4 3.6v3.4h3.4" />
    </svg>
  );
}
