"use client";
// The month's adjustment of a fixed cost, in the table: a value with + or − and its explanation; saved for this month only.
import { useState } from "react";

export function CostAdjust({ id, period, adjust, note }: { id: string; period: string; adjust: number; note: string | null }) {
  const [v, setV] = useState(adjust ? `${adjust > 0 ? "+" : ""}${adjust}` : "");
  const [n, setN] = useState(note ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const dirty = v !== (adjust ? `${adjust > 0 ? "+" : ""}${adjust}` : "") || n !== (note ?? "");
  const save = async () => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/crm/statements/costs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, period, amount: v.replace("+", ""), note: n }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setMsg(d.error ?? "Nu s-a salvat.");
    location.reload();
  };
  return (
    <>
      <td style={{ textAlign: "right" }}>
        <input className="input fcAdj" inputMode="decimal" value={v} placeholder="+0" aria-label="Ajustare (+ / −)" onChange={(e) => setV(e.target.value.replace(/[^\d+\-.,]/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter" && dirty) save(); }} />
      </td>
      <td>
        <span className="fcAdjNote">
          <input className="input" value={n} placeholder={v && v !== "0" ? "explicația (obligatorie)" : "explicație"} aria-label="Explicația ajustării" onChange={(e) => setN(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && dirty) save(); }} aria-invalid={(!!v && v !== "0" && !n.trim()) || undefined} />
          {dirty && <button type="button" className="btn btnNavy btnSm" disabled={busy} onClick={save}>{busy ? "…" : "Salvează"}</button>}
        </span>
        {msg && <small className="errTxt">{msg}</small>}
      </td>
    </>
  );
}
