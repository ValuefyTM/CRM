"use client";
// Deleting a partner firm: its people (and orders) move first to another firm, chosen here.
import { useState } from "react";
import { createPortal } from "react-dom";

export function DeleteFirm({ id, name, people, firms, base }: { id: string; name: string; people: number; firms: { id: string; name: string }[]; base: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const go = async () => {
    if (people && !to) return setMsg("Alege firma în care muți persoanele.");
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/partners/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ move_to: to || null }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setMsg(d.error ?? "Nu am putut șterge firma.");
    location.href = to ? `${base}/utilizatori/firme/${to}` : `${base}/utilizatori?tab=colaboratori&vezi=firme`;
  };
  return (
    <>
      <button type="button" className="btn btnGhost btnSm danger" onClick={() => setOpen(true)}>Șterge firma</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="dfT" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox" style={{ maxWidth: 480 }}>
            <h2 id="dfT">Șterge firma {name}</h2>
            {people > 0 ? (
              <>
                <p className="hint" style={{ margin: 0 }}>Firma are <b>{people} {people === 1 ? "persoană" : "persoane"}</b> cu cont. Le muți întâi într-o altă firmă, împreună cu comenzile firmei; conturile, parolele și istoricul lor rămân.</p>
                <label className="field">Mută persoanele la
                  <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
                    <option value="">Alege firma…</option>
                    {firms.filter((f) => f.id !== id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </label>
                {firms.filter((f) => f.id !== id).length === 0 && <p className="hint" style={{ margin: 0 }}>Nu există altă firmă. <a className="rowLink" href={`${base}/utilizatori/firme/nou`}>Adaug-o întâi →</a></p>}
              </>
            ) : <p className="hint" style={{ margin: 0 }}>Firma nu are persoane cu cont. Se șterge definitiv; comenzile ei vechi rămân, fără firmă.</p>}
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="button" className="btn btnDanger" disabled={busy} onClick={go}>{busy ? "Se șterge…" : people ? "Mută persoanele și șterge firma" : "Șterge firma"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
