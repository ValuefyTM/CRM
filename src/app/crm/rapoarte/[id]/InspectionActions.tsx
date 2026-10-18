"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { NO_INSPECTION_REASONS, SHEET_TYPES } from "@/lib/insp-forms";
import { PersonPicker, type PickPerson } from "@/components/PersonPicker";
import { PersonLine } from "@/components/Avatar";
import type { Presence } from "@/lib/presence";
import { type DocState } from "@/components/DocsConfirm";
import { DocAccess, defaultAccess, type AccessDoc } from "@/components/DocAccess";

export type Person = { id: string; name: string; role: string; coverage: string | null; presence?: Presence; seen?: string; photo?: string | null };
export type TaskInitial = {
  asset: string; label: string; inspection: string | null; inspector: string | null; sheet_type: string; due_on: string | null;
  contact_kind: string | null; contact_name: string | null; contact_phone: string | null; instructions: string | null; scheduled: boolean;
  docs: DocState;
};

const CONTACTS: [string, string][] = [["", "—"], ["client", "Clientul"], ["owner", "Proprietarul"], ["agent", "Agent imobiliar"], ["other", "Altă persoană"]];
const ROLE: Record<string, string> = { inspector: "Inspector", evaluator: "Evaluator", owner: "Evaluator principal", admin: "Evaluator principal" };
const picks = (people: Person[]): PickPerson[] => people.map((p) => ({ id: p.id, name: p.name, sub: [ROLE[p.role] ?? p.role, p.coverage].filter(Boolean).join(" · "), presence: p.presence, seen: p.seen, photo: p.photo }));

async function send(url: string, init: RequestInit) {
  const r = await fetch(url, init).catch(() => null);
  const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
  return r?.ok ? null : d?.error || "Nu am putut salva. Încearcă din nou.";
}

