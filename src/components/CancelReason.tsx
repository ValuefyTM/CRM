"use client";
// Cancelling an order or an offer: the reason is required; cancelled, it can be reopened.
import { useState } from "react";
import { createPortal } from "react-dom";

export function CancelReason({ url, what, reopen, small = true }: {
  /** PATCH target: gets `{ status: "cancelled", reason }` or `{ status: "reopen" }` */
  url: string; what: string; reopen?: boolean; small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (body: object) => {
    setBusy(true); setMsg("");
    const r = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setMsg(d.error ?? "Nu s-a salvat.");
    location.reload();
  };
  const cls = `btn btnGhost${small ? " btnSm" : ""}`;
  if (reopen) return (
    <>
      <button type="button" className={cls} disabled={busy} onClick={() => { if (confirm(`Redeschizi ${what}?`)) send({ status: "reopen" }); }}>Redeschide</button>
      {msg && <span role="alert" className="errTxt">{msg}</span>}
    </>
  );
  return (
    <>
      <button type="button" className={`${cls} qtDel`} onClick={() => { setOpen(true); setWhy(""); setMsg(""); }}>Anulează</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="cnT" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox">
            <div className="cardHead"><h2 id="cnT">Anulează {what}</h2><button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)} aria-label="Închide">×</button></div>
            <label className="field">Motivul anulării
              <textarea className="textarea" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} autoFocus placeholder="de ex. clientul a renunțat, a ales alt evaluator, preț prea mare…" />
            </label>
            <p className="hint" style={{ margin: 0 }}>Nu se șterge nimic: rămâne în listă ca anulată, cu motivul, și nu mai apare în alerte. O poți redeschide oricând.</p>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="button" className="btn btnDanger" disabled={busy || !why.trim()} onClick={() => send({ status: "cancelled", reason: why })}>{busy ? "Se salvează…" : "Anulează"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
