import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "decision-engine",
  description:
    "A decision layer that knows when it is allowed to act — five outcomes, not two, driven by a reversibility x cost model.",
};

/**
 * No inline styles here anymore (M8): every colour is a token defined in
 * app/globals.css's base :root, redefined only under
 * `prefers-color-scheme: dark` — never introduced fresh inside the media
 * query — so the light/dark story lives in exactly one file.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
