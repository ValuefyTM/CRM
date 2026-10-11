"use client";

import { useState } from "react";

export function CopyUrl({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="actions" style={{ flexWrap: "nowrap" }}>
      <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 0, fontFamily: "ui-monospace, monospace" }} aria-label="Adresa conectorului" />
      <button type="button" className="btn btnNavy btnSm" onClick={async () => { await navigator.clipboard.writeText(url).catch(() => {}); setDone(true); setTimeout(() => setDone(false), 1800); }}>
        {done ? "Copiat" : "Copiază"}
      </button>
    </div>
  );
}

export function RevokeGrant({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="btn btnDanger btnSm" disabled={busy} onClick={async () => {
      if (!confirm("Oprești accesul acestei conexiuni? Claude va cere din nou aprobarea.")) return;
      setBusy(true);
      const r = await fetch(`/api/crm/mcp-grants/${id}`, { method: "DELETE" }).catch(() => null);
      if (r?.ok) location.reload(); else setBusy(false);
    }} title="Oprește accesul acestei conexiuni">Oprește</button>
  );
}
