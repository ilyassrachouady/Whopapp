"use client";
import { useEffect, useState } from "react";
import { Search, Loader2, ArrowUpRight, X } from "lucide-react";
import type { Prospect } from "@/lib/types";
import { CreateEntry } from "./create-entry";
type Contact = { id: string; name: string; email: string; phone: string };
export function CrmContactPicker({
  onSelect,
}: {
  onSelect: (p: Prospect) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [rows, setRows] = useState<Contact[]>([]),
    [busy, setBusy] = useState(false),
    [selecting, setSelecting] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/ghl/contacts?q=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw Error(d.error);
          setRows(d.contacts);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);
  return (
    <div className="crm-search">
      <button
        type="button"
        className="crm-open"
        onClick={() => {
          setOpen(!open);
          setBusy(query.trim().length >= 2);
        }}
      >
        <Search size={16} />
        Search CRM contacts
        <ArrowUpRight size={14} />
      </button>
      {open && (
        <div className="crm-search-panel">
          <div className="crm-search-input">
            <Search size={17} />
            <input
              autoFocus
              aria-label="Search CRM contacts"
              placeholder="Name, email or phone number"
              maxLength={100}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setRows([]);
                setBusy(e.target.value.trim().length >= 2);
                setError("");
              }}
            />
            <button
              type="button"
              aria-label="Close contact search"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <CreateEntry
            kind="contact"
            onCreated={(prospect) => {
              onSelect(prospect);
              setOpen(false);
              setQuery("");
            }}
          />
          <div className="crm-results" aria-live="polite">
            {busy ? (
              <p>
                <Loader2 size={16} />
                Searching contacts…
              </p>
            ) : error ? (
              <p role="alert">{error}</p>
            ) : query.trim().length < 2 ? (
              <p>Type at least 2 characters to search your CRM.</p>
            ) : rows.length === 0 ? (
              <p>No contacts found. Try another name, email or phone.</p>
            ) : (
              rows.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  disabled={!!selecting}
                  onClick={async () => {
                    setSelecting(c.id);
                    setError("");
                    try {
                      const r = await fetch("/api/ghl/contacts/select", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ contactId: c.id }),
                      });
                      const d = await r.json();
                      if (!r.ok) throw Error(d.error);
                      onSelect(d.prospect);
                      setOpen(false);
                      setQuery("");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setSelecting("");
                    }
                  }}
                >
                  <span>
                    <strong>{c.name}</strong>
                    <small>
                      {[c.email, c.phone].filter(Boolean).join(" · ") ||
                        "No email or phone"}
                    </small>
                  </span>
                  {selecting === c.id ? (
                    <Loader2 size={17} />
                  ) : (
                    <ArrowUpRight size={17} />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
