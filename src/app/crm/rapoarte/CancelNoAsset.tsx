"use client";
import { useState } from "react";

/** Cancels every open report without an asset (shown on the "Fără bun" filter). */
export function CancelNoAsset({ count }: { count: number }) {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    const r = await fetch("/api/crm/reports/fara-bun", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string; cancelled?: number };
    setBusy(false);
    if (!r.ok) return setMsg(d.error ?? "Nu am putut anula rapoartele.");
    location.href = location.pathname + "?status=cancelled&bunuri=fara";
  };
  return (
    <div className="note" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ flex: "1 1 260px" }}><b>{count}</b> {count === 1 ? "raport deschis fără niciun bun" : "rapoarte deschise fără niciun bun"}. Le poți trece pe toate la „Anulat” dintr-o dată; cele finalizate sau deja anulate nu sunt atinse.</span>
      <label className="check"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> Da, anulează-le</label>
      <button type="button" className="btn btnSm" disabled={!sure || busy} onClick={run}>{busy ? "Se anulează…" : `Anulează ${count}`}</button>
      {msg && <span className="error">{msg}</span>}
    </div>
  );
}
