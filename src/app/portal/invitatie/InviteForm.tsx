"use client";

import { useState } from "react";

export function InviteForm({ token, base, name: initialName }: { token: string; base: string; name: string }) {
  const [f, setF] = useState({ name: initialName, phone: "", terms: false });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.name.trim().length < 3) return setMsg("Completează numele și prenumele.");
    if (f.phone.replace(/\D/g, "").length < 9) return setMsg("Numărul de telefon pare incomplet.");
    if (!f.terms) return setMsg("Este necesar acordul cu termenii de colaborare.");
    setBusy(true); setMsg("");
    const r = await fetch("/api/portal/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...f }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) { setBusy(false); return setMsg(d.error || "Nu am putut activa contul."); }
    location.href = base || "/";
  };
  return (
    <form onSubmit={submit} className="authBox" style={{ animation: "none" }} noValidate>
      <label className="field">Nume și prenume<input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
      <label className="field">Telefon<input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" placeholder="07xx xxx xxx" /></label>
      <label className="check">
        <input type="checkbox" checked={f.terms} onChange={(e) => setF({ ...f, terms: e.target.checked })} />
        <span>Sunt de acord cu <a href="https://valuefy.ro/termeni-si-conditii" target="_blank" rel="noopener" style={{ color: "var(--acc-text)", fontWeight: 700 }}>termenii</a> și cu <a href="https://valuefy.ro/politica-de-confidentialitate" target="_blank" rel="noopener" style={{ color: "var(--acc-text)", fontWeight: 700 }}>politica de confidențialitate</a> VALUEFY și confirm că am acordul clienților mei pentru datele pe care le transmit.</span>
      </label>
      {msg && <div role="alert" className="error">{msg}</div>}
      <button type="submit" className="btn btnGold" style={{ height: 52 }} disabled={busy}>{busy ? "Se activează…" : "Activează contul →"}</button>
    </form>
  );
}
