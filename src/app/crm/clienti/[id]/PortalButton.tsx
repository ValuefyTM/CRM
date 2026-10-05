"use client";

import { useState } from "react";

/** Portal access for a person (or a company's own email). */
export function PortalButton({ clientId, label }: { clientId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <>
      <button type="button" className="btn btnGold btnSm" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={async () => {
        setBusy(true); setMsg("");
        const r = await fetch(`/api/crm/clients/${clientId}/portal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const d = (await r.json().catch(() => ({}))) as { error?: string; invited?: boolean };
        setBusy(false);
        if (!r.ok) return setMsg(d.error || "Nu am putut activa contul.");
        if (!d.invited) return setMsg("Contul a fost creat, dar emailul de invitație nu a putut fi trimis.");
        location.reload();
      }}>{busy ? "Se trimite…" : label}</button>
      {msg && <div role="alert" className="error">{msg}</div>}
    </>
  );
}
