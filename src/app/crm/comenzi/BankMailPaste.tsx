"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

/** "Adaugă din email": paste an email; it goes to Emailuri primite and through the rules, as if it came to the intake address. */
export function BankMailPaste({ base }: { base: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    const r = await fetch("/api/crm/bank-emails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string; order?: string; task?: string; email?: string; status?: string } | undefined;
    setBusy(false);
    if (!r?.ok || !d?.email) return setMsg(d?.error || "Nu am putut adăuga emailul.");
    // a processing task: straight to "Comandă nouă", filled in; the same request: its order or its task; else the email
    if (d.status === "duplicate") alert(d.order ? "Comanda există deja. Te duc la ea." : "Există deja un task pentru această cerere.");
    if (!d.order && !d.task) return setMsg(d.status === "ignored" ? "Emailul a fost păstrat; regula lui spune să fie ignorat." : "Nu am recunoscut emailul: nicio regulă nu se potrivește (regulile le setează proprietarul, în Setări → Emailuri primite).");
    location.href = d.order ? `${base}/comenzi/${d.order}` : `${base}/emailuri/task/${d.task}`;
  };
  return (
    <>
      <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(true)}>Adaugă din email</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="pasteTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="vfModalBox" onSubmit={submit}>
            <h2 id="pasteTitle">Comandă din email</h2>
            <p className="hint">Copiază emailul primit de la bancă (subiectul și textul) și lipește-l aici. Regulile din Emailuri primite îl recunosc (BCR, BRD…) și deschid task-ul de procesare, cu numărul cererii și clientul completate.</p>
            <textarea className="textarea" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Cerere nouă primită în aplicatia de Valuator: EV2610070000000045\nNumele clientului: …\nCodul cererii: Prima evaluare"} autoFocus />
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="submit" className="btn btnNavy" disabled={busy || text.trim().length < 20}>{busy ? "Se adaugă…" : "Adaugă"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
