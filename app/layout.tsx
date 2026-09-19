import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "decision-engine",
  description:
    "A decision layer that knows when it is allowed to act — five outcomes, not two, driven by a reversibility x cost model.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          color: "#1a1a1a",
          background: "#fff",
        }}
      >
        {children}
      </body>
    </html>
  );
}
