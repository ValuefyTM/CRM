"use client";
// The fee of a report to invoice, corrected from the "De facturat" list (wrong in the grid, negotiated, left for later).
import { useState } from "react";
import { createPortal } from "react-dom";

export function FeeEdit({ report, fee, number }: { report: string; fee: number | null; number: string | null }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(fee != null ? String(fee) : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    const r = await fetch("/api/crm/billing/fee", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report, fee: v }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setMsg(d?.error || "Nu s-a putut salva.");
    location.reload();
  };
  return (
    <>
      <button type="button" className="linkBtn" title="Modifică onorariul" onClick={(e) => { e.stopPropagation(); setV(fee != null ? String(fee) : ""); setMsg(""); setOpen(true); }}>{fee ? "modifică" : "completează"}</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="feeEditT" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setOpen(false); }} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
          <form className="vfModalBox" style={{ width: "min(420px, 100%)" }} onSubmit={save} noValidate onClick={(e) => e.stopPropagation()}>
            <h2 id="feeEditT">Onorariul raportului{number ? ` nr. ${number}` : ""}</h2>
            <p className="hint" style={{ margin: 0 }}>Onorariul fără TVA care se facturează. Se schimbă pe raport și pe comanda lui.</p>
            <label className="field"><span className="fLabel">Onorariu fără TVA</span>
              <span className="nwSuffix"><input className="input" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus /><em>lei</em></span></label>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="submit" className="btn btnGold" disabled={busy}>{busy ? "Se salvează…" : "Salvează"}</button>
              <button type="button" className="btn btnGhost" disabled={busy} onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </form>
        </div>, document.body)}
    </>
  );
}
