"use client";

import { useState } from "react";

/** Status and internal notes of a website request. */
export function LeadControls({ id, status, notes, statuses }: { id: string; status: string; notes: string; statuses: [string, string][] }) {
  const [s, setS] = useState(status);
  const [n, setN] = useState(notes);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (body: object, ok: string) => {
    setMsg(null);
    const r = await fetch(`/api/crm/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: d.error || "Nu am putut salva." });
  };
  return (
    <section className="card">
      <h2>Urmărire</h2>
      <label className="field">Status
        <select className="select" value={s} onChange={(e) => { setS(e.target.value); save({ status: e.target.value }, "Statusul a fost salvat."); }}>
          {statuses.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className="field"><span>Notițe interne <small>(se văd și în panoul de admin al site-ului)</small></span>
        <textarea className="textarea" rows={5} value={n} onChange={(e) => setN(e.target.value)} placeholder="ex. sunat, revine mâine cu extrasul CF" />
      </label>
      <div className="actions"><button type="button" className="btn btnNavy btnSm" onClick={() => save({ admin_notes: n }, "Notițele au fost salvate.")}>Salvează notițele</button></div>
      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
    </section>
  );
}
