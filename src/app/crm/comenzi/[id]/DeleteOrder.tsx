"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { OrderLinks } from "@/lib/orders";

/** Deletes the order after a confirmation; what was made from it (offers, contract, reports) is listed and goes too. */
export function DeleteOrder({ id, label, back, links }: { id: string; label: string; back: string; links: OrderLinks }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const linked = links.offers > 0 || links.reports.length > 0 || links.contracts.length > 0 || links.inspections > 0;
  const items = [
    links.offers > 0 && `${links.offers === 1 ? "oferta" : `${links.offers} oferte`}${links.accepted ? " (acceptată de client)" : ""}`,
    links.contracts.length > 0 && `contractul ${links.contracts.join(", ")}`,
    links.reports.length > 0 && `${links.reports.length === 1 ? "raportul" : "rapoartele"} ${links.reports.join(", ")}, cu bunurile, echipa și termenele lor`,
    links.inspections > 0 && `${links.inspections === 1 ? "inspecția" : `${links.inspections} inspecții`}, cu fișele și fotografiile`,
    links.documents > 0 && `${links.documents} ${links.documents === 1 ? "document încărcat" : "documente încărcate"}`,
  ].filter(Boolean) as string[];

  const del = async () => {
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/orders/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: linked }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (!r?.ok) return setMsg(d?.error || "Nu am putut șterge comanda.");
    location.href = back;
  };
  return (
    <>
      <button type="button" className="btn btnGhost btnSm btnDanger" onClick={() => { setMsg(""); setSure(false); setOpen(true); }}>Șterge comanda</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="delOrderTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox">
            <h2 id="delOrderTitle">Ștergi comanda {label}?</h2>
            {links.invoiced > 0 ? (
              <div className="note">Un raport al comenzii are factură emisă: comanda nu se poate șterge. Stornează întâi factura.</div>
            ) : linked ? (
              <>
                <div className="note">
                  <b>Împreună cu comanda se șterg definitiv:</b>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>{items.map((t) => <li key={t}>{t}</li>)}</ul>
                </div>
                <p className="hint">Clienții, proprietățile și contractele cadru rămân. Acțiunea nu se poate anula și rămâne în istoric.</p>
                <label className="check"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />Da, vreau să șterg comanda și tot ce e legat de ea</label>
              </>
            ) : (
              <p className="hint">Se șterg definitiv comanda{links.documents ? " și documentele încărcate" : ""}. Acțiunea nu se poate anula și rămâne în istoric.</p>
            )}
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              {!links.invoiced && <button type="button" className="btn btnDangerSolid" disabled={busy || (linked && !sure)} onClick={del}>{busy ? "Se șterge…" : linked ? "Șterge tot" : "Da, șterge comanda"}</button>}
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>{links.invoiced ? "Închide" : "Renunță"}</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
