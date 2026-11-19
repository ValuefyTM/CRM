"use client";

import { useState } from "react";
import { REMIND_CHOICES, type ExpertPrefs } from "@/lib/expert-labels";

const dayLabel = (d: number) => (d === 0 ? "în ziua termenului" : d === 1 ? "cu o zi înainte" : `cu ${d} zile înainte`);

/** When the expert is told about their terms and about the portal's news; saved for them alone. */
export function PrefsForm({ initial }: { initial: ExpertPrefs }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/crm/expertize/setari", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    setBusy(false);
    if (r?.ok) setF(await r.json());
    setMsg(r?.ok ? { ok: true, text: "Setările au fost salvate." } : { ok: false, text: "Nu s-au putut salva." });
  };
  const tick = (k: "overdue" | "portal" | "email" | "monitor_new", label: React.ReactNode) => (
    <label className="check"><input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} /><span>{label}</span></label>
  );
  return (
    <div className="xjForm" style={{ maxWidth: 760 }}>
      <section className="card">
        <h2>Alerte pentru termene</h2>
        <p className="hint">Când vrei să fii anunțat pentru fiecare termen deschis (de judecată, de depunere a raportului, de răspuns la obiecțiuni). Alerta vine dimineața, la ora 8.</p>
        <div className="mkDays">
          {REMIND_CHOICES.map((d) => (
            <label key={d} className={f.remind.includes(d) ? "on" : ""}><input type="checkbox" checked={f.remind.includes(d)}
              onChange={(e) => setF({ ...f, remind: e.target.checked ? [...f.remind, d].sort((a, b) => b - a) : f.remind.filter((x) => x !== d) })} />{dayLabel(d)}</label>
          ))}
        </div>
        {f.remind.length === 0 && <div className="note">Fără nicio zi aleasă nu primești alerte înaintea termenelor.</div>}
        {tick("overdue", "Anunță-mă și după ce un termen a trecut fără să fie marcat ca rezolvat")}
      </section>
      <section className="card">
        <h2>Portal.just.ro</h2>
        {tick("portal", <>Anunță-mă când apare ceva nou la un dosar monitorizat <small className="muted">· soluție la o ședință, termen nou, parte nouă; alerta rămâne până confirmi că ai verificat dosarul electronic</small></>)}
        {tick("monitor_new", "Dosarele noi sunt monitorizate pe portal, dacă nu debifez la adăugare")}
        <label className="field" style={{ maxWidth: 360 }}><span>Raportul se depune cu câte zile înainte de termen <small>(pentru limita de depunere calculată)</small></span>
          <input className="input" type="number" min={0} max={60} value={f.file_before} onChange={(e) => setF({ ...f, file_before: Number(e.target.value) })} /></label>
      </section>
      <section className="card">
        <h2>Unde primesc alertele</h2>
        <p className="hint">În clopoțelul din CRM și pe telefon (dacă notificările sunt pornite pe telefon) le primești întotdeauna.</p>
        {tick("email", "Trimite-mi alertele și pe e-mail")}
      </section>
      <span className="actions"><button type="button" className="btn btnGold" onClick={save} disabled={busy}>{busy ? "Se salvează…" : "Salvează"}</button></span>
      {msg && <div role="status" className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
      <p className="hint">Setările sunt ale tale și se aplică doar dosarelor tale. Nu apar în Setări › Alerte din CRM și nu le poate schimba altcineva.</p>
    </div>
  );
}
