"use client";
// What the owner does with a statement: validate (freeze the lines), issue (number it), reopen with a reason,
// delete an open one, keep notes. Also the button that opens a party's statement for a month.
import { useState } from "react";
import { createPortal } from "react-dom";

const send = async (url: string, method: string, body?: object) => {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const d = (await r?.json().catch(() => ({}))) as { error?: string; id?: string; number?: string };
  return { ok: !!r?.ok, error: d.error ?? "Nu s-a salvat.", data: d };
};

export function ReasonModal({ title, hint, label, danger, onClose, onSave }: { title: string; hint?: string; label: string; danger?: boolean; onClose: () => void; onSave: (why: string) => Promise<string | null> }) {
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return createPortal(
    <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="rmT" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="vfModalBox">
        <div className="cardHead"><h2 id="rmT">{title}</h2><button type="button" className="btn btnGhost btnSm" onClick={onClose} aria-label="Închide">×</button></div>
        <label className="field">Motivul<textarea className="textarea" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} autoFocus /></label>
        {hint && <p className="hint" style={{ margin: 0 }}>{hint}</p>}
        {msg && <div role="alert" className="error">{msg}</div>}
        <div className="actions">
          <button type="button" className={`btn ${danger ? "btnDanger" : "btnNavy"}`} disabled={busy || !why.trim()} onClick={async () => { setBusy(true); setMsg(""); const e = await onSave(why.trim()); setBusy(false); if (e) setMsg(e); }}>{busy ? "Se salvează…" : label}</button>
          <button type="button" className="btn btnGhost" onClick={onClose}>Renunță</button>
        </div>
      </div>
    </div>, document.body);
}

export function StatementActions({ id, status, canEdit, canDelete, back, lines }: { id: string; status: "open" | "validated" | "issued"; canEdit: boolean; canDelete: boolean; back: string; lines: number }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [reopen, setReopen] = useState(false);
  const act = async (action: string, extra?: object) => {
    setBusy(true); setMsg("");
    const r = await send(`/api/crm/statements/${id}`, "PATCH", { action, ...extra });
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    location.reload();
  };
  return (
    <>
      {canEdit && status === "open" && <button type="button" className="btn btnNavy btnSm" disabled={busy || !lines} title={lines ? "Liniile se îngheață așa cum sunt acum; le poți ajusta până la emitere" : "Nicio linie de validat"}
        onClick={() => { if (confirm("Validezi borderoul? Liniile se îngheață așa cum sunt acum (le poți ajusta până la emitere).")) act("validate"); }}>Validează</button>}
      {canEdit && status === "validated" && <button type="button" className="btn btnGold btnSm" disabled={busy} onClick={() => { if (confirm("Emiți borderoul? Primește număr și nu se mai modifică.")) act("issue"); }}>Emite</button>}
      {canEdit && status !== "open" && <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => setReopen(true)}>{status === "issued" ? "Redeschide (emis → validat)" : "Înapoi în curs"}</button>}
      <a className="btn btnGhost btnSm" href={`${back}/${id}/print`} target="_blank" rel="noopener">Tipărește / PDF</a>
      {canDelete && status !== "issued" && <button type="button" className="btn btnGhost btnSm qtDel" disabled={busy} onClick={async () => {
        if (!confirm("Ștergi borderoul? Liniile adăugate și ajustările se pierd; luna se poate deschide din nou.")) return;
        setBusy(true); const r = await send(`/api/crm/statements/${id}`, "DELETE"); setBusy(false);
        if (!r.ok) return setMsg(r.error);
        location.href = back;
      }}>Șterge</button>}
      {msg && <span role="alert" className="errTxt">{msg}</span>}
      {reopen && <ReasonModal title={status === "issued" ? "Redeschide borderoul emis" : "Înapoi în curs"} label="Redeschide" onClose={() => setReopen(false)}
        hint={status === "issued" ? "Numărul rămâne; după modificări îl emiți din nou." : "Liniile neajustate se calculează din nou din date; ajustările rămân."}
        onSave={async (why) => { const r = await send(`/api/crm/statements/${id}`, "PATCH", { action: "reopen", reason: why }); if (!r.ok) return r.error; location.reload(); return null; }} />}
    </>
  );
}

