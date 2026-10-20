"use client";
// "Recomandată de": the collaborator who brought the work — one of the collaborators' accounts (Utilizatori →
// Colaboratori: brokers, agents of partner firms). A new one is made in Utilizatori (link, for who may add users).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type Referral = { id: string; name: string; phone?: string | null; email?: string | null; firm?: string | null };
type Hit = { id: string; name: string; phone: string | null; email: string | null; firm: string | null };

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "CO";
const subOf = (h: { phone?: string | null; email?: string | null; firm?: string | null }) => [h.firm, h.phone, h.email].filter(Boolean).join(" · ") || "colaborator";

export function ReferralPick({ value, onChange, canAdd, label = "Recomandată de", bare = false }: {
  value: Referral | null; onChange: (r: Referral | null) => void; canAdd: boolean; label?: string;
  /** without the field label (inside a row that has its own) */
  bare?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/crm/referrals?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal }).then((r) => r.json() as Promise<{ results?: Hit[] }>)
        .then((d) => setHits(d.results ?? [])).catch(() => {});
    }, q.trim() ? 220 : 0);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  const picker = value ? (
    <div className="nwClient ok"><span className="nwKind company">{initials(value.name)}</span><span><b>{value.name}</b><small>{subOf(value)}</small></span>
      <button type="button" className="linkBtn" onClick={() => onChange(null)}>schimbă</button></div>
  ) : (
    <div className="nwSearch" ref={box}>
      <svg className="nwSearchIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input className="input" value={q} placeholder="Alege colaboratorul (nume, firmă, telefon)…" autoComplete="off" aria-label={label}
        onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {open && (
        <div className="nwSearchPanel" role="listbox">
          {hits.map((h) => (
            <button key={h.id} type="button" role="option" aria-selected={false} className="nwSearchHit" onMouseDown={(e) => { e.preventDefault(); onChange(h); setOpen(false); setQ(""); }}>
              <span className="nwKind company">{initials(h.name)}</span>
              <span><b>{h.name}</b><small>{subOf(h)}</small></span>
            </button>
          ))}
          {hits.length === 0 && <p className="hint" style={{ margin: 8 }}>{q.trim() ? "Niciun colaborator cu numele acesta." : "Niciun cont de colaborator încă."}</p>}
          {canAdd && <a className="nwSearchHit nwAddHit" href="/crm/utilizatori/nou?tip=colaborator" target="_blank" rel="noopener"><span className="nwKind new">+</span><span><b>Adaugă cont de colaborator</b><small>în Utilizatori → Colaboratori (se deschide alături)</small></span></a>}
        </div>
      )}
    </div>
  );
  if (bare) return picker;
  return <div className="field"><span className="fLabel">{label} <small>(colaborator · opțional)</small></span>{picker}</div>;
}

/** "Recomandată de" on an existing order or report: shown, and changed in place by who may edit it. */
export function ReferralEdit({ order, report, value, canEdit, canAdd, base }: { order?: string; report?: string; value: Referral | null; canEdit: boolean; canAdd: boolean; base: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState("");
  const save = async (r: Referral | null) => {
    setMsg("");
    const res = await fetch("/api/crm/referrals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order, report, user: r?.id ?? "" }) }).catch(() => null);
    const d = (await res?.json().catch(() => ({}))) as { error?: string };
    if (!res?.ok) return setMsg(d.error ?? "Nu s-a salvat.");
    setEditing(false); router.refresh();
  };
  if (editing) return (
    <span style={{ display: "block", minWidth: 240 }}>
      <ReferralPick bare value={null} onChange={(r) => { if (r) save(r); }} canAdd={canAdd} />
      <span className="actions" style={{ marginTop: 4 }}>
        {value && <button type="button" className="linkBtn danger" onClick={() => save(null)}>Scoate</button>}
        <button type="button" className="linkBtn" onClick={() => setEditing(false)}>Renunță</button>
      </span>
      {msg && <small className="errTxt">{msg}</small>}
    </span>
  );
  return (
    <span>
      {value ? <a className="rowLink" href={`${base}/utilizatori/${value.id}`}>{value.name}</a> : <span className="muted">—</span>}
      {canEdit && <> <button type="button" className="linkBtn" onClick={() => setEditing(true)}>{value ? "schimbă" : "alege"}</button></>}
    </span>
  );
}
