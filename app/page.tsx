import { MILESTONES, currentMilestone } from "./milestones";

const REPO_URL = "https://github.com/vladimir-mawla/decision-engine";

function statusLabel(status: "done" | "in-progress" | "planned"): string {
  switch (status) {
    case "done":
      return "done";
    case "in-progress":
      return "in progress";
    case "planned":
      return "planned";
  }
}

export default function Home() {
  const current = currentMilestone();

  return (
    <main
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "2.5rem 1.25rem 4rem",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ marginBottom: "0.25rem" }}>decision-engine</h1>
      <p style={{ color: "#555" }}>
        A decision layer that knows when it is allowed to act — five
        outcomes (execute, ask, defer, escalate, refuse), not two, driven by
        a reversibility &times; cost model.
      </p>

      <p
        style={{
          background: "#fff8e1",
          border: "1px solid #f0d98c",
          borderRadius: 6,
          padding: "0.75rem 1rem",
        }}
      >
        <strong>This project is under construction.</strong>{" "}
        {current
          ? `It is currently on milestone ${current.id} of ${MILESTONES.length} — ${current.title}.`
          : `All ${MILESTONES.length} planned milestones are marked done.`}{" "}
        What you see here is a working skeleton, not the finished product.
      </p>

      <h2>Progress</h2>
      <ol style={{ paddingLeft: "1.25rem" }}>
        {MILESTONES.map((m) => (
          <li key={m.id} style={{ marginBottom: "0.25rem" }}>
            <strong>M{m.id}</strong> — {m.title}{" "}
            <span style={{ color: "#777" }}>({statusLabel(m.status)})</span>
          </li>
        ))}
      </ol>

      <h2>Links</h2>
      <ul style={{ paddingLeft: "1.25rem" }}>
        <li>
          <a href={REPO_URL}>Source on GitHub</a>
        </li>
        <li>
          <a href="/api/health">/api/health</a> — live health check. Every
          request re-exercises the decision engine&apos;s cost model against
          two realistic cases and reports pass/fail, not just liveness.
        </li>
      </ul>
    </main>
  );
}
