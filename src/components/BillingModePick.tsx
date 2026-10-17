"use client";
// The billing mode of a framework contract or a collaboration: picked in a form, or saved right away.
import { useState } from "react";
import { BILLING_PICK, billingLabel, type Mode } from "@/lib/billing-modes";

export function BillingModePick({ value, onChange, disabled, invalid }: { value: string; onChange: (m: Mode) => void; disabled?: boolean; invalid?: boolean }) {
  return (
    <div className={`bmPick${invalid ? " invalid" : ""}`} role="radiogroup" aria-label="Modul de facturare">
      {BILLING_PICK.map(([k, l, s]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} disabled={disabled} className={k === "none" ? "bmMinor" : ""} onClick={() => onChange(k)}>
          <b>{l}</b><small>{s}</small>
        </button>
      ))}
    </div>
  );
}

/** The billing mode saved right away (framework contract page, collaboration card). */
export function BillingModeEdit({ target, id, value, fallback, edit }: { target: "contract" | "collab"; id: string; value: string | null; fallback: string | null; edit: boolean }) {
  const [v, setV] = useState(value ?? "");
  const [msg, setMsg] = useState("");
  if (!edit) return <span>{billingLabel(v) ?? <span className="muted">nesetat{fallback ? ` · implicit „${billingLabel(fallback)}”` : ""}</span>}</span>;
  const save = async (m: Mode) => {
    const old = v;
    setV(m); setMsg("");
    const r = await fetch("/api/crm/contracts/billing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: target, id, mode: m }) }).catch(() => null);
    if (r?.ok) { setMsg("Salvat."); return; }
    const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setV(old); setMsg(d?.error ?? "Nu s-a putut salva.");
  };
  return (
    <div className="bmEdit">
      <BillingModePick value={v} onChange={save} />
      {!v && <small className="muted">Nesetat{fallback ? ` · se aplică implicitul din Setări → Facturare: „${billingLabel(fallback)}”` : ""}.</small>}
      {msg && <small className={msg === "Salvat." ? "okTxt" : "errTxt"} role="status">{msg}</small>}
    </div>
  );
}
