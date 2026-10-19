"use client";
// "Recomandată de": the collaborator (broker, agent, partner firm — an entity of kind "broker") who brought the work,
// searched among the CRM's collaborators; with "+ Adaugă" (for who may add clients) a new one is made on the spot.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type Referral = { id: string; name: string; phone?: string | null; email?: string | null };
type Hit = { id: string; name: string; phone: string | null; email: string | null; city: string | null };

export function ReferralPick({ value, onChange, canAdd, label = "Recomandată de" }: { value: Referral | null; onChange: (r: Referral | null) => void; canAdd: boolean; label?: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/crm/clients/search?kind=broker&q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal }).then((r) => r.json() as Promise<{ results?: Hit[] }>)
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
  return (
    <div className="field"><span className="fLabel">{label} <small>(colaborator · opțional)</small></span>
      {value ? (
        <div className="nwClient ok"><span className="nwKind company">CO</span><span><b>{value.name}</b><small>{[value.phone, value.email].filter(Boolean).join(" · ") || "colaborator"}</small></span>
          <button type="button" className="linkBtn" onClick={() => onChange(null)}>schimbă</button></div>
      ) : (
        <div className="nwSearch" ref={box}>
          <svg className="nwSearchIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input className="input" value={q} placeholder="Caută colaboratorul (agent, broker, firmă)…" autoComplete="off" aria-label={label}
            onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
          {open && (
            <div className="nwSearchPanel" role="listbox">
              {hits.map((h) => (
                <button key={h.id} type="button" role="option" aria-selected={false} className="nwSearchHit" onMouseDown={(e) => { e.preventDefault(); onChange(h); setOpen(false); setQ(""); }}>
                  <span className="nwKind company">CO</span>
                  <span><b>{h.name}</b><small>{[h.phone, h.email, h.city].filter(Boolean).join(" · ") || "colaborator"}</small></span>
                </button>
              ))}
              {hits.length === 0 && <p className="hint" style={{ margin: 8 }}>{q.trim() ? "Niciun colaborator cu numele acesta." : "Niciun colaborator încă."}</p>}
              {canAdd && <button type="button" className="nwSearchHit nwAddHit" onMouseDown={(e) => { e.preventDefault(); setAdding(true); setOpen(false); }}><span className="nwKind new">+</span><span><b>Adaugă colaborator nou</b><small>{q.trim() ? `„${q.trim()}”` : "agent, broker, firmă parteneră"}</small></span></button>}
            </div>
          )}
        </div>
      )}
      {adding && <AddReferral initialName={q.trim()} onClose={() => setAdding(false)} onAdded={(r) => { onChange(r); setAdding(false); setQ(""); }} />}
    </div>
  );
}

/** A new collaborator (entity of kind "broker"): name, phone, email, CUI. */
function AddReferral({ initialName, onClose, onAdded }: { initialName: string; onClose: () => void; onAdded: (r: Referral) => void }) {
  const [f, setF] = useState({ name: initialName, phone: "", email: "", cui: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return setMsg("Scrie numele colaboratorului.");
    if (f.phone.replace(/\D/g, "").length < 9 || !f.email.trim()) return setMsg("Completează telefonul și emailul colaboratorului.");
    setBusy(true); setMsg("");
    const r = await fetch("/api/crm/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "broker", name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), cui: f.cui.trim(), force: true }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { id?: string; error?: string };
    setBusy(false);
    if (!r?.ok || !d.id) return setMsg(d.error ?? "Nu am putut adăuga colaboratorul.");
    onAdded({ id: d.id, name: f.name.trim(), phone: f.phone.trim() || null, email: f.email.trim() || null });
  };
  return createPortal(
    <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="refT" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="vfModalBox" style={{ maxWidth: 460 }} onSubmit={save} noValidate>
        <h2 id="refT">Colaborator nou</h2>
        <p className="hint" style={{ margin: 0 }}>Se adaugă în Clienți / Entități ca „Colaborator / broker” și poate fi ales la orice ofertă sau comandă.</p>
        <label className="field">Nume / firmă<input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></label>
        <div className="formRow">
          <label className="field">Telefon<input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          <label className="field">Email<input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        </div>
        <label className="field">CUI <small>(opțional)</small><input className="input mono" value={f.cui} onChange={(e) => setF({ ...f, cui: e.target.value })} /></label>
        {msg && <div role="alert" className="error">{msg}</div>}
        <div className="actions"><button type="submit" className="btn btnGold" disabled={busy}>{busy ? "Se salvează…" : "Adaugă"}</button><button type="button" className="btn btnGhost" onClick={onClose}>Renunță</button></div>
      </form>
    </div>, document.body);
}
