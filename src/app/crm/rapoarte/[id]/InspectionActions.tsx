"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { NO_INSPECTION_REASONS, SHEET_TYPES } from "@/lib/insp-forms";
import { PersonPicker, type PickPerson } from "@/components/PersonPicker";
import { PersonLine } from "@/components/Avatar";
import type { Presence } from "@/lib/presence";
import { DocsConfirm, missingOf, type DocState } from "@/components/DocsConfirm";

export type Person = { id: string; name: string; role: string; coverage: string | null; presence?: Presence; seen?: string };
export type TaskInitial = {
  asset: string; label: string; inspection: string | null; inspector: string | null; sheet_type: string; due_on: string | null;
  contact_kind: string | null; contact_name: string | null; contact_phone: string | null; instructions: string | null; scheduled: boolean;
  docs: DocState;
};

const CONTACTS: [string, string][] = [["", "—"], ["client", "Clientul"], ["owner", "Proprietarul"], ["agent", "Agent imobiliar"], ["other", "Altă persoană"]];
const ROLE: Record<string, string> = { inspector: "Inspector", evaluator: "Evaluator", owner: "Evaluator principal", admin: "Evaluator principal" };
const picks = (people: Person[]): PickPerson[] => people.map((p) => ({ id: p.id, name: p.name, sub: [ROLE[p.role] ?? p.role, p.coverage].filter(Boolean).join(" · "), presence: p.presence, seen: p.seen }));

async function send(url: string, init: RequestInit) {
  const r = await fetch(url, init).catch(() => null);
  const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
  return r?.ok ? null : d?.error || "Nu am putut salva. Încearcă din nou.";
}

