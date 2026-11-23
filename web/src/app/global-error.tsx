"use client";

/** Last-resort boundary (errors in the root layout). Must render its own <html>/<body>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "20vh 24px" }}>
        <h1>Something went wrong</h1>
        <p>Please try again. {error.digest ? `Reference: ${error.digest}` : ""}</p>
        <button onClick={reset} style={{ padding: "8px 16px", borderRadius: 8, border: 0, background: "#0f172a", color: "#fff", fontWeight: 600 }}>Try again</button>
        <p style={{ marginTop: 32, fontSize: 12, color: "#94a3b8" }}>Powered by Nexsofture Tech</p>
      </body>
    </html>
  );
}
