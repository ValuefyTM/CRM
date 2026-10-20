"use client";
// Fixed monthly costs: label, amount, from which month, until which month (optional).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { FixedCost } from "@/lib/statement-labels";

type Form = { id: string; label: string; amount: string; from_period: string; to_period: string; notes: string };
const lei = (n: number) => `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`;
const month = (p: string | null) => { if (!p) return "—"; const [y, m] = p.split("-").map(Number); return `${["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"][m - 1]} ${y}`; };

export function CostsEditor({ canEdit, canDelete, thisMonth }: { canEdit: boolean; canDelete: boolean; thisMonth: string }) {
  const [costs, setCosts] = useState<FixedCost[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/crm/statements/costs").then((r) => r.json() as Promise<{ costs: FixedCost[] }>).then((d) => setCosts(d.costs ?? [])).catch(() => setCosts([]));
  useEffect(() => { load(); }, []);
  const set = (k: keyof Form, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const save = async () => {
    if (!form) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/crm/statements/costs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setMsg(d.error ?? "Nu s-a salvat.");
    setForm(null); load();
  };
  const del = async (c: FixedCost) => {
    if (!confirm(`Ștergi „${c.label}”? Dacă s-a încheiat, mai bine pune-i luna de sfârșit, ca lunile trecute să rămână corecte.`)) return;
    const r = await fetch(`/api/crm/statements/costs?id=${c.id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) return setMsg("Nu s-a șters.");
    load();
  };
  if (!costs) return <p className="hint pad">Se încarcă…</p>;
  const running = costs.filter((c) => c.from_period <= thisMonth && (!c.to_period || c.to_period >= thisMonth));
  return (
    <>
      <div className="actions" style={{ marginBottom: 4 }}>
        {canEdit && <button type="button" className="btn btnNavy btnSm" onClick={() => { setForm({ id: "", label: "", amount: "", from_period: thisMonth, to_period: "", notes: "" }); setMsg(""); }}>+ Cheltuială fixă</button>}
        <span className="muted">Luna curentă: <b>{lei(running.reduce((s, c) => s + c.amount, 0))}</b> din {running.length} {running.length === 1 ? "cheltuială" : "cheltuieli"}</span>
        {msg && !form && <span className="errTxt">{msg}</span>}
      </div>
      <section className="card flush">
        <div className="cardHead"><h2>Cheltuieli fixe lunare</h2><span className="muted">se scad din venituri la profitul lunii</span></div>
        {costs.length === 0 ? <p className="hint pad">Nicio cheltuială încă: chirie, salarii, abonamente, contabilitate…</p> : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Cheltuială</th><th>De la</th><th>Până în</th><th style={{ textAlign: "right" }}>Lunar</th>{canEdit && <th />}</tr></thead>
              <tbody>
                {costs.map((c) => {
                  const on = c.from_period <= thisMonth && (!c.to_period || c.to_period >= thisMonth);
                  return (
                    <tr key={c.id} style={on ? undefined : { opacity: 0.6 }}>
                      <td><b>{c.label}</b>{c.notes && <div className="muted">{c.notes}</div>}</td>
                      <td>{month(c.from_period)}</td>
                      <td>{c.to_period ? month(c.to_period) : <span className="muted">în curs</span>}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }} className="mono"><b>{lei(c.amount)}</b></td>
                      {canEdit && <td><span className="actions" style={{ flexWrap: "nowrap" }}>
                        <button type="button" className="linkBtn" onClick={() => { setForm({ id: c.id, label: c.label, amount: String(c.amount), from_period: c.from_period, to_period: c.to_period ?? "", notes: c.notes ?? "" }); setMsg(""); }}>modifică</button>
                        {canDelete && <button type="button" className="linkBtn danger" onClick={() => del(c)}>șterge</button>}
                      </span></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {form && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="fcT" onClick={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
          <div className="vfModalBox">
            <div className="cardHead"><h2 id="fcT">{form.id ? "Cheltuială fixă" : "Cheltuială fixă nouă"}</h2><button type="button" className="btn btnGhost btnSm" onClick={() => setForm(null)} aria-label="Închide">×</button></div>
            <label className="field">Ce cheltuială<input className="input" value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="de ex. Chirie birou, Salarii, Contabilitate" autoFocus /></label>
            <label className="field">Suma lunară (lei)<input className="input" inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></label>
            <div className="frGrid">
              <label className="field">De la luna<input className="input" type="month" value={form.from_period} onChange={(e) => set("from_period", e.target.value)} /></label>
              <label className="field">Până în luna <small>(gol = în curs)</small><input className="input" type="month" value={form.to_period} onChange={(e) => set("to_period", e.target.value)} /></label>
            </div>
            <label className="field">Observații <small>(opțional)</small><input className="input" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></label>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="button" className="btn btnNavy" disabled={busy || !form.label.trim() || !form.amount.trim()} onClick={save}>{busy ? "Se salvează…" : "Salvează"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setForm(null)}>Renunță</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
