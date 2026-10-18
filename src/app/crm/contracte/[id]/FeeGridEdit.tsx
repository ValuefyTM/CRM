"use client";
// The fee grid of a framework contract: the bank's fee for an apartment, a house with land, free land — with or
// without VAT, as the bank lists them. Taken automatically on a new order, from the kind of the main asset.
import { useState } from "react";
import { createPortal } from "react-dom";
import { FEE_KINDS, type FeeGrid, type FeeKind } from "@/lib/fee-grid";

const lei = (n: number) => `${n.toLocaleString("ro-RO", { maximumFractionDigits: 2 })} lei`;

export function FeeGridCard({ id, grid, edit, vatPercent }: { id: string; grid: FeeGrid | null; edit: boolean; vatPercent: number }) {
  const [open, setOpen] = useState(false);
  const [vat, setVat] = useState(grid?.vat ?? false);
  const [rates, setRates] = useState<Record<FeeKind, string>>({ apartament: grid?.rates.apartament?.toString() ?? "", casa: grid?.rates.casa?.toString() ?? "", teren: grid?.rates.teren?.toString() ?? "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/contracts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fee_grid: { vat, rates } }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (!r?.ok) { setMsg(d?.error || "Nu am putut salva."); return; }
    location.reload();
  };
  const net = (n: number) => (vat ? n / (1 + vatPercent / 100) : n);
  return (
    <section className="card">
      <div className="cardHead"><h2>Grilă de tarife</h2>{edit && <button type="button" className="btn btnGhost btnSm" onClick={() => { setMsg(""); setOpen(true); }}>{grid ? "Modifică" : "Adaugă"}</button>}</div>
      {grid ? (
        <>
          <dl className="dl">
            {FEE_KINDS.map(([k, l]) => <div key={k}><dt>{l}</dt><dd>{grid.rates[k] != null ? <><b>{lei(grid.rates[k]!)}</b>{grid.vat && <span className="muted"> · {lei(Math.round(grid.rates[k]! / (1 + vatPercent / 100) * 100) / 100)} fără TVA</span>}</> : <span className="muted">fără tarif · se cere la comandă</span>}</dd></div>)}
          </dl>
          <p className="hint" style={{ margin: "8px 0 0" }}>Tarifele sunt <b>{grid.vat ? "cu TVA" : "fără TVA"}</b>. La o comandă nouă, tariful se preia după tipul bunului principal{grid.vat ? ` și se trece fără TVA (${vatPercent}%)` : ""}. Alte tipuri de bunuri (loc de parcare, spațiu comercial…) cer tariful la comandă.</p>
        </>
      ) : <p className="hint" style={{ margin: 0 }}>Contractul nu are grilă de tarife: la comenzi se cere tariful de fiecare dată{edit ? ", sau adaugi aici tarifele băncii pentru apartament, casă cu teren și teren liber" : ""}.</p>}
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="fgTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="vfModalBox" style={{ width: "min(520px, 100%)" }} onSubmit={save} noValidate>
            <h2 id="fgTitle">Grila de tarife a contractului</h2>
            <p className="hint" style={{ margin: 0 }}>Tariful pentru fiecare tip de bun principal. Lasă gol tipul fără tarif: la comandă se va cere tariful.</p>
            <div className="field">Tarifele sunt
              <div className="segment" role="group" aria-label="TVA" style={{ maxWidth: 320 }}>
                <button type="button" aria-pressed={!vat} onClick={() => setVat(false)}>Fără TVA</button>
                <button type="button" aria-pressed={vat} onClick={() => setVat(true)}>Cu TVA ({vatPercent}%)</button>
              </div>
            </div>
            {FEE_KINDS.map(([k, l, sub]) => {
              const n = parseFloat(rates[k].replace(",", "."));
              return (
                <label key={k} className="field"><span className="fLabel">{l}{sub && <small> · {sub}</small>}</span>
                  <span className="nwSuffix"><input className="input" inputMode="decimal" value={rates[k]} onChange={(e) => setRates({ ...rates, [k]: e.target.value })} placeholder="fără tarif" /><em>lei</em></span>
                  {vat && Number.isFinite(n) && n > 0 && <small className="muted">{lei(Math.round(net(n) * 100) / 100)} fără TVA</small>}
                </label>
              );
            })}
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="submit" className="btn btnGold" disabled={busy}>{busy ? "Se salvează…" : "Salvează"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </form>
        </div>, document.body)}
    </section>
  );
}
