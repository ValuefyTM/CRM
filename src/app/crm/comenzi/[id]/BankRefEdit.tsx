"use client";
// The bank's order number and the order date, on a bank order: shown, and corrected in place by who may edit the order.
import { useState } from "react";
import { useRouter } from "next/navigation";

const ro = (d: string) => (d ? d.split("-").reverse().join(".") : "—");

export function BankRefEdit({ order, bankRef, orderedOn, canEdit }: { order: string; bankRef: string | null; orderedOn: string; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [ref, setRef] = useState(bankRef ?? "");
  const [day, setDay] = useState(orderedOn);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(""); setBusy(true);
    const res = await fetch(`/api/crm/orders/${order}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bank_ref: ref, ordered_on: day }) }).catch(() => null);
    const d = (await res?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res?.ok) return setMsg(d.error ?? "Nu s-a salvat.");
    setEditing(false); router.refresh();
  };
  const today = new Date().toISOString().slice(0, 10);
  if (editing) return (
    <div style={{ gridColumn: "1 / -1" }}>
      <form onSubmit={save} className="bankRefEdit">
        <label className="field"><span className="fLabel">Nr. comandă bancă</span>
          <input className="input mono" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} required autoFocus /></label>
        <label className="field"><span className="fLabel">Data comenzii</span>
          <input className="input" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} required /></label>
        <span className="actions">
          <button className="btn" disabled={busy}>{busy ? "Se salvează…" : "Salvează"}</button>
          <button type="button" className="btn btnGhost" onClick={() => { setEditing(false); setRef(bankRef ?? ""); setDay(orderedOn); setMsg(""); }}>Renunță</button>
        </span>
      </form>
      {msg && <div role="alert" className="error">{msg}</div>}
    </div>
  );
  return (
    <>
      <div><dt>Nr. comandă bancă</dt><dd><span className="mono">{bankRef || "—"}</span>
        {canEdit && <button type="button" className="linkBtn" style={{ marginLeft: 8 }} onClick={() => setEditing(true)}>modifică</button>}</dd></div>
      <div><dt>Data comenzii</dt><dd>{ro(orderedOn)}</dd></div>
    </>
  );
}
