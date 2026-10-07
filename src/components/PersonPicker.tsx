"use client";
// Picker of a team member, in place of a plain <select>: avatar with online / offline marker, role and last activity,
// search, keyboard (arrows, Enter, Esc). Extra choices ("Mai târziu", "Fără inspecție") can come before or after people.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Presence } from "@/lib/presence";
import { Avatar, PersonLine } from "./Avatar";

export type PickPerson = { id: string; name: string; sub?: string | null; presence?: Presence | null; seen?: string | null; photo?: string | null };
export type PickExtra = { value: string; label: string; hint?: string; after?: boolean };

export function PersonPicker({ value, onChange, people, me, placeholder = "Alege…", extras = [], label, disabled }: {
  value: string; onChange: (v: string) => void; people: PickPerson[]; me?: string; placeholder?: string; extras?: PickExtra[]; label: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();

  type Opt = { value: string; person?: PickPerson; extra?: PickExtra };
  const opts = useMemo<Opt[]>(() => {
    const s = q.trim().toLowerCase();
    const ppl = people.filter((p) => !s || p.name.toLowerCase().includes(s) || (p.sub ?? "").toLowerCase().includes(s))
      // online first, then the rest in their order
      .sort((a, b) => rank(a.presence) - rank(b.presence));
    const ex = s ? [] : extras;
    return [...ex.filter((e) => !e.after).map((e) => ({ value: e.value, extra: e })), ...ppl.map((p) => ({ value: p.id, person: p })), ...ex.filter((e) => e.after).map((e) => ({ value: e.value, extra: e }))];
  }, [people, extras, q]);

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    setTimeout(() => search.current?.focus(), 0);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  useEffect(() => { setHi(Math.max(0, opts.findIndex((o) => o.value === value))); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (v: string) => { onChange(v); setOpen(false); setQ(""); };
  const cur = people.find((p) => p.id === value);
  const curExtra = extras.find((e) => e.value === value);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else setHi(Math.min(opts.length - 1, hi + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(Math.max(0, hi - 1)); }
    else if (e.key === "Enter" && open) { e.preventDefault(); if (opts[hi]) pick(opts[hi].value); }
    else if (e.key === "Escape") { if (open) { e.stopPropagation(); setOpen(false); } }
  };

  return (
    <div ref={box} className={`pPick${open ? " open" : ""}`} onKeyDown={onKey}>
      <button type="button" className="pPickBtn" aria-haspopup="listbox" aria-expanded={open} aria-label={label} disabled={disabled} onClick={() => setOpen(!open)}>
        {cur ? <PersonLine id={cur.id} name={cur.name} sub={[cur.sub, cur.seen].filter(Boolean).join(" · ")} presence={cur.presence} photo={cur.photo} size={28} me={cur.id === me} />
          : <span className={curExtra ? "pPickExtra" : "pPickPh"}>{curExtra?.label ?? placeholder}</span>}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="pPickPop">
          {people.length > 6 && <input ref={search} className="pPickSearch" value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} placeholder="Caută după nume…" aria-label="Caută" aria-controls={listId} />}
          <ul id={listId} role="listbox" aria-label={label}>
            {opts.length === 0 && <li className="pPickNone">Nimeni cu acest nume.</li>}
            {opts.map((o, i) => (
              <li key={o.value || "_"} role="option" aria-selected={o.value === value} className={`${i === hi ? "hi" : ""}${o.value === value ? " sel" : ""}`}
                onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(o.value); }}>
                {o.person ? <PersonLine id={o.person.id} name={o.person.name} sub={[o.person.sub, o.person.seen].filter(Boolean).join(" · ")} presence={o.person.presence} photo={o.person.photo} size={30} me={o.person.id === me} />
                  : <span className="pPickExtra"><b>{o.extra!.label}</b>{o.extra!.hint && <small>{o.extra!.hint}</small>}</span>}
                {o.value === value && <svg className="pPickCheck" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const rank = (p?: Presence | null) => (p === "online" ? 0 : p === "away" ? 1 : 2);

/** Small group of avatars (a report's team). */
export function AvatarStack({ people, max = 4 }: { people: PickPerson[]; max?: number }) {
  return (
    <span className="pStack">
      {people.slice(0, max).map((p) => <Avatar key={p.id} id={p.id} name={p.name} size={28} presence={p.presence} photo={p.photo} title={`${p.name}${p.seen ? ` · ${p.seen}` : ""}`} />)}
      {people.length > max && <span className="pMore">+{people.length - max}</span>}
    </span>
  );
}
