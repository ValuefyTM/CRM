"use client";
// The client's name, searched in the CRM as it is typed: a match fills in phone and email; otherwise a new client.
// Used by the order form and the quote form.
import { useEffect, useRef, useState } from "react";

export type ClientHit = { id: string; kind: string; name: string; cui: string | null; phone: string | null; email: string | null; city: string | null; reports: number };
type Hit = ClientHit;

export function ClientSearch({ value, onType, onPick, invalid }: { value: string; onType: (v: string) => void; onPick: (h: Hit) => void; invalid?: boolean }) {
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/crm/clients/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal }).then((r) => r.json() as Promise<{ results?: Hit[] }>).then((d) => {
        setHits((d.results ?? []).filter((h) => h.kind === "person" || h.kind === "company")); setHi(0);
      }).catch(() => {});
    }, 220);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [value]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  const pick = (h: Hit) => { onPick(h); setOpen(false); };
  return (
    <div className="nwSearch" ref={box}>
      <svg className="nwSearchIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input className="input" value={value} aria-invalid={invalid || undefined} aria-label="Nume client" placeholder="Caută după nume, telefon, CUI sau scrie un client nou" autoComplete="off"
        onFocus={() => setOpen(true)} onChange={(e) => { onType(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (!open || !hits.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(hits.length - 1, h + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(hits[hi]); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {open && hits.length > 0 && (
        <div className="nwSearchPanel" role="listbox">
          {hits.map((h, i) => (
            <button key={h.id} type="button" role="option" aria-selected={i === hi} className={`nwSearchHit${i === hi ? " hi" : ""}`} onMouseDown={(e) => { e.preventDefault(); pick(h); }} onMouseEnter={() => setHi(i)}>
              <span className={`nwKind ${h.kind}`}>{h.kind === "company" ? "PJ" : "PF"}</span>
              <span><b>{h.name}</b><small>{[h.phone, h.email, h.cui && `CUI ${h.cui}`, h.city].filter(Boolean).join(" · ") || "fără date de contact"}</small></span>
              {h.reports > 0 && <em>{h.reports} {h.reports === 1 ? "raport" : "rapoarte"}</em>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

