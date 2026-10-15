"use client";
import { useState } from "react";
import { Search, ChevronDown, Check } from "lucide-react";
import type { Closer } from "@/lib/types";
import { OTHER_CLOSER_ID } from "@/lib/closer-selection";
export function CloserPicker({
  closers,
  value,
  onChange,
  otherName,
  onOtherName,
}: {
  closers: Closer[];
  value: string;
  onChange: (id: string) => void;
  otherName: string;
  onOtherName: (name: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const selected = closers.find((closer) => closer.id === value);
  const filtered = closers.filter(
    (closer) =>
      closer.id === OTHER_CLOSER_ID ||
      `${closer.name} ${closer.email}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="closer-search-picker">
      <button
        type="button"
        className="select-trigger"
        aria-expanded={open}
        aria-controls="closer-options"
        onClick={() => {
          setOpen(!open);
          setQuery("");
        }}
      >
        <span>{selected?.name || "Select closer"}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div id="closer-options" className="closer-options">
          <label className="closer-search-label">
            <Search size={15} />
            <input
              aria-label="Search approved closers"
              placeholder="Search closers…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
              }}
            />
          </label>
          <div className="closer-options-list">
            {filtered.map((closer) => (
              <button
                type="button"
                key={closer.id}
                aria-pressed={value === closer.id}
                onClick={() => {
                  onChange(closer.id);
                  setOpen(false);
                }}
              >
                <span>
                  <strong>{closer.name}</strong>
                  <small>
                    {closer.id === OTHER_CLOSER_ID
                      ? "Someone outside GHL"
                      : "GHL · Closer"}
                  </small>
                </span>
                {value === closer.id && <Check size={15} />}
              </button>
            ))}
          </div>
        </div>
      )}
      {value === OTHER_CLOSER_ID && (
        <label className="other-closer-label">
          Closer name
          <input
            required
            minLength={2}
            maxLength={100}
            placeholder="Who took the call?"
            value={otherName}
            onChange={(event) => onOtherName(event.target.value)}
          />
        </label>
      )}
    </div>
  );
}