export function NotesEdit({ id, notes, canEdit }: { id: string; notes: string | null; canEdit: boolean }) {
  const [v, setV] = useState(notes ?? "");
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  if (!canEdit) return notes ? <p className="stNotes">{notes}</p> : null;
  if (!open) return <p className="stNotes">{notes || <span className="muted">fără observații</span>} <button type="button" className="linkBtn" onClick={() => setOpen(true)}>{notes ? "modifică" : "adaugă"}</button></p>;
  return (
    <div className="field">
      <textarea className="textarea" rows={3} value={v} onChange={(e) => setV(e.target.value)} placeholder="Observații pe borderou (le vede și persoana)" />
      <span className="actions" style={{ marginTop: 6 }}>
        <button type="button" className="btn btnNavy btnSm" onClick={async () => { const r = await send(`/api/crm/statements/${id}`, "PATCH", { notes: v }); if (!r.ok) return setMsg(r.error); location.reload(); }}>Salvează</button>
        <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)}>Renunță</button>
      </span>
      {msg && <small className="errTxt">{msg}</small>}
    </div>
  );
}

/** Opens the statement of a party for a month (makes it if it is not there yet) and goes to it. */
export function OpenStatement({ party, period, base, label = "Deschide", cls = "btn btnGhost btnSm" }: { party: string; period: string; base: string; label?: string; cls?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <>
      <button type="button" className={cls} disabled={busy} onClick={async () => {
        setBusy(true); setMsg("");
        const r = await send("/api/crm/statements", "POST", { party, period });
        setBusy(false);
        if (!r.ok || !r.data.id) return setMsg(r.error);
        location.href = `${base}/${r.data.id}`;
      }}>{busy ? "…" : label}</button>
      {msg && <small className="errTxt">{msg}</small>}
    </>
  );
}

type Choice = { party: string; name: string; sub: string };
/** A statement for anyone (also without a rule): pick the person / contract and the month. */
export function NewStatement({ period, base, users, contracts, collabs }: { period: string; base: string; users: Choice[]; contracts: Choice[]; collabs: Choice[] }) {
  const [open, setOpen] = useState(false);
  const [party, setParty] = useState("");
  const [month, setMonth] = useState(period);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <>
      <button type="button" className="btn btnNavy btnSm" onClick={() => setOpen(true)}>+ Borderou nou</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="nsT" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox">
            <div className="cardHead"><h2 id="nsT">Borderou nou</h2><button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)} aria-label="Închide">×</button></div>
            <label className="field">Pentru cine
              <select className="select" value={party} onChange={(e) => setParty(e.target.value)}>
                <option value="">— alege —</option>
                <optgroup label="Plată evaluator">{users.map((c) => <option key={c.party} value={c.party}>{c.name} · {c.sub}</option>)}</optgroup>
                <optgroup label="De încasat · contract cadru">{contracts.map((c) => <option key={c.party} value={c.party}>{c.name} · {c.sub}</option>)}</optgroup>
                <optgroup label="De încasat · colaborare">{collabs.map((c) => <option key={c.party} value={c.party}>{c.name} · {c.sub}</option>)}</optgroup>
              </select>
            </label>
            <label className="field">Luna<input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
            <p className="hint" style={{ margin: 0 }}>Fără o regulă, borderoul ia toate cotele și tarifele persoanei (rapoartele predate în lună). Regulile le setezi din „Reguli”.</p>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="button" className="btn btnNavy" disabled={busy || !party || !/^\d{4}-\d{2}$/.test(month)} onClick={async () => {
                setBusy(true); setMsg("");
                const r = await send("/api/crm/statements", "POST", { party, period: month });
                setBusy(false);
                if (!r.ok || !r.data.id) return setMsg(r.error);
                location.href = `${base}/${r.data.id}`;
              }}>{busy ? "…" : "Deschide borderoul"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
