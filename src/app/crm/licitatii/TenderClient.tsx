"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TenderRules } from "@/lib/tenders";

const STATUS: [string, string][] = [["analyze", "De analizat"], ["bid", "Participăm"], ["skip", "Nu ne interesează"]];

/** Status buttons of one notice. */
export function TenderStatus({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const set = async (s: string) => {
    setBusy(true);
    await fetch(`/api/crm/tenders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) }).catch(() => null);
    setBusy(false); router.refresh();
  };
  return (
    <span className="tdActs" role="group" aria-label="Status">
      {STATUS.map(([k, l]) => <button key={k} type="button" className={`btn btnSm ${status === k ? "btnNavy" : "btnGhost"}`} aria-pressed={status === k} disabled={busy} onClick={() => set(status === k ? "new" : k)}>{l}</button>)}
    </span>
  );
}

/** "Verifică acum" (admins): reads SEAP for the last days. */
export function RunNow() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/crm/tenders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: 7 }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { fetched?: number; matched?: number; added?: number; error?: string };
    setBusy(false);
    setMsg(r?.ok ? { ok: true, text: `Am citit ${d.fetched ?? 0} anunțuri din ultimele 7 zile: ${d.matched ?? 0} se potrivesc, ${d.added ?? 0} noi.` } : { ok: false, text: d?.error ?? "SEAP nu a răspuns. Încearcă mai târziu." });
    router.refresh();
  };
  return (
    <>
      <button type="button" className="btn btnGold btnSm" onClick={run} disabled={busy}>{busy ? "Se citește SEAP…" : "Verifică acum"}</button>
      {msg && <div role="status" className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
    </>
  );
}

/** The criteria of the SEAP alerts. */
export function RulesForm({ initial, edit }: { initial: TenderRules; edit: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ ...initial, cpvT: initial.cpv.join(", "), kwT: initial.keywords.join(", "), coT: initial.counties.join(", "), emT: initial.emails.join(", ") });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/crm/tenders/rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      enabled: f.enabled, cpv: f.cpvT, keywords: f.kwT, counties: f.coT, emails: f.emT, minValue: f.minValue, direct: f.direct,
    }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    setMsg(r?.ok ? { ok: true, text: "Criteriile au fost salvate." } : { ok: false, text: d?.error ?? "Nu s-a putut salva." });
    router.refresh();
  };
  return (
    <fieldset disabled={!edit} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <label className="check"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />Verificare zilnică pornită (dimineața)</label>
      <label className="field">Coduri CPV <small>(începutul codului, separate prin virgulă: 79419 = consultanță în evaluare, 71319 = expertiză)</small>
        <input className="input" value={f.cpvT} onChange={(e) => setF({ ...f, cpvT: e.target.value })} /></label>
      <label className="field">Cuvinte cheie în titlu <small>(oricare dintre ele)</small>
        <input className="input" value={f.kwT} onChange={(e) => setF({ ...f, kwT: e.target.value })} /></label>
      <label className="field">Județele autorității <small>(gol = toată țara)</small>
        <input className="input" value={f.coT} onChange={(e) => setF({ ...f, coT: e.target.value })} /></label>
      <label className="field">Valoare estimată minimă (lei, fără TVA) <small>(opțional)</small>
        <input className="input" inputMode="numeric" value={f.minValue ?? ""} onChange={(e) => setF({ ...f, minValue: Number(e.target.value.replace(/\D/g, "")) || null })} /></label>
      <label className="check"><input type="checkbox" checked={f.direct} onChange={(e) => setF({ ...f, direct: e.target.checked })} />Și achizițiile directe (deja atribuite: cine cumpără evaluări și la ce preț)</label>
      <label className="field">Trimite alertele pe email la <small>(separate prin virgulă)</small>
        <input className="input" value={f.emT} onChange={(e) => setF({ ...f, emT: e.target.value })} placeholder="office@valuefy.ro" /></label>
      {edit && <button type="button" className="btn btnNavy btnSm" style={{ alignSelf: "flex-start" }} onClick={save} disabled={busy}>{busy ? "Se salvează…" : "Salvează criteriile"}</button>}
      {msg && <div role="status" className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
    </fieldset>
  );
}
