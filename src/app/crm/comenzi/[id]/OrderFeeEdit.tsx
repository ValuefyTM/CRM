"use client";
// The fee of a bank's (or a collaboration's) order, shown and corrected in place by who may edit the order: a different
// price was agreed, or only the inspection is paid after the order was cancelled. The report of the order follows.
import { useState } from "react";
import { useRouter } from "next/navigation";

const lei = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("ro-RO")} lei`);

export function OrderFeeEdit({ order, fee, canEdit, locked }: { order: string; fee: number | null; canEdit: boolean; /** why it cannot change (invoiced), shown instead of the link */ locked?: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(fee == null ? "" : String(fee));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(""); setBusy(true);
    const res = await fetch(`/api/crm/orders/${order}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fee: Number(v) }) }).catch(() => null);
    const d = (await res?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res?.ok) return setMsg(d.error ?? "Nu s-a salvat.");
    setEditing(false); router.refresh();
  };
  if (editing) return (
    <div style={{ gridColumn: "1 / -1" }}>
      <form onSubmit={save} className="bankRefEdit">
        <label className="field"><span className="fLabel">Tarif <small>(lei, fără TVA)</small></span>
          <input className="input" type="number" min={0} step={10} value={v} onChange={(e) => setV(e.target.value)} required autoFocus /></label>
        <span className="actions">
          <button className="btn" disabled={busy}>{busy ? "Se salvează…" : "Salvează"}</button>
          <button type="button" className="btn btnGhost" onClick={() => { setEditing(false); setV(fee == null ? "" : String(fee)); setMsg(""); }}>Renunță</button>
        </span>
      </form>
      <p className="hint">Se schimbă și onorariul raportului deschis din această comandă, cât timp nu a fost facturat.</p>
      {msg && <div role="alert" className="error">{msg}</div>}
    </div>
  );
  return (
    <div><dt>Tarif</dt><dd>{lei(fee)}
      {canEdit && !locked && <button type="button" className="linkBtn" style={{ marginLeft: 8 }} onClick={() => setEditing(true)}>modifică</button>}
      {canEdit && locked && <small className="muted" style={{ marginLeft: 8 }}>{locked}</small>}</dd></div>
  );
}
