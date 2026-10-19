"use client";
// The fee of a report to invoice, corrected from the "De facturat" list (wrong in the grid, negotiated, left for later).
// It may be typed with or without VAT; the report and its order always keep the net fee.
import { useState } from "react";
import { createPortal } from "react-dom";

const numOf = (s: string) => { const n = parseFloat(s.replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
const lei = (n: number) => `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} lei`;
const r2 = (n: number) => Math.round(n * 100) / 100, r4 = (n: number) => Math.round(n * 10000) / 10000;

/** `gross`: the fee with VAT when it was given so (grid "cu TVA", or typed with VAT): the form opens on it. */
export function FeeEdit({ report, fee, gross = null, number, vatPercent = 21 }: { report: string; fee: number | null; gross?: number | null; number: string | null; vatPercent?: number }) {
  const start = () => (gross != null ? String(gross) : fee != null ? String(fee) : "");
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(start());
  const [vat, setVat] = useState(gross != null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const n = numOf(v);
  // The net keeps 4 decimals; with VAT the amount typed is the invoice's total, exactly.
  const net = n == null ? null : vat ? r4(r2(n) / (1 + vatPercent / 100)) : r4(n);
  const withVat = net == null ? null : vat ? r2(n!) : r2(net * (1 + vatPercent / 100));
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
    if (n != null) setV(String(to ? r2(n * (1 + vatPercent / 100)) : r4(n / (1 + vatPercent / 100))));
    setVat(to);
  };
  return (
    <>
      <button type="button" className="linkBtn" title="Modifică onorariul" onClick={(e) => { e.stopPropagation(); setV(start()); setVat(gross != null); setMsg(""); setOpen(true); }}>{fee ? "modifică" : "completează"}</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="feeEditT" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setOpen(false); }} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
          <form className="vfModalBox" style={{ width: "min(440px, 100%)" }} onSubmit={save} noValidate onClick={(e) => e.stopPropagation()}>
            <h2 id="feeEditT">Onorariul raportului{number ? ` nr. ${number}` : ""}</h2>
            <p className="hint" style={{ margin: 0 }}>Poți scrie suma cu sau fără TVA (fără TVA, până la 4 zecimale). Pe raport și pe comandă se salvează onorariul fără TVA; scrisă cu TVA, factura din Oblio iese exact pe suma aceasta.</p>
            <div className="segment" role="group" aria-label="TVA" style={{ maxWidth: 320 }}>
              <button type="button" aria-pressed={!vat} onClick={() => switchVat(false)}>Fără TVA</button>
              <button type="button" aria-pressed={vat} onClick={() => switchVat(true)}>Cu TVA ({vatPercent}%)</button>
            </div>
            <label className="field"><span className="fLabel">Onorariu {vat ? "cu TVA" : "fără TVA"}</span>
              <span className="nwSuffix"><input className="input" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus /><em>lei</em></span>
              {net != null && <small className="muted">{vat ? <>Se salvează <b>{lei(net)}</b> fără TVA · factura: {lei(withVat!)} cu TVA</> : <>Cu TVA: {lei(withVat!)}</>}</small>}
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