/** "Alocă inspecția" / "Realocă": the inspection task of one asset, given to the evaluator themselves or to a colleague. */
/** `reinspect`: the asset was inspected already; a new inspection is given (the message goes to the inspector by email and in the app). */
export function AssignInspection({ report, me, people, initial, docs = [], access, reinspect = false, sheets = SHEET_TYPES }: { report: string; me: string; people: Person[]; initial: TaskInitial; docs?: AccessDoc[]; access?: string[] | null; reinspect?: boolean; sheets?: [string, string][] }) {
  const [open, setOpen] = useState(false);
  const realloc = !!initial.inspection && !reinspect;
  const [f, setF] = useState({
    inspector: initial.inspector ?? (people.some((p) => p.id === me) ? me : ""),
    sheet_type: initial.sheet_type, due_on: initial.due_on ?? "", contact_kind: initial.contact_kind ?? "", contact_name: initial.contact_name ?? "",
    contact_phone: initial.contact_phone ?? "", instructions: initial.instructions ?? "",
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // The documents the inspector may open: the ones chosen before, else the asset's own (and the whole report's).
  const [refs, setRefs] = useState<string[]>(access ?? defaultAccess(docs, [initial.asset]));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const moving = realloc && initial.scheduled && f.inspector !== initial.inspector;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.inspector) return setMsg("Alege cine face inspecția.");
    setBusy(true); setMsg("");
    const error = await send(`/api/crm/reports/${report}/inspections`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: initial.asset, ...f, confirm_missing: true, ...(docs.length ? { doc_refs: refs } : {}) }) });
    setBusy(false);
    if (error) return setMsg(error);
    location.reload();
  };

  return (
    <>
      <button type="button" className={realloc ? "linkBtn" : reinspect ? "btn btnGhost btnSm" : "btn btnNavy btnSm"} onClick={() => setOpen(true)}>{realloc ? "Realocă" : reinspect ? "↻ Inspecție nouă" : "Alocă inspecția"}</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="assignTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="vfModalBox" onSubmit={submit}>
            <h2 id="assignTitle">{realloc ? "Realocă inspecția" : reinspect ? "Inspecție nouă (reinspecție)" : "Alocă inspecția"}</h2>
            {reinspect && <div className="note">Bunul a fost deja inspectat. Se creează o inspecție nouă; fișa veche rămâne salvată în CRM.</div>}
            <p className="hint">{initial.label}. Inspectorul primește un email și vede inspecția în aplicația de inspecții la „De programat”; programarea o face el.</p>
            <div className="field">Cine face inspecția
              <PersonPicker label="Cine face inspecția" value={f.inspector} onChange={(v) => setF({ ...f, inspector: v })} people={picks(people)} me={me} />
            </div>
            <DocAccess docs={docs} value={refs} onChange={setRefs} />
            {moving && <div className="note">Inspecția este deja programată. Dacă o dai altcuiva, programarea se anulează și noul inspector o programează din nou.</div>}
            <div className="formRow">
              <label className="field">Fișa de inspecție
                <select className="select" value={f.sheet_type} onChange={set("sheet_type")}>{sheets.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </label>
              <label className="field">Termen (opțional)
                <input className="input" type="date" value={f.due_on} onChange={set("due_on")} />
              </label>
            </div>
            <div className="formRow">
              <label className="field">Contact la fața locului
                <select className="select" value={f.contact_kind} onChange={set("contact_kind")}>{CONTACTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </label>
              <label className="field">Nume<input className="input" value={f.contact_name} onChange={set("contact_name")} /></label>
              <label className="field">Telefon<input className="input" type="tel" value={f.contact_phone} onChange={set("contact_phone")} /></label>
            </div>
            <label className="field">{reinspect ? <span className="fLabel">Mesaj pentru inspector <small>(opțional · îl primește pe email și îl vede în aplicație)</small></span> : "Instrucțiuni pentru inspector"}
              <textarea className="textarea" rows={3} value={f.instructions} onChange={set("instructions")} placeholder={reinspect ? "ex. refă fotografiile la bucătărie, banca cere și măsurătorile balconului" : "ex. măsurători la toate încăperile, fotografii la acoperiș, cheia la vecinul de la ap. 4"} />
            </label>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="submit" className="btn btnNavy" disabled={busy}>{busy ? "Se salvează…" : realloc ? "Salvează" : reinspect ? "Alocă inspecția nouă" : "Alocă"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}

export function CancelInspection({ report, inspection, who }: { report: string; inspection: string; who: string }) {
  return (
    <button type="button" className="linkBtn danger" onClick={async () => {
      if (!confirm(`Anulezi inspecția alocată lui ${who}? Dispare din aplicația inspectorului.`)) return;
      const error = await send(`/api/crm/reports/${report}/inspections?inspection=${encodeURIComponent(inspection)}`, { method: "DELETE" });
      if (error) return alert(error);
      location.reload();
    }}>Anulează</button>
  );
}

/** One asset in the allocation window. `state`: free (to give), open (task given), done, none (valued without inspection). */
export type AllocRow = {
  asset: string; label: string; address: string | null; state: "free" | "open" | "done" | "none"; inspector: string | null; none: string | null;
  sheet_type: string; contact_kind: string | null; contact_name: string | null; contact_phone: string | null; docs: DocState;
};

/**
 * "Alocă inspecțiile": every asset of the report in one window — an inspector, "Fără inspecție" (with the reason) or
 * later. Opens by itself right after the report is created; it can be closed without giving anything.
 */
/** `realloc`: every inspection is given already; the open ones (not done yet) can be moved to someone else. */
export function AllocateAll({ report, me, people, rows, autoOpen, docs = [], realloc = false }: { report: string; me: string; people: Person[]; rows: AllocRow[]; autoOpen: boolean; docs?: AccessDoc[]; realloc?: boolean }) {
  // Opened after mounting: the window is a portal into document.body, which the server render does not have.
  const [open, setOpen] = useState(false);
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);
  const canEdit = (r: AllocRow) => r.state === "free" || r.state === "none" || (realloc && r.state === "open");
  const free = rows.filter(canEdit);
  const start = (r: AllocRow) => (r.state === "none" ? "none" : r.state === "open" ? r.inspector ?? "" : "");
  const [pick, setPick] = useState<Record<string, string>>(() => Object.fromEntries(free.map((r) => [r.asset, start(r)])));
  const [reason, setReason] = useState<Record<string, string>>(() => Object.fromEntries(free.map((r) => [r.asset, r.none ?? NO_INSPECTION_REASONS[0]])));
  const [due, setDue] = useState("");
  const [instructions, setInstructions] = useState("");
  const [refs, setRefs] = useState<string[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setOpen(false);
    const u = new URL(location.href);
    if (u.searchParams.has("alocare")) { u.searchParams.delete("alocare"); history.replaceState(null, "", u); }
  };
  const given = free.filter((r) => pick[r.asset] && pick[r.asset] !== "none" && pick[r.asset] !== start(r));
  // Ticked by default: the documents of the assets given now and the ones of the whole report.
  const access = refs ?? defaultAccess(docs, given.map((r) => r.asset));
  const changes = free.filter((r) => (pick[r.asset] || "") !== start(r) || (r.state === "none" && pick[r.asset] === "none" && reason[r.asset] !== r.none));

  const submit = async () => {
    setBusy(true); setMsg("");
    const errors: string[] = [], ids: string[] = [];
    for (const r of changes) {
      const v = pick[r.asset];
      // one email to each inspector for all the assets, after the loop
      const body = !v || v === "none"
        ? { asset: r.asset, none: v === "none" ? reason[r.asset] : null }
        : { asset: r.asset, inspector: v, sheet_type: r.sheet_type, due_on: due, contact_kind: r.contact_kind ?? "client", contact_name: r.contact_name ?? "", contact_phone: r.contact_phone ?? "", instructions, confirm_missing: true, notify: false,
          ...(docs.length && r.state !== "open" ? { doc_refs: access.filter((id) => { const d = docs.find((x) => x.id === id); return !d?.asset_id || d.asset_id === r.asset || given.length === 1; }) } : {}) };
      const res = await fetch(`/api/crm/reports/${report}/inspections`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
      const d = (await res?.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res?.ok) errors.push(`${r.label}: ${d?.error ?? "nu s-a putut salva"}`);
      else if (d?.id) ids.push(d.id);
    }
    if (ids.length) await fetch(`/api/crm/reports/${report}/inspections`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notify: ids }) }).catch(() => null);
    setBusy(false);
    if (errors.length) return setMsg(errors.join(" · "));
    const u = new URL(location.href);
    u.searchParams.delete("alocare");
    location.replace(u);
  };

  return (
    <>
      <button type="button" className={realloc ? "btn btnGhost btnSm" : "btn btnNavy btnSm"} onClick={() => setOpen(true)}>{realloc ? "Realocă inspecțiile" : "Alocă inspecțiile"}</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="allocTitle" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="vfModalBox wide">
            <h2 id="allocTitle">{realloc ? "Realocă inspecțiile" : "Alocă inspecțiile"}</h2>
            <p className="hint">Pentru fiecare bun din raport alegi cine face inspecția, „Fără inspecție” (evaluare fără vizită în CRM) sau lași pentru mai târziu. Inspectorul primește email și vede inspecția în aplicație.</p>
            {free.length > 1 && (
              <div className="field">Același inspector pentru toate bunurile
                <PersonPicker label="Același inspector pentru toate bunurile" value="" onChange={(v) => { if (v) setPick(Object.fromEntries(free.map((r) => [r.asset, v]))); }}
                  people={picks(people)} me={me} extras={[{ value: "none", label: "Toate fără inspecție", hint: "evaluare fără vizită în CRM", after: true }]} />
              </div>
            )}
            <ul className="allocList">
              {rows.map((r) => {
                const editable = canEdit(r);
                const v = pick[r.asset] ?? "";
                return (
                  <li key={r.asset}>
                    <div className="allocWhat">
                      <b>{r.label}</b>
                      {r.address && <small>{r.address}</small>}
                      {editable && v && v !== "none" && r.contact_name && (
                        <span className="allocTags"><small>Contact: {r.contact_name}{r.contact_phone ? ` · ${r.contact_phone}` : ""}</small></span>
                      )}
                    </div>
                    {editable ? (
                      <div className="allocPick">
                        <PersonPicker label={`Inspecția: ${r.label}`} value={v} onChange={(x) => setPick({ ...pick, [r.asset]: x })} people={picks(people)} me={me} placeholder="Mai târziu"
                          extras={r.state === "open" ? [] : [{ value: "", label: "Mai târziu", hint: "rămâne nealocată" }, { value: "none", label: "Fără inspecție", hint: "evaluare fără vizită în CRM", after: true }]} />
                        {v === "none" && (
                          <select className="select" aria-label={`Motiv: ${r.label}`} value={reason[r.asset]} onChange={(e) => setReason({ ...reason, [r.asset]: e.target.value })}>
                            {[...new Set([...NO_INSPECTION_REASONS, reason[r.asset]])].map((x) => <option key={x} value={x}>{x}</option>)}
                          </select>
                        )}
                      </div>
                    ) : (
                      r.state === "done" ? <span className="pill pillOk"><i />Realizată</span> : (() => {
                        const p = picks(people).find((x) => x.id === r.inspector);
                        return p ? <PersonLine id={p.id} name={p.name} sub={`Alocată · ${p.seen ?? ""}`} presence={p.presence} photo={p.photo} size={30} me={p.id === me} /> : <span className="pill pillInfo"><i />Alocată</span>;
                      })()
                    )}
                  </li>
                );
              })}
            </ul>
            {given.length > 0 && (
              <>
                <div className="formRow">
                  <label className="field">Termen inspecție <small>(opțional)</small><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
                </div>
                <label className="field">Instrucțiuni pentru inspector <small>(opțional)</small>
                  <textarea className="textarea" rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="ex. măsurători la toate încăperile, cheia la vecinul de la ap. 4" />
                </label>
              </>
            )}
            {given.length > 0 && <DocAccess docs={docs} value={access} onChange={setRefs} />}
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              {free.length > 0 && <button type="button" className="btn btnNavy" disabled={busy || !changes.length} onClick={submit}>{busy ? "Se salvează…" : given.length ? `Alocă (${given.length})` : "Salvează"}</button>}
              <button type="button" className="btn btnGhost" onClick={close}>{free.length ? "Închide, aloc mai târziu" : "Închide"}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Takes back "Fără inspecție": the asset needs an inspection again. */
export function NeedsInspection({ report, asset }: { report: string; asset: string }) {
  return (
    <button type="button" className="linkBtn" onClick={async () => {
      const error = await send(`/api/crm/reports/${report}/inspections`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asset, none: null }) });
      if (error) return alert(error);
      location.reload();
    }}>Necesită inspecție</button>
  );
}

