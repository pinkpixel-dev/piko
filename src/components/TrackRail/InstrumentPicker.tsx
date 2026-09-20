/**
 * Instrument chooser, grouped by the General MIDI families.
 *
 * A modal dialog rather than a dropdown, because 128 instruments in a native
 * select is a wall of text with no grouping and no way to search.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { GM_FAMILIES, GM_PROGRAM_NAMES } from "../../midi/gm";
import { IconButton } from "../common/IconButton";
import "./InstrumentPicker.css";

interface InstrumentPickerProps {
  trackName: string;
  program: number;
  onSelect: (program: number) => void;
  onClose: () => void;
}

interface Entry {
  program: number;
  name: string;
  family: string;
}

const ALL_ENTRIES: Entry[] = GM_PROGRAM_NAMES.map((name, program) => {
  let family = GM_FAMILIES[0].name;
  for (const candidate of GM_FAMILIES) {
    if (program >= candidate.start) family = candidate.name;
    else break;
  }
  return { program, name, family };
});

export function InstrumentPicker({
  trackName,
  program,
  onSelect,
  onClose,
}: InstrumentPickerProps) {
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Escape closes, and Tab is kept inside the dialog so keyboard focus cannot
  // wander into the editor behind it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, input, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? ALL_ENTRIES.filter(
          (entry) =>
            entry.name.toLowerCase().includes(needle) ||
            entry.family.toLowerCase().includes(needle),
        )
      : ALL_ENTRIES;

    const byFamily = new Map<string, Entry[]>();
    for (const entry of matches) {
      const bucket = byFamily.get(entry.family);
      if (bucket) bucket.push(entry);
      else byFamily.set(entry.family, [entry]);
    }
    return [...byFamily.entries()];
  }, [query]);

  return (
    <div className="instrument-picker__backdrop" onPointerDown={onClose}>
      <div
        className="instrument-picker"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Choose an instrument for ${trackName}`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="instrument-picker__header">
          <h2>Instrument</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>

        <input
          ref={searchRef}
          className="instrument-picker__search"
          type="search"
          placeholder="Search instruments"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search instruments"
        />

        <div className="instrument-picker__list">
          {groups.length === 0 ? (
            <p className="instrument-picker__empty">
              No instrument matches “{query}”. Try a shorter word.
            </p>
          ) : (
            groups.map(([family, entries]) => (
              <section key={family}>
                <h3 className="instrument-picker__family">{family}</h3>
                {entries.map((entry) => (
                  <button
                    key={entry.program}
                    type="button"
                    className="instrument-picker__item"
                    data-selected={entry.program === program || undefined}
                    onClick={() => onSelect(entry.program)}
                    aria-pressed={entry.program === program}
                  >
                    <span className="instrument-picker__number tabular">
                      {String(entry.program + 1).padStart(3, "0")}
                    </span>
                    {entry.name}
                  </button>
                ))}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
