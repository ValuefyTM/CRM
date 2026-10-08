"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

/** Deletes the order after a confirmation (only orders not turned into work; the server checks). */
export function DeleteOrder({ id, label, back, blocked }: { id: string; label: string; back: string; blocked: string | null }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const del = async () => {
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/orders/${id}`, { method: "DELETE" }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (!r?.ok) return setMsg(d?.error || "Nu am putut șterge comanda.");
    location.href = back;
  };
  return (
    <>
      <button type="button" className="btn btnGhost btnSm btnDanger" onClick={() => { setMsg(""); setOpen(true); }}>Șterge comanda</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="delOrderTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox">
            <h2 id="delOrderTitle">Ștergi comanda {label}?</h2>
            {blocked ? <div className="note">{blocked}</div> : (
              <p className="hint">Se șterg definitiv comanda, documentele încărcate și ofertele ei (netrimise sau neacceptate). Acțiunea nu se poate anula și rămâne în istoric.</p>
            )}
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              {!blocked && <button type="button" className="btn btnDangerSolid" disabled={busy} onClick={del}>{busy ? "Se șterge…" : "Da, șterge comanda"}</button>}
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>{blocked ? "Închide" : "Renunță"}</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
