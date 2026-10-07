"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

type F = { number: string; signed_on: string; fee: string; report_type: string; purpose: string; notes: string };

/** Edits the details of a contract (number, date, fee, report type, purpose, notes). */
export function ContractEdit({ id, kind, initial, purposes, reportKinds }: { id: string; kind: string; initial: F; purposes: string[]; reportKinds: string[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/contracts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (!r?.ok) { setMsg(d?.error || "Nu am putut salva."); return; }
    location.reload();
  };
  return (
    <>
      <button type="button" className="btn btnGhost btnSm" onClick={() => { setF(initial); setMsg(""); setOpen(true); }}>Modifică</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="ctEditTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="vfModalBox" style={{ width: "min(640px, 100%)" }} onSubmit={save} noValidate>
            <h2 id="ctEditTitle">Modifică contractul {kind === "framework" ? "cadru" : "clasic"}</h2>
            <div className="formRow">
              <label className="field">Număr<input className="input mono" value={f.number} onChange={set("number")} /></label>
              <label className="field">Data semnării<input className="input" type="date" value={f.signed_on} onChange={set("signed_on")} /></label>
              <label className="field">{kind === "framework" ? "Tarif standard" : "Onorariu"} fără TVA (lei)<input className="input" inputMode="decimal" value={f.fee} onChange={set("fee")} /></label>
            </div>
            <div className="formRow">
              <label className="field">Tip raport
                <select className="select" value={f.report_type} onChange={set("report_type")}>
                  <option value="">—</option>
                  {[...new Set([...reportKinds, f.report_type].filter(Boolean))].map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
              <label className="field">Scop
                <select className="select" value={f.purpose} onChange={set("purpose")}>
                  <option value="">—</option>
                  {[...new Set([...purposes, f.purpose].filter(Boolean))].map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
            </div>
            <label className="field">Note <small>(opțional)</small><textarea className="textarea" rows={3} value={f.notes} onChange={set("notes")} /></label>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="submit" className="btn btnGold" disabled={busy}>{busy ? "Se salvează…" : "Salvează"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </form>
        </div>, document.body)}
    </>
  );
}
