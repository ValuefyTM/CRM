"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PartyIn = { role: string; name: string; address: string; lawyer: string };
const COURTS = ["Judecătoria Timișoara", "Tribunalul Timiș", "Curtea de Apel Timișoara", "Judecătoria Lugoj", "Judecătoria Deta", "Judecătoria Făget", "Judecătoria Sânnicolau Mare", "Tribunalul Arad", "Judecătoria Arad", "Tribunalul Caraș-Severin"];

/** A new case, from the appointment: the case, the parties, the objectives, the next hearing, the provisional fee. */
export function CaseForm({ base, roles, fileBefore }: { base: string; roles: string[]; fileBefore: number }) {
  const router = useRouter();
  const [f, setF] = useState({ number: "", court: "", section: "", panel: "", object: "", specialty: "Evaluarea proprietății imobiliare", appointed_on: "", property: "", objectives: "",
    next_hearing: "", next_time: "", with_filing: true, fee_prov: "", notes: "" });
  const [parties, setParties] = useState<PartyIn[]>([{ role: "Reclamant", name: "", address: "", lawyer: "" }, { role: "Pârât", name: "", address: "", lawyer: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; id?: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const setP = (i: number, k: keyof PartyIn, v: string) => setParties((p) => p.map((x, n) => (n === i ? { ...x, [k]: v } : x)));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await fetch("/api/crm/expertize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, parties }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { id?: string; error?: string };
    setBusy(false);
    if (!r?.ok || !d.id) { setError({ text: d?.error ?? "Nu am putut salva dosarul.", id: d?.id }); return; }
    router.push(`${base}/expertize/${d.id}`);
  };
  return (
    <form className="xjForm" onSubmit={save}>
      <section className="card">
        <h2>Dosarul</h2>
        <div className="grid2">
          <label className="field"><span>Număr dosar</span><input className="input mono" value={f.number} onChange={set("number")} placeholder="ex. 4127/325/2025" required autoFocus /></label>
          <label className="field"><span>Instanța</span><input className="input" value={f.court} onChange={set("court")} list="xj-courts" placeholder="ex. Judecătoria Timișoara" />
            <datalist id="xj-courts">{COURTS.map((c) => <option key={c} value={c} />)}</datalist></label>
          <label className="field"><span>Secția</span><input className="input" value={f.section} onChange={set("section")} placeholder="ex. Secția I civilă" /></label>
          <label className="field"><span>Completul</span><input className="input" value={f.panel} onChange={set("panel")} placeholder="ex. C12" /></label>
          <label className="field"><span>Obiectul dosarului</span><input className="input" value={f.object} onChange={set("object")} placeholder="ex. Partaj judiciar" /></label>
          <label className="field"><span>Specializarea expertizei</span><input className="input" value={f.specialty} onChange={set("specialty")} /></label>
          <label className="field"><span>Data încheierii de numire</span><input className="input" type="date" value={f.appointed_on} onChange={set("appointed_on")} /></label>
          <label className="field"><span>Onorariu provizoriu <small>(lei)</small></span><input className="input" type="number" min={0} step={50} value={f.fee_prov} onChange={set("fee_prov")} /></label>
        </div>
        <label className="field"><span>Bunul expertizat <small>(adresă, carte funciară)</small></span><input className="input" value={f.property} onChange={set("property")} placeholder="ex. Casă și teren 612 m², Dumbrăvița, str. Ferventia 14 · CF 408812" /></label>
        <label className="field"><span>Obiectivele expertizei <small>(câte unul pe rând, cum sunt în încheiere)</small></span><textarea className="input" rows={4} value={f.objectives} onChange={set("objectives")} /></label>
      </section>

      <section className="card">
        <div className="cardHead"><h2>Părțile</h2><button type="button" className="btn btnGhost btnSm" onClick={() => setParties([...parties, { role: "Altă parte", name: "", address: "", lawyer: "" }])}>+ Parte</button></div>
        {parties.map((p, i) => (
          <div key={i} className="xjParty">
            <label className="field"><span>Calitate</span><select className="input" value={p.role} onChange={(e) => setP(i, "role", e.target.value)}>{roles.map((r) => <option key={r}>{r}</option>)}</select></label>
            <label className="field"><span>Nume / denumire</span><input className="input" value={p.name} onChange={(e) => setP(i, "name", e.target.value)} /></label>
            <label className="field"><span>Adresă de citare</span><input className="input" value={p.address} onChange={(e) => setP(i, "address", e.target.value)} /></label>
            <label className="field"><span>Avocat / reprezentant</span><input className="input" value={p.lawyer} onChange={(e) => setP(i, "lawyer", e.target.value)} /></label>
            {parties.length > 1 && <button type="button" className="btn btnGhost btnSm" aria-label="Scoate partea" onClick={() => setParties(parties.filter((_, n) => n !== i))}>✕</button>}
          </div>
        ))}
        <p className="hint">Rândurile fără nume nu se salvează. Telefonul și e-mailul se pot adăuga apoi, în pagina dosarului.</p>
      </section>

      <section className="card">
        <h2>Primul termen</h2>
        <div className="grid2">
          <label className="field"><span>Următorul termen de judecată</span><input className="input" type="date" value={f.next_hearing} onChange={set("next_hearing")} /></label>
          <label className="field"><span>Ora <small>(opțional)</small></span><input className="input" type="time" value={f.next_time} onChange={set("next_time")} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={f.with_filing} onChange={(e) => setF({ ...f, with_filing: e.target.checked })} />
          <span>Adaugă și limita de depunere a raportului, cu {fileBefore} zile înainte de termen</span></label>
        <label className="field"><span>Note <small>(doar pentru tine)</small></span><textarea className="input" rows={2} value={f.notes} onChange={set("notes")} /></label>
      </section>

      {error && <div className="error" role="alert">{error.text}{error.id ? <> <a className="link" href={`${base}/expertize/${error.id}`}>Deschide-l →</a></> : null}</div>}
      <span className="actions">
        <button type="submit" className="btn btnGold" disabled={busy}>{busy ? "Se salvează…" : "Adaugă dosarul"}</button>
        <a className="btn btnGhost" href={`${base}/expertize`}>Renunță</a>
      </span>
    </form>
  );
}
