"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { SHEET_TYPES } from "@/lib/insp-forms";
import { DocsConfirm, missingOf, type DocState } from "@/components/DocsConfirm";

export type Person = { id: string; name: string; role: string; coverage: string | null };
export type TaskInitial = {
  asset: string; label: string; inspection: string | null; inspector: string | null; sheet_type: string; due_on: string | null;
  contact_kind: string | null; contact_name: string | null; contact_phone: string | null; instructions: string | null; scheduled: boolean;
  docs: DocState;
};

const CONTACTS: [string, string][] = [["", "—"], ["client", "Clientul"], ["owner", "Proprietarul"], ["agent", "Agent imobiliar"], ["other", "Altă persoană"]];
const ROLE: Record<string, string> = { inspector: "inspector", evaluator: "evaluator", owner: "evaluator principal", admin: "evaluator principal" };

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
            <label className="field">Cine face inspecția
              <select className="select" value={f.inspector} onChange={set("inspector")} required>
                <option value="">Alege…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.id === me ? `${p.name} (eu)` : p.name} · {ROLE[p.role] ?? p.role}{p.coverage ? ` · ${p.coverage}` : ""}</option>)}
              </select>
            </label>
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