/** "Inspecție realizată": the inspection was done without the app; its date (and hour), then the report moves on. */
export function MarkInspectionDone({ report, asset, label }: { report: string; asset: string; label: string }) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(today);
  const [hour, setHour] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setMsg("");
    const error = await send(`/api/crm/reports/${report}/inspections`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asset, done_at: hour ? `${day}T${hour}` : day }) });
    setBusy(false);
    if (error) return setMsg(error);
    location.reload();
  };
  return (
    <>
      <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(true)}>✓ Inspecție realizată</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="doneTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox" style={{ maxWidth: 440 }}>
            <h2 id="doneTitle">Inspecție realizată</h2>
            <p className="hint">{label}. Pentru o inspecție făcută fără aplicație. Când nu mai rămâne niciun bun de inspectat, raportul trece la redactare.</p>
            <div className="formRow">
              <label className="field">Data inspecției<input className="input" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} /></label>
              <label className="field"><span className="fLabel">Ora <small>(opțional)</small></span><input className="input" type="time" value={hour} onChange={(e) => setHour(e.target.value)} /></label>
            </div>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="button" className="btn btnNavy" disabled={busy || !day} onClick={submit}>{busy ? "Se salvează…" : "Marchează realizată"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** UVALO: send the inspection again (after an error) or bring the finished sheet now (if the webhook did not). */
export function UvaloAction({ report, inspection, action }: { report: string; inspection: string; action: "push" | "import" }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={async () => {
      setBusy(true);
      const error = await send("/api/crm/uvalo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, report, inspection }) });
      setBusy(false);
      if (error) return alert(error);
      location.reload();
    }}>{busy ? "Se trimite…" : action === "push" ? "↻ Retrimite în UVALO" : "⤓ Preia fișa din UVALO"}</button>
  );
}

/** "Șterge inspecția": from everywhere (the sheet, its photos and signature, UVALO), as if it had not been made; with the reason. */
export function DeleteInspection({ report, inspection, label, done, uvalo }: { report: string; inspection: string; label: string; done: boolean; uvalo: boolean }) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const run = async () => {
    setBusy(true); setMsg("");
    const error = await send(`/api/crm/reports/${report}/inspections?inspection=${encodeURIComponent(inspection)}&purge=1&reason=${encodeURIComponent(why)}`, { method: "DELETE" });
    setBusy(false);
    if (error) return setMsg(error);
    location.reload();
  };
  return (
    <>
      <button type="button" className="linkBtn danger" onClick={() => setOpen(true)}>Șterge inspecția</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="delInspTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox" style={{ maxWidth: 480 }}>
            <h2 id="delInspTitle">Șterge inspecția</h2>
            <p className="hint">{label}.</p>
            <div className="note">
              Se șterge definitiv{done ? <>: <b>fișa de inspecție, fotografiile și semnătura</b>, datele preluate din fișă</> : " inspecția alocată"}{uvalo ? <>, și <b>din UVALO</b> (dispare de pe telefonul inspectorului)</> : null}.
              Bunul rămâne fără inspecție, ca și cum nu ar fi fost făcută{done ? "; raportul revine la etapa Inspecție dacă era la Redactare" : ""}.
            </div>
            <label className="field"><span className="fLabel">Motivul <small>(opțional, rămâne în jurnal)</small></span>
              <textarea className="textarea" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="ex. inspecția s-a făcut la alt imobil" /></label>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="button" className="btn btnDanger" disabled={busy} onClick={run}>{busy ? "Se șterge…" : "Șterge definitiv"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
