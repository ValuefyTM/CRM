"use client";

import { useState } from "react";

export function ProfileForm({ name, phone, email }: { name: string; phone: string; email: string }) {
  const [f, setF] = useState({ name, phone });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await fetch("/api/portal/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Datele au fost salvate." } : { ok: false, text: d.error || "Nu am putut salva." });
  };
  return (
    <form onSubmit={submit} className="card" noValidate>
      <h2>Datele mele</h2>
      <div className="grid2">
        <label className="field">Nume și prenume<input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field">Telefon<input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        <label className="field span2"><span>Email <small>(te autentifici cu el; pentru schimbare, scrie-ne)</small></span><input className="input" value={email} readOnly disabled /></label>
      </div>
      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
      <div className="actions"><button type="submit" className="btn btnNavy" disabled={busy}>{busy ? "Se salvează…" : "Salvează"}</button></div>
    </form>
  );
}
