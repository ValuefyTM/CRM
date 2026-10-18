"use client";
// "Facturat din Oblio": the invoice was issued straight in Oblio, so the report's billing task closes here, with the
// invoice's number if the person has it at hand.
import { useState } from "react";
import { createPortal } from "react-dom";

export function BilledOutside({ report, label = "Facturat din Oblio" }: { report: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const go = async () => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/crm/billing/outside", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report, ref }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setMsg(d?.error || "Nu s-a putut salva.");
    location.reload();
  };
  return (
    <>
      <button type="button" className="btn btnGhost btnSm" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>{label}</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setOpen(false); }} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
          <div className="vfModalBox" style={{ width: "min(460px, 100%)" }}>
            <h2>Facturat direct din Oblio</h2>
            <p className="hint" style={{ margin: 0 }}>Raportul iese din lista „De facturat” fără să se emită o factură din CRM. Dacă ai la îndemână seria și numărul facturii din Oblio, notează-le aici, ca să se vadă pe raport.</p>
            <label className="field"><span className="fLabel">Factura (opțional)</span>
              <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ex. VFY 1234" maxLength={60} autoFocus /></label>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="button" className="btn btnGold" disabled={busy} onClick={go}>{busy ? "Se salvează…" : "Confirmă"}</button>
              <button type="button" className="btn btnGhost" disabled={busy} onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
