"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { DELIVERABLES, VALUE_TYPES, type ContractTerms } from "@/lib/contract-terms";

type T = Required<Omit<ContractTerms, "print">> & { print: string };
type Str = Record<keyof T, string>;
const toForm = (t: T): Str => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, typeof v === "boolean" ? (v ? "1" : "0") : String(v ?? "")])) as Str;

/** Terms of reference (Annex 1) and payment terms (Annex 2) of the contract document. Prefilled; empty = default. */
export function ContractTermsEdit({ id, terms, defaults }: { id: string; terms: T; defaults: T }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(toForm(terms));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof T) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const d = toForm(defaults);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    // Only what differs from the default is kept: the rest follows the contract when it changes.
    const body = Object.fromEntries(Object.entries(f).filter(([k, v]) => v.trim() !== d[k as keyof T]).map(([k, v]) =>
      [k, k === "nop_inspection" ? v === "1" : k === "reports" || k === "term_days" ? Number(v) : v]));
    const r = await fetch(`/api/crm/contracts/${id}/terms`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setMsg(((await r?.json().catch(() => ({}))) as { error?: string })?.error || "Nu am putut salva."); return; }
    location.reload();
  };
  return (
    <>
      <button type="button" className="btn btnGhost btnSm" onClick={() => { setF(toForm(terms)); setMsg(""); setOpen(true); }}>Modifică termenii</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="ctTermsTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="vfModalBox" style={{ width: "min(780px, 100%)" }} onSubmit={save} noValidate>
            <h2 id="ctTermsTitle">Termeni de referință și plată</h2>
            <p className="hint">Sunt precompletați din contract, raport și oferta acceptată. Ce lași la valoarea propusă se actualizează singur dacă se schimbă contractul.</p>
            <div className="formRow">
              <label className="field">Livrabil
                <select className="select" value={f.deliverable} onChange={set("deliverable")}>{DELIVERABLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </label>
              {f.deliverable === "nop" && <label className="field">Notă de opinie
                <select className="select" value={f.nop_inspection} onChange={set("nop_inspection")}><option value="1">cu inspecție</option><option value="0">fără inspecție</option></select>
              </label>}
              <label className="field">Număr rapoarte<input className="input" inputMode="numeric" value={f.reports} onChange={set("reports")} /></label>
              <label className="field">Termen livrare (zile lucrătoare)<input className="input" inputMode="numeric" value={f.term_days} onChange={set("term_days")} /></label>
            </div>
            <div className="formRow">
              <label className="field">Tipul valorii
                <select className="select" value={f.value_type} onChange={set("value_type")}>{VALUE_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </label>
              <label className="field">Utilizatori desemnați<input className="input" value={f.users} onChange={set("users")} /></label>
            </div>
            <label className="field">Alte persoane cu acces la raport<input className="input" value={f.others} onChange={set("others")} /></label>
            <label className="field">Documente furnizate de client (sursa informațiilor)<textarea className="textarea" rows={3} value={f.sources} onChange={set("sources")} /></label>
            <label className="field">Limitări / restricții la inspecție și documentare<textarea className="textarea" rows={2} value={f.limitations} onChange={set("limitations")} /></label>
            <label className="field">Ipoteze speciale<textarea className="textarea" rows={2} value={f.special} onChange={set("special")} /></label>
            <div className="formRow">
              <label className="field">Prețul se plătește…<input className="input" value={f.payment_when} onChange={set("payment_when")} /></label>
              <label className="field">Tipărire și curierat <small>(opțional)</small><input className="input" value={f.print} onChange={set("print")} placeholder="ex. 2 exemplare, prin curier" /></label>
            </div>
            <label className="field">Tranșe de plată <small>(câte una pe rând)</small><textarea className="textarea" rows={2} value={f.tranches} onChange={set("tranches")} /></label>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="submit" className="btn btnGold" disabled={busy}>{busy ? "Se salvează…" : "Salvează"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setF(d)}>Revino la valorile propuse</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </form>
        </div>, document.body)}
    </>
  );
}
