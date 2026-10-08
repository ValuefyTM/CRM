"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchHit } from "@/lib/search";

const GROUPS: [SearchHit["kind"], string][] = [["report", "Rapoarte"], ["order", "Comenzi"], ["client", "Clienți"], ["contract", "Contracte"], ["property", "Proprietăți"]];
const ICON: Record<SearchHit["kind"], string> = { report: "R", order: "C", client: "P", contract: "K", property: "⌂" };

/**
 * Search in the top bar of every CRM page: report / order / contract number, client name, CUI, phone, email, CF or
 * address. "/" or Ctrl/⌘ K focuses it; arrows and Enter pick a result.
 */
export function GlobalSearch({ base }: { base: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); input.current?.focus(); input.current?.select(); }
    };
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, []);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setHits(null); return; }
    let live = true;
    setBusy(true);
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/crm/search?q=${encodeURIComponent(t)}`).catch(() => null);
      const d = (await r?.json().catch(() => null)) as { results?: SearchHit[] } | null;
      if (!live) return;
      setHits(d?.results ?? []); setHi(0); setBusy(false);
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [q]);

  const ordered = hits ? GROUPS.flatMap(([k]) => hits.filter((h) => h.kind === k)) : [];
  const go = (h: SearchHit, tab = false) => { const url = `${base}${h.href}`; if (tab) window.open(url, "_blank"); else location.href = url; };

  return (
    <div className="gs" ref={box}>
      <svg className="gsIcon" viewBox="0 0 24 24" width="16" height="16" aria-hidden><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      <input
        ref={input} className="gsInput" value={q} placeholder="Caută raport, comandă, client, CUI, telefon, CF…" aria-label="Căutare generală"
        role="combobox" aria-expanded={open && !!hits} aria-controls="gs-results" autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); input.current?.blur(); return; }
          if (!ordered.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((hi + 1) % ordered.length); }
          if (e.key === "ArrowUp") { e.preventDefault(); setHi((hi - 1 + ordered.length) % ordered.length); }
          if (e.key === "Enter") { e.preventDefault(); go(ordered[hi], e.metaKey || e.ctrlKey); }
        }}
      />
      <kbd className="gsKbd" aria-hidden>/</kbd>
      {open && q.trim().length >= 2 && (
        <div className="gsPanel" id="gs-results" role="listbox">
          {!hits ? <div className="gsEmpty">{busy ? "Caut…" : ""}</div>
            : ordered.length === 0 ? <div className="gsEmpty">Nimic găsit pentru „{q.trim()}”.</div>
            : GROUPS.map(([k, label]) => {
              const list = ordered.filter((h) => h.kind === k);
              if (!list.length) return null;
              return (
                <div key={k} className="gsGroup">
                  <div className="gsGroupHead">{label}</div>
                  {list.map((h) => {
                    const i = ordered.indexOf(h);
                    return (
                      <a key={h.kind + h.id} href={`${base}${h.href}`} role="option" aria-selected={i === hi} className="gsHit" onMouseEnter={() => setHi(i)}>
                        <span className={`gsBadge ${h.kind}`} aria-hidden>{ICON[h.kind]}</span>
                        <span className="gsText"><b>{h.title}</b>{h.sub && <small>{h.sub}</small>}</span>
                      </a>
                    );
                  })}
                </div>
              );
            })}
          {ordered.length > 0 && <div className="gsFoot">↑↓ alegi · Enter deschide · Ctrl/⌘+Enter în tab nou · Esc închide</div>}
        </div>
      )}
    </div>
  );
}
