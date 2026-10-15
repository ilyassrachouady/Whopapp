"use client";
import { useState } from "react";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
export default function Login() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-wordmark">Payment Desk</div>
        <div className="auth-icon">
          <LockKeyhole size={24} />
        </div>
        <h1>Your sales workspace.</h1>
        <p>Enter your email and we will send a sign-in link.</p>
        {sent ? (
          <div className="auth-success">
            <Mail size={20} />
            <strong>Check your inbox</strong>
            <p>
              We sent a secure sign-in link to {email}. Open it in this browser.
            </p>
            <button onClick={() => setSent(false)}>Use another email</button>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/auth/signin", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email }),
                });
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                setSent(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && (
              <p role="alert" className="auth-error">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy}>
              {busy ? "Sending link…" : "Send sign-in link"}
              <ArrowRight size={17} />
            </button>
          </form>
        )}
        <small>Private access for your sales team.</small>
      </section>
    </main>
  );
}
