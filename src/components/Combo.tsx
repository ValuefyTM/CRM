"use client";
// An input with a filtered list under it (county, locality): type to filter, arrows and Enter to pick, Esc to close.
// With `free`, a value not in the list is kept as typed (a locality spelled differently, a new one).
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fold } from "@/lib/places";

export function Combo({ value, onChange, options, placeholder, free = true, disabled, label, max = 60 }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; free?: boolean; disabled?: boolean; label: string; max?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => { if (!open) setQ(value); }, [value, open]);
  const list = useMemo(() => {
    const s = fold(q);
    if (!s || (!open && q === value)) return options.slice(0, max);
    const starts = options.filter((o) => fold(o).startsWith(s));
    const inner = options.filter((o) => !fold(o).startsWith(s) && fold(o).includes(s));
    return [...starts, ...inner].slice(0, max);
  }, [q, options, open, value, max]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  });
  const pick = (v: string) => { onChange(v); setQ(v); setOpen(false); };
  // Leaving the field: an exact match (any case, diacritics) is taken as the list spells it; else the typed text if free.
  const close = () => {
    setOpen(false);
    const exact = options.find((o) => fold(o) === fold(q));
    if (exact) { if (exact !== value) onChange(exact); setQ(exact); }
    else if (free) { if (q.trim() !== value) onChange(q.trim()); }
    else setQ(value);
  };
  return (
    <div className="combo" ref={box}>
      <input className="input" role="combobox" aria-expanded={open} aria-controls={id} aria-label={label} value={q} placeholder={placeholder} disabled={disabled} autoComplete="off"
        onFocus={(e) => { setOpen(true); e.target.select(); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onBlur={() => setTimeout(() => { if (!box.current?.contains(document.activeElement)) close(); }, 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(list.length - 1, h + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          else if (e.key === "Enter" && open && list[hi]) { e.preventDefault(); pick(list[hi]); }
          else if (e.key === "Escape") { setOpen(false); setQ(value); }
        }} />
      <svg className="comboChev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      {open && !disabled && (
        <ul className="comboList" id={id} role="listbox">
          {list.length === 0 ? <li className="comboEmpty">{free ? "Nu e în listă: se păstrează cum ai scris." : "Nimic găsit."}</li>
            : list.map((o, i) => (
              <li key={o} role="option" aria-selected={o === value} className={i === hi ? "hi" : ""} onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setHi(i)}>{o}</li>
            ))}
        </ul>
      )}
    </div>
  );
}
