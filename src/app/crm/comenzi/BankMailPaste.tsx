"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

/** "Adaugă din email": paste a BCR / BRD notice; the bank order is created as if it came to the intake address. */
export function BankMailPaste({ base }: { base: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    const r = await fetch("/api/crm/bank-emails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string; order?: string; status?: string } | undefined;
    setBusy(false);
    if (!r?.ok || !d?.order) return setMsg(d?.error || "Nu am putut adăuga comanda.");
    if (d.status === "duplicate") alert("Comanda există deja. Te duc la ea.");
    location.href = `${base}/comenzi/${d.order}`;
  };
  return (
    <>
      <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(true)}>Adaugă din email</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="pasteTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="vfModalBox" onSubmit={submit}>
            <h2 id="pasteTitle">Comandă bancă din email</h2>
            <p className="hint">Copiază emailul primit de la bancă (subiectul și textul) și lipește-l aici. Recunosc notificările BCR și BRD: numărul cererii și numele clientului.</p>
            <textarea className="textarea" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Cerere nouă primită în aplicatia de Valuator: EV2610070000000045\nNumele clientului: …\nCodul cererii: Prima evaluare"} autoFocus />
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="submit" className="btn btnNavy" disabled={busy || text.trim().length < 20}>{busy ? "Se adaugă…" : "Adaugă comanda"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
