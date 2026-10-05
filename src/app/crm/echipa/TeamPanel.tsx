"use client";

import { useState } from "react";

type Member = { id: string; name: string; email: string; role: string; status: string; lastLogin: string };
const ROLE: Record<string, string> = { owner: "Proprietar", admin: "Administrator", staff: "Echipă" };

export function TeamPanel({ members, meId, canManage }: { members: Member[]; meId: string; canManage: boolean }) {
  const [list, setList] = useState(members);
  const [f, setF] = useState({ name: "", email: "", role: "staff" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await fetch("/api/crm/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = (await r.json().catch(() => ({}))) as { error?: string; id?: string };
    setBusy(false);
    if (!r.ok || !d.id) return setMsg({ ok: false, text: d.error || "Nu am putut adăuga persoana." });
    setList((l) => [...l, { id: d.id!, name: f.name, email: f.email.trim().toLowerCase(), role: f.role, status: "active", lastLogin: "—" }]);
    setMsg({ ok: true, text: `${f.email} poate intra acum în CRM cu un cod primit pe email.` });
    setF({ name: "", email: "", role: "staff" });
  };

  const act = async (m: Member, body: object) => {
    const r = await fetch(`/api/crm/staff/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) return setMsg({ ok: false, text: d.error || "Acțiunea nu a reușit." });
    const b = body as { action: string; role?: string };
    setList((l) => l.map((x) => (x.id !== m.id ? x : b.action === "role" ? { ...x, role: b.role! } : { ...x, status: b.action === "disable" ? "disabled" : "active" })));
  };

  return (
    <>
      <section className="card">
        <h2>Echipa VALUEFY</h2>
        <ul className="people">
          {list.map((m) => (
            <li key={m.id}>
              <span className="avatar">{(m.name || m.email)[0].toUpperCase()}</span>
              <span className="who"><b>{m.name || m.email}{m.id === meId && <span className="muted"> (tu)</span>}</b><span className="muted">{m.email} · ultima autentificare: {m.lastLogin}</span></span>
              <span className={`pill ${m.status === "active" ? "pillOk" : "pillErr"}`}><i />{m.status === "active" ? ROLE[m.role] : "Dezactivat"}</span>
              {canManage && m.id !== meId && m.role !== "owner" && (
                <span className="actions" style={{ gap: 6 }}>
                  {m.status === "active" && <button type="button" className="btn btnGhost btnSm" onClick={() => act(m, { action: "role", role: m.role === "admin" ? "staff" : "admin" })}>{m.role === "admin" ? "Fă membru echipă" : "Fă administrator"}</button>}
                  {m.status === "active"
                    ? <button type="button" className="btn btnDanger btnSm" onClick={() => confirm(`Dezactivezi contul ${m.email}?`) && act(m, { action: "disable" })}>Dezactivează</button>
                    : <button type="button" className="btn btnGhost btnSm" onClick={() => act(m, { action: "enable" })}>Reactivează</button>}
                </span>
              )}
            </li>
          ))}
        </ul>
        {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
      </section>
      {canManage && (
        <form onSubmit={add} className="card" noValidate>
          <h2>Adaugă o persoană în echipă</h2>
          <p className="hint">Persoana intră în CRM cu adresa de email, pe baza unui cod primit pe email. Administratorii pot adăuga și dezactiva membri și pot suspenda colaboratori.</p>
          <div className="grid2">
            <label className="field">Nume și prenume<input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label className="field">Email *<input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="nume@valuefy.ro" /></label>
            <label className="field">Rol
              <select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                <option value="staff">Echipă</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
          </div>
          <div className="actions"><button type="submit" className="btn btnNavy" disabled={busy}>{busy ? "Se adaugă…" : "Adaugă în echipă"}</button></div>
        </form>
      )}
    </>
  );
}
