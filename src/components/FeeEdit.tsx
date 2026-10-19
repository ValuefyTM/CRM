"use client";
// The fee of a report to invoice, corrected from the "De facturat" list (wrong in the grid, negotiated, left for later).
// It may be typed with or without VAT; the report and its order always keep the net fee.
import { useState } from "react";
import { createPortal } from "react-dom";

const numOf = (s: string) => { const n = parseFloat(s.replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
const lei = (n: number) => `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`;

export function FeeEdit({ report, fee, number, vatPercent = 21 }: { report: string; fee: number | null; number: string | null; vatPercent?: number }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(fee != null ? String(fee) : "");
  const [vat, setVat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const n = numOf(v);
  const net = n == null ? null : vat ? Math.round((n / (1 + vatPercent / 100)) * 100) / 100 : n;
  const gross = net == null ? null : Math.round(net * (1 + vatPercent / 100) * 100) / 100;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    const r = await fetch("/api/crm/billing/fee", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report, fee: v, vat }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setMsg(d?.error || "Nu s-a putut salva.");
    location.reload();
  };
  // Switching the toggle keeps the same amount: the typed figure is turned into the other form.
  const switchVat = (to: boolean) => {
    if (to === vat) return;
    if (n != null) setV(String(to ? Math.round(n * (1 + vatPercent / 100) * 100) / 100 : Math.round((n / (1 + vatPercent / 100)) * 100) / 100));
    setVat(to);
  };
  return (
    <>
      <button type="button" className="linkBtn" title="Modifică onorariul" onClick={(e) => { e.stopPropagation(); setV(fee != null ? String(fee) : ""); setVat(false); setMsg(""); setOpen(true); }}>{fee ? "modifică" : "completează"}</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="feeEditT" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setOpen(false); }} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
          <form className="vfModalBox" style={{ width: "min(440px, 100%)" }} onSubmit={save} noValidate onClick={(e) => e.stopPropagation()}>
            <h2 id="feeEditT">Onorariul raportului{number ? ` nr. ${number}` : ""}</h2>
            <p className="hint" style={{ margin: 0 }}>Poți scrie suma cu sau fără TVA. Pe raport și pe comanda lui se salvează onorariul fără TVA.</p>
            <div className="segment" role="group" aria-label="TVA" style={{ maxWidth: 320 }}>
              <button type="button" aria-pressed={!vat} onClick={() => switchVat(false)}>Fără TVA</button>
              <button type="button" aria-pressed={vat} onClick={() => switchVat(true)}>Cu TVA ({vatPercent}%)</button>
            </div>
            <label className="field"><span className="fLabel">Onorariu {vat ? "cu TVA" : "fără TVA"}</span>
              <span className="nwSuffix"><input className="input" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus /><em>lei</em></span>
              {net != null && <small className="muted">{vat ? <>Se salvează <b>{lei(net)}</b> fără TVA</> : <>Cu TVA: {lei(gross!)}</>}</small>}
            </label>
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
