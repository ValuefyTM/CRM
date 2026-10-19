"use client";
// Freezing the reported year: the declared set is kept, and the reports finished afterwards go to the next year.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";

const lei = (v: number) => `${Math.round(v).toLocaleString("ro-RO")} lei`;

export function FreezeControls({ year, frozen, owner, n, fee }: { year: number; frozen: { at: string; by: string | null; note: string | null } | null; owner: boolean; n: number; fee: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const call = async (method: "POST" | "DELETE") => {
    setBusy(true); setErr("");
    const r = await fetch(method === "POST" ? "/api/crm/anevar/freeze" : `/api/crm/anevar/freeze?year=${year}`, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify({ year, note: note.trim() || null }) : undefined }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setErr(d.error ?? "Nu a mers.");
    setOpen(false); router.refresh();
  };
  if (frozen) {
    return owner ? <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => { if (confirm(`Deblochezi anul ${year}? Situația redevine vie, iar rapoartele finalizate după înghețare revin în ${year}.`)) call("DELETE"); }}>🔓 Deblochează {year}</button> : null;
  }
  return (
    <>
      <button type="button" className="btn btnGold btnSm" onClick={() => setOpen(true)}>🔒 Îngheață anul {year}</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="frzT" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="vfModalBox" style={{ maxWidth: 480 }} onSubmit={(e) => { e.preventDefault(); call("POST"); }}>
            <h2 id="frzT">Îngheață raportarea pe {year}</h2>
            <p className="hint" style={{ margin: 0 }}>Se declară la ANEVAR <b>{n.toLocaleString("ro-RO")} rapoarte</b> cu o cifră de afaceri de <b>{lei(fee)}</b>, așa cum sunt acum (fără cele excluse). Rapoartele din {year} finalizate după acest moment vor intra în raportarea pe {year + 1}. Proprietarul poate debloca anul oricând.</p>
            <label className="field">Notă <small>(opțional: când ai trimis raportul, nr. de înregistrare)</small><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></label>
            {err && <div role="alert" className="error">{err}</div>}
            <div className="actions"><button type="submit" className="btn btnGold" disabled={busy}>{busy ? "Se îngheață…" : `Îngheață ${year}`}</button><button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button></div>
          </form>
        </div>, document.body)}
    </>
  );
}
