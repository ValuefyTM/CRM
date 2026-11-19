"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PartyIn = { role: string; name: string; address: string; lawyer: string };
type ObjIn = { text: string; by: string };
type Read = { number: string; court: string; section: string; panel: string; object: string; appointed_on: string; specialty: string; expert: string; property: string; fee_prov: string; fee_by: string; fee_due: string;
  next_hearing: string; next_time: string; room: string; filing: string; parties: { role: string; name: string; lawyer: string }[]; objectives: ObjIn[]; notes: string; appoints: boolean };
type PortalCase = { number: string; court: string | null; section: string | null; object: string | null; stage: string | null; parties: { name: string; role: string }[];
  sessions: { date: string; time: string | null; solution: string | null; summary: string | null }[] };
const ro = (d: string) => d.split("-").reverse().join(".");
const COURTS = ["Judecătoria Timișoara", "Tribunalul Timiș", "Curtea de Apel Timișoara", "Judecătoria Lugoj", "Judecătoria Deta", "Judecătoria Făget", "Judecătoria Sânnicolau Mare", "Tribunalul Arad", "Judecătoria Arad", "Tribunalul Caraș-Severin"];

/** A new case, from the appointment: the case, the parties, the objectives, the next hearing, the provisional fee. */
export function CaseForm({ base, roles, fileBefore, monitor }: { base: string; roles: string[]; fileBefore: number; monitor: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ number: "", court: "", section: "", panel: "", object: "", specialty: "Evaluarea proprietății imobiliare", appointed_on: "", property: "",
    next_hearing: "", next_time: "", next_note: "", with_filing: true, fee_prov: "", notes: "", monitor });
  const [objs, setObjs] = useState<ObjIn[]>([{ text: "", by: "instanța" }]);
  // the appointment decision, read by the assistant: kept to be put in the case's first folder
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState<{ ok: boolean; text: string } | null>(null);
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<PortalCase[] | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const [parties, setParties] = useState<PartyIn[]>([{ role: "Reclamant", name: "", address: "", lawyer: "" }, { role: "Pârât", name: "", address: "", lawyer: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; id?: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const setP = (i: number, k: keyof PartyIn, v: string) => setParties((p) => p.map((x, n) => (n === i ? { ...x, [k]: v } : x)));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await fetch("/api/crm/expertize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, parties, objectives: objs.filter((o) => o.text.trim()).map((o) => ({ ...o, done: false })) }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { id?: string; folder?: string | null; error?: string };
    if (!r?.ok || !d.id) { setBusy(false); setError({ text: d?.error ?? "Nu am putut salva dosarul.", id: d?.id }); return; }
    // the decision itself goes into „Încheiere de numire”; the first check of the portal brings the hearings so far
    if (file && d.folder) { const fd = new FormData(); fd.set("folder", d.folder); fd.append("file", file); await fetch(`/api/crm/expertize/${d.id}/docs`, { method: "POST", body: fd }).catch(() => null); }
    if (f.monitor) await fetch(`/api/crm/expertize/${d.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "portal.sync" }) }).catch(() => null);
    router.push(`${base}/expertize/${d.id}`);
  };
  /** The decision read by the assistant fills the form (what is already written by hand is replaced only where it found something). */
  const readFile = async (x: File) => {
    setFile(x); setReading(true); setRead(null);
    const fd = new FormData(); fd.append("file", x);
    const r = await fetch("/api/crm/expertize/citeste", { method: "POST", body: fd }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as Partial<Read> & { error?: string };
    setReading(false);
    if (!r?.ok || !d.number) { setRead({ ok: false, text: d?.error ?? "Nu am putut citi încheierea. Fișierul rămâne atașat și intră în dosar." }); return; }
    const v = d as Read;
    setF((o) => ({ ...o, number: v.number || o.number, court: v.court || o.court, section: v.section || o.section, panel: v.panel || o.panel, object: v.object || o.object, specialty: v.specialty || o.specialty,
      appointed_on: v.appointed_on || o.appointed_on, property: v.property || o.property, fee_prov: v.fee_prov || o.fee_prov, next_hearing: v.next_hearing || o.next_hearing, next_time: v.next_time || o.next_time,
      next_note: [v.room && `sala ${v.room}`].filter(Boolean).join(" · ") || o.next_note,
      notes: [o.notes, v.fee_by && `Onorariul provizoriu este în sarcina: ${v.fee_by}${v.fee_due ? `, de plătit în ${v.fee_due}` : ""}.`, v.filing && `Depunerea raportului: ${v.filing}.`, v.notes].filter(Boolean).join("\n") }));
    if (v.parties.length) setParties(v.parties.map((p) => ({ role: p.role, name: p.name, address: "", lawyer: p.lawyer })));
    if (v.objectives.length) setObjs(v.objectives);
    setRead({ ok: v.appoints, text: v.appoints ? `Am citit încheierea${v.expert ? ` (expert numit: ${v.expert})` : ""}. Verifică datele de mai jos înainte de a salva.` : "Documentul nu pare o încheiere de numire a unui expert. Am completat ce am găsit; verifică atent." });
  };
  /** The case as portal.just.ro has it: fills what is still empty. */
  const lookup = async () => {
    setLooking(true); setFound(null); setError(null);
    const r = await fetch("/api/crm/expertize/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number: f.number }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { cases?: PortalCase[]; error?: string };
    setLooking(false);
    if (!r?.ok || !d.cases?.length) { setError({ text: d?.error ?? "Nu am putut citi portalul." }); return; }
    setFound(d.cases);
    if (d.cases.length === 1) applyPortal(d.cases[0]);
  };
  const applyPortal = (c: PortalCase) => {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
    const next = c.sessions.find((x) => x.date >= today && !x.solution && !x.summary);
    setF((o) => ({ ...o, court: o.court || c.court || "", section: o.section || c.section || "", object: o.object || c.object || "", next_hearing: o.next_hearing || next?.date || "", next_time: o.next_time || next?.time || "" }));
    setParties((p) => (p.some((x) => x.name.trim()) ? p : c.parties.map((x) => ({ role: x.role, name: x.name, address: "", lawyer: "" }))));
    setFound([c]);
  };
  return (
    <form className="xjForm" onSubmit={save}>
      <section className="card xjRead">
        <div className="cardHead"><h2>Citește încheierea de numire</h2>{file && <span className="pill pillOk">atașată: {file.name}</span>}</div>
        <p className="hint">Încarcă încheierea de ședință prin care ai fost numit expert (PDF). Asistentul o citește și completează dosarul, părțile, obiectivele instanței și ale părților, onorariul provizoriu și termenul următor. Fișierul intră în folderul „Încheiere de numire”.</p>
        <span className="actions">
          <button type="button" className="btn btnNavy btnSm" disabled={reading} onClick={() => pick.current?.click()}>{reading ? "Se citește încheierea…" : file ? "Alege altă încheiere" : "Alege încheierea (PDF)"}</button>
          <input ref={pick} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) readFile(x); e.target.value = ""; }} />
        </span>
        {read && <div role="status" className={read.ok ? "okMsg" : "note"}>{read.text}</div>}
      </section>

      <section className="card">
        <h2>Dosarul</h2>
        <div className="grid2">
          <label className="field"><span>Număr dosar</span>
            <span className="xjInline"><input className="input mono" value={f.number} onChange={set("number")} placeholder="ex. 4127/325/2025" required autoFocus />
              <button type="button" className="btn btnGhost btnSm" disabled={looking || !f.number.trim()} onClick={lookup}>{looking ? "Se caută…" : "Caută pe portal.just.ro"}</button></span></label>
          <label className="field"><span>Instanța</span><input className="input" value={f.court} onChange={set("court")} list="xj-courts" placeholder="ex. Judecătoria Timișoara" />
            <datalist id="xj-courts">{COURTS.map((c) => <option key={c} value={c} />)}</datalist></label>
          <label className="field"><span>Secția</span><input className="input" value={f.section} onChange={set("section")} placeholder="ex. Secția I civilă" /></label>
          <label className="field"><span>Completul</span><input className="input" value={f.panel} onChange={set("panel")} placeholder="ex. C12" /></label>
          <label className="field"><span>Obiectul dosarului</span><input className="input" value={f.object} onChange={set("object")} placeholder="ex. Partaj judiciar" /></label>
          <label className="field"><span>Specializarea expertizei</span><input className="input" value={f.specialty} onChange={set("specialty")} /></label>
          <label className="field"><span>Data încheierii de numire</span><input className="input" type="date" value={f.appointed_on} onChange={set("appointed_on")} /></label>
          <label className="field"><span>Onorariu provizoriu <small>(lei)</small></span><input className="input" type="number" min={0} step={50} value={f.fee_prov} onChange={set("fee_prov")} /></label>
        </div>
        {found && (found.length > 1 && !f.court
          ? <div className="note">Numărul apare la mai multe instanțe. Alege-o pe a ta: {found.map((c, i) => <button key={i} type="button" className="btn btnGhost btnSm" style={{ marginLeft: 6 }} onClick={() => applyPortal(c)}>{c.court ?? "instanță"} · {c.stage ?? "—"}</button>)}</div>
          : <div className="okMsg">Găsit pe portal: {found[0].court}{found[0].stage ? ` · ${found[0].stage}` : ""} · {found[0].parties.length} părți · {found[0].sessions.length} ședințe{found[0].sessions.length ? ` (ultima: ${ro(found[0].sessions[found[0].sessions.length - 1].date)})` : ""}. Am completat câmpurile goale.</div>)}
        <label className="field"><span>Bunul expertizat <small>(adresă, carte funciară)</small></span><input className="input" value={f.property} onChange={set("property")} placeholder="ex. Casă și teren 612 m², Dumbrăvița, str. Ferventia 14 · CF 408812" /></label>
      </section>

      <section className="card">
        <div className="cardHead"><h2>Obiectivele expertizei</h2><button type="button" className="btn btnGhost btnSm" onClick={() => setObjs([...objs, { text: "", by: "instanța" }])}>+ Obiectiv</button></div>
        {objs.map((o, i) => (
          <div key={i} className="xjObjIn">
            <label className="field"><span>{i === 0 ? "Obiectivul principal" : `Obiectivul ${i + 1}`}</span><textarea className="input" rows={3} value={o.text} onChange={(e) => setObjs(objs.map((x, n) => (n === i ? { ...x, text: e.target.value } : x)))} /></label>
            <label className="field"><span>Stabilit de</span><input className="input" value={o.by} list="xj-by" onChange={(e) => setObjs(objs.map((x, n) => (n === i ? { ...x, by: e.target.value } : x)))} /></label>
            {objs.length > 1 && <button type="button" className="btn btnGhost btnSm" aria-label="Scoate obiectivul" onClick={() => setObjs(objs.filter((_, n) => n !== i))}>✕</button>}
          </div>
        ))}
        <datalist id="xj-by"><option value="instanța" /><option value="reclamant" /><option value="pârât" /><option value="intervenient" /></datalist>
        <p className="hint">Obiectivele fixate de instanță și cele propuse de părți, cu textul din încheiere. Apar în pagina dosarului, fiecare cu cine l-a stabilit.</p>
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
        <label className="field"><span>Detalii termen <small>(sala)</small></span><input className="input" value={f.next_note} onChange={set("next_note")} placeholder="ex. sala 331" /></label>
        <label className="check"><input type="checkbox" checked={f.with_filing} onChange={(e) => setF({ ...f, with_filing: e.target.checked })} />
          <span>Adaugă și limita de depunere a raportului, cu {fileBefore} zile înainte de termen</span></label>
        <label className="check"><input type="checkbox" checked={f.monitor} onChange={(e) => setF({ ...f, monitor: e.target.checked })} />
          <span><b>Monitorizează dosarul pe portal.just.ro</b> <small className="muted">· ședințele, soluțiile și termenele noi se preiau singure, iar tu primești alertă să verifici dosarul electronic</small></span></label>
        <label className="field"><span>Note <small>(doar pentru tine)</small></span><textarea className="input" rows={3} value={f.notes} onChange={set("notes")} /></label>
      </section>

      {error && <div className="error" role="alert">{error.text}{error.id ? <> <a className="link" href={`${base}/expertize/${error.id}`}>Deschide-l →</a></> : null}</div>}
      <span className="actions">
        <button type="submit" className="btn btnGold" disabled={busy}>{busy ? "Se salvează…" : "Adaugă dosarul"}</button>
        <a className="btn btnGhost" href={`${base}/expertize`}>Renunță</a>
      </span>
    </form>
  );
}
