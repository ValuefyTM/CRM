"use client";
import { useState } from "react";
import { createPortal } from "react-dom";

/** "Închide contractul" on a framework contract (date of closing, optional reason), or "Redeschide" once closed. */
export function CloseContract({ id, closed, signedOn }: { id: string; closed: string | null; signedOn: string | null }) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const send = async (method: "POST" | "DELETE") => {
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/contracts/${id}/close`, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify({ closed_on: on, note }) : undefined }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setMsg(d?.error ?? "Nu am putut salva.");
    location.reload();
  };
  if (closed) return (
    <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => { if (confirm("Redeschizi contractul cadru? Va apărea din nou în listă și la „Lucrare nouă”.")) send("DELETE"); }}>Redeschide contractul</button>
  );
  return (
    <>
      <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(true)}>Închide contractul</button>
      {open && createPortal(
        <div className="vfModal sheet" role="dialog" aria-modal="true" aria-labelledby="ccTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox" style={{ maxWidth: 460 }}>
            <div className="cardHead"><h2 id="ccTitle">Închide contractul cadru</h2><button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)} aria-label="Închide">×</button></div>
            <p className="hint">Contractul rămâne cu rapoartele lui, dar nu mai apare în lista de contracte cadru și nu mai primește comenzi noi. Îl găsești la Contracte → Stare: „Contracte cadru închise” și îl poți redeschide oricând.</p>
            <label className="field">Data închiderii<input className="input" type="date" value={on} min={signedOn?.slice(0, 10) ?? undefined} onChange={(e) => setOn(e.target.value)} /></label>
            <label className="field">Motiv <small>(opțional)</small><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. acord reziliat de bancă, înlocuit de contractul nr. …" /></label>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
              <button type="button" className="btn btnNavy" disabled={busy || !on} onClick={() => send("POST")}>{busy ? "Se închide…" : "Închide contractul"}</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
