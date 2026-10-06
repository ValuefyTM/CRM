"use client";

import { useState } from "react";

/** Top of the offer preview in the CRM: back to editing, or send exactly this offer to the client. */
export function PreviewBar({ orderId, back, email, state }: { orderId: string; back: string; email: string | null; state: "draft" | "sent" | "accepted" | "declined" }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const send = async () => {
    if (!confirm(`Trimiți oferta pe ${email}?`)) return;
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/orders/${orderId}/offer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send" }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string; emailed?: boolean } | undefined;
    setBusy(false);
    if (!r?.ok) return setMsg(d?.error || "Nu am putut trimite oferta.");
    if (d?.emailed === false) alert("Oferta este marcată ca trimisă, dar emailul nu a plecat. Copiază linkul din pagina comenzii și trimite-l manual.");
    location.href = back;
  };
  const canSend = state === "draft" || state === "sent";
  return (
    <div className="ofPreviewBar no-print">
      <div>
        <b>Previzualizare</b>
        <span>{canSend ? `Așa va vedea clientul oferta. Verific-o, apoi trimite-o pe ${email ?? "—"}.` : "Așa vede clientul oferta."}</span>
        {msg && <span role="alert" className="ofError">{msg}</span>}
      </div>
      <div className="ofRow">
        <a className="ofBtnGhost" href={back}>{canSend ? "← Modifică oferta" : "← Înapoi la comandă"}</a>
        {canSend && (email
          ? <button type="button" className="ofBtnGold flat" onClick={send} disabled={busy}>{busy ? "Se trimite…" : state === "sent" ? "Retrimite clientului →" : "Trimite clientului →"}</button>
          : <span className="ofMuted">Completează emailul clientului în ofertă ca s-o poți trimite.</span>)}
      </div>
    </div>
  );
}
