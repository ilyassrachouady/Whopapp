"use client";
import { useEffect, useState, useRef } from "react";
export default function Callback() {
  const [error, setError] = useState("");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, "", window.location.pathname);
    const access_token = hash.get("access_token"),
      refresh_token = hash.get("refresh_token");
    if (!access_token || !refresh_token) {
      Promise.resolve().then(() =>
        setError(
          "This sign-in link is invalid or expired. Request a new link.",
        ),
      );
      return;
    }
    fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token, refresh_token }),
    })
      .then(async (r) => {
        if (!r.ok) throw Error((await r.json()).error);
        window.location.replace("/");
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-wordmark">Payment Desk</div>
        <h1>{error ? "Try a new link." : "Signing you in…"}</h1>
        <p>{error || "Opening your sales workspace."}</p>
        {error && <a href="/login">Back to sign in</a>}
      </section>
    </main>
  );
}
