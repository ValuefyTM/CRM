"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

/** Sends the contract to the client for online signing (email prefilled), or sends the link again; copies the link. */
export function SendSign({ id, email, again, link }: { id: string; email: string; again: boolean; link: string | null }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(email);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/contracts/${id}/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (!r?.ok) return setMsg(d?.error || "Nu am putut trimite.");
    location.reload();
  };
  return (
    <>
      <div className="actions">
        <button type="button" className={again ? "btn btnGhost btnSm" : "btn btnGold btnSm"} onClick={() => { setMsg(""); setOpen(true); }}>{again ? "Trimite din nou" : "Trimite la semnat"}</button>
        {link && <button type="button" className="btn btnGhost btnSm" onClick={async () => { await navigator.clipboard.writeText(link).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copiat ✓" : "Copiază linkul"}</button>}
      </div>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="sendSignTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="vfModalBox" onSubmit={send} noValidate>
            <h2 id="sendSignTitle">Trimite contractul la semnat</h2>
            <p className="hint">Clientul primește un link: completează datele de facturare care lipsesc, citește contractul și îl semnează online. Primești notificare când e semnat.</p>
            <label className="field">Email client<input className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} autoFocus /></label>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="submit" className="btn btnGold" disabled={busy}>{busy ? "Se trimite…" : "Trimite"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </form>
        </div>, document.body)}
    </>
  );
}