/** "Alocă inspecția" / "Realocă": the inspection task of one asset, given to the evaluator themselves or to a colleague. */
export function AssignInspection({ report, me, people, initial }: { report: string; me: string; people: Person[]; initial: TaskInitial }) {
  const [open, setOpen] = useState(false);
  const realloc = !!initial.inspection;
  const [f, setF] = useState({
    inspector: initial.inspector ?? (people.some((p) => p.id === me) ? me : ""),
    sheet_type: initial.sheet_type, due_on: initial.due_on ?? "", contact_kind: initial.contact_kind ?? "", contact_name: initial.contact_name ?? "",
    contact_phone: initial.contact_phone ?? "", instructions: initial.instructions ?? "",
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const missing = missingOf(initial.docs);
  const moving = realloc && initial.scheduled && f.inspector !== initial.inspector;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.inspector) return setMsg("Alege cine face inspecția.");
    if (missing.length && !confirm) return setMsg(`Lipsesc ${missing.join(" și ")}: bifează că aloci inspecția fără ele sau încarcă-le întâi.`);
    setBusy(true); setMsg("");
    const error = await send(`/api/crm/reports/${report}/inspections`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asset: initial.asset, ...f, confirm_missing: confirm }) });
    setBusy(false);
    if (error) return setMsg(error);
    location.reload();
  };

  return (
    <>
      <button type="button" className={realloc ? "linkBtn" : "btn btnNavy btnSm"} onClick={() => setOpen(true)}>{realloc ? "Realocă" : "Alocă inspecția"}</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="assignTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="vfModalBox" onSubmit={submit}>
            <h2 id="assignTitle">{realloc ? "Realocă inspecția" : "Alocă inspecția"}</h2>
            <p className="hint">{initial.label}. Inspectorul primește un email și vede inspecția în aplicația de inspecții la „De programat”; programarea o face el.</p>
            <div className="field">Cine face inspecția
              <PersonPicker label="Cine face inspecția" value={f.inspector} onChange={(v) => setF({ ...f, inspector: v })} people={picks(people)} me={me} />
            </div>
            <DocsConfirm have={initial.docs} checked={confirm} onChange={setConfirm} />
            {moving && <div className="note">Inspecția este deja programată. Dacă o dai altcuiva, programarea se anulează și noul inspector o programează din nou.</div>}
            <div className="formRow">
              <label className="field">Fișa de inspecție
                <select className="select" value={f.sheet_type} onChange={set("sheet_type")}>{SHEET_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
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
            <label className="field">Instrucțiuni pentru inspector
              <textarea className="textarea" rows={3} value={f.instructions} onChange={set("instructions")} placeholder="ex. măsurători la toate încăperile, fotografii la acoperiș, cheia la vecinul de la ap. 4" />
            </label>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="submit" className="btn btnNavy" disabled={busy}>{busy ? "Se salvează…" : realloc ? "Salvează" : "Alocă"}</button>
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
export function AllocateAll({ report, me, people, rows, autoOpen }: { report: string; me: string; people: Person[]; rows: AllocRow[]; autoOpen: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  const free = rows.filter((r) => r.state === "free" || r.state === "none");
  const [pick, setPick] = useState<Record<string, string>>(() => Object.fromEntries(free.map((r) => [r.asset, r.state === "none" ? "none" : ""])));
  const [reason, setReason] = useState<Record<string, string>>(() => Object.fromEntries(free.map((r) => [r.asset, r.none ?? NO_INSPECTION_REASONS[0]])));
  const [due, setDue] = useState("");
  const [instructions, setInstructions] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setOpen(false);
    const u = new URL(location.href);
    if (u.searchParams.has("alocare")) { u.searchParams.delete("alocare"); history.replaceState(null, "", u); }
  };
  const given = free.filter((r) => pick[r.asset] && pick[r.asset] !== "none");
  const lacking = given.filter((r) => missingOf(r.docs).length);
  const changes = free.filter((r) => (pick[r.asset] || "") !== (r.state === "none" ? "none" : "") || (r.state === "none" && pick[r.asset] === "none" && reason[r.asset] !== r.none));

  const submit = async () => {
    if (lacking.length && !confirm) return setMsg("Unele bunuri nu au extrasul CF sau releveul: bifează că aloci fără ele sau încarcă-le întâi.");
    setBusy(true); setMsg("");
    const errors: string[] = [];
    for (const r of changes) {
      const v = pick[r.asset];
      const body = !v || v === "none"
        ? { asset: r.asset, none: v === "none" ? reason[r.asset] : null }
        : { asset: r.asset, inspector: v, sheet_type: r.sheet_type, due_on: due, contact_kind: r.contact_kind ?? "client", contact_name: r.contact_name ?? "", contact_phone: r.contact_phone ?? "", instructions, confirm_missing: confirm };
      const e = await send(`/api/crm/reports/${report}/inspections`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (e) errors.push(`${r.label}: ${e}`);
    }
    setBusy(false);
    if (errors.length) return setMsg(errors.join(" · "));
    const u = new URL(location.href);
    u.searchParams.delete("alocare");
    location.replace(u);
  };

  return (
    <>
      <button type="button" className="btn btnNavy btnSm" onClick={() => setOpen(true)}>Alocă inspecțiile</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="allocTitle" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="vfModalBox wide">
            <h2 id="allocTitle">Alocă inspecțiile</h2>
            <p className="hint">Pentru fiecare bun din raport alegi cine face inspecția, „Fără inspecție” (evaluare fără vizită în CRM) sau lași pentru mai târziu. Inspectorul primește email și vede inspecția în aplicație.</p>
            {free.length > 1 && (
              <div className="field">Același inspector pentru toate bunurile
                <PersonPicker label="Același inspector pentru toate bunurile" value="" onChange={(v) => { if (v) setPick(Object.fromEntries(free.map((r) => [r.asset, v]))); }}
                  people={picks(people)} me={me} extras={[{ value: "none", label: "Toate fără inspecție", hint: "evaluare fără vizită în CRM", after: true }]} />
              </div>
            )}
            <ul className="allocList">
              {rows.map((r) => {
                const editable = r.state === "free" || r.state === "none";
                const v = pick[r.asset] ?? "";
                return (
                  <li key={r.asset}>
                    <div className="allocWhat">
                      <b>{r.label}</b>
                      {r.address && <small>{r.address}</small>}
                      {editable && v && v !== "none" && (
                        <span className="allocTags">
                          {(["cf", "rlv"] as const).map((t) => <span key={t} className={`docTag ${r.docs[t] ? "ok" : "miss"}`}>{r.docs[t] ? "✓" : "!"} {t === "cf" ? "CF" : "RLV"}</span>)}
                          {r.contact_name && <small>Contact: {r.contact_name}{r.contact_phone ? ` · ${r.contact_phone}` : ""}</small>}
                        </span>
                      )}
                    </div>
                    {editable ? (
                      <div className="allocPick">
                        <PersonPicker label={`Inspecția: ${r.label}`} value={v} onChange={(x) => setPick({ ...pick, [r.asset]: x })} people={picks(people)} me={me} placeholder="Mai târziu"
                          extras={[{ value: "", label: "Mai târziu", hint: "rămâne nealocată" }, { value: "none", label: "Fără inspecție", hint: "evaluare fără vizită în CRM", after: true }]} />
                        {v === "none" && (
                          <select className="select" aria-label={`Motiv: ${r.label}`} value={reason[r.asset]} onChange={(e) => setReason({ ...reason, [r.asset]: e.target.value })}>
                            {[...new Set([...NO_INSPECTION_REASONS, reason[r.asset]])].map((x) => <option key={x} value={x}>{x}</option>)}
                          </select>
                        )}
                      </div>
                    ) : (
                      r.state === "done" ? <span className="pill pillOk"><i />Realizată</span> : (() => {
                        const p = picks(people).find((x) => x.id === r.inspector);
                        return p ? <PersonLine id={p.id} name={p.name} sub={`Alocată · ${p.seen ?? ""}`} presence={p.presence} size={30} me={p.id === me} /> : <span className="pill pillInfo"><i />Alocată</span>;
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
            {lacking.length > 0 && (
              <div className="docsWarn">
                <p><b>Fără extras CF sau releveu: {lacking.map((r) => r.label).join(", ")}.</b> Inspectorul are nevoie de ele la vizionare. Le poți încărca în raport, la „Documente & Livrare”; apar singure în aplicația de inspecții.</p>
                <label className="check"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /><span>Aloc inspecțiile fără ele</span></label>
              </div>
            )}
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
