"use client";
import { useRef, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import type { Closer, Prospect } from "@/lib/types";
export function CreateEntry({
  kind,
  onCreated,
}:
  | { kind: "closer"; onCreated: (value: Closer) => void }
  | { kind: "contact"; onCreated: (value: Prospect) => void }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  return (
    <div className="create-entry">
      <button
        type="button"
        className="crm-open"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Plus size={15} />
        {kind === "closer" ? "Add closer" : "Create new contact"}
      </button>
      {open && (
        <form
          className="entry-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError("");
            const form = event.currentTarget;
            try {
              const response = await fetch(
                kind === "closer" ? "/api/closers" : "/api/ghl/contacts/create",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(Object.fromEntries(new FormData(form))),
                },
              );
              const data = await response.json();
              if (!response.ok) throw new Error(data.error);
              if (kind === "closer") onCreated(data.closer);
              else onCreated(data.prospect);
              form.reset();
              setOpen(false);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          <label>
            Full name
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
            />
          </label>
          {kind === "contact" ? (
            <label>
              Phone <span className="optional-label">Optional</span>
              <input
                name="phone"
                type="tel"
                placeholder="+447700900123"
                autoComplete="tel"
              />
              <small>
                Include the country code. Existing email or phone matches are
                selected instead.
              </small>
            </label>
          ) : (
            <p className="entry-hint">
              Adds this person to the closer list. Login access is managed
              separately.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="entry-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" disabled={busy}>
              {busy && <Loader2 size={14} />}
              {busy
                ? "Saving…"
                : kind === "closer"
                  ? "Save closer"
                  : "Create / select contact"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
