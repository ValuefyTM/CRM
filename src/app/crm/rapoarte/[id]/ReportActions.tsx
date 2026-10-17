"use client";

import { DOC_KINDS } from "@/lib/doc-kinds";
import { PersonPicker, type PickPerson } from "@/components/PersonPicker";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

// "Draft" is shown as "În lucru" (a report being worked on): one choice, not two that look the same.
const STATUSES: [string, string][] = [["in_progress", "În lucru"], ["suspended", "Suspendat"], ["done", "Finalizat"], ["cancelled", "Anulat"]];

async function send(url: string, init: RequestInit) {
  const r = await fetch(url, init).catch(() => null);
  const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
  return r?.ok ? null : d?.error || "Nu am putut salva. Încearcă din nou.";
}
const patch = (id: string, body: object) => send(`/api/crm/reports/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const STATUS_HINT: Record<string, string> = {
  in_progress: "Raportul se lucrează (inspecție, redactare, verificare).",
  suspended: "Lucrul e oprit temporar; scrii motivul.",
  done: "Raportul e gata și predat.",
  cancelled: "Lucrarea nu se mai face; scrii motivul.",
};
// Suspending or cancelling asks for the reason (kept on the report and posted in the team's messages).
const NEEDS_REASON: Record<string, [label: string, placeholder: string, button: string]> = {
  suspended: ["Motivul suspendării", "ex. așteptăm actele de la client", "Suspendă raportul"],
  cancelled: ["Motivul anulării", "ex. clientul a renunțat la credit", "Anulează raportul"],
};

/** "Schimbă status" in the report header: a sheet (from the bottom on a phone) with one big button per status. */
export function StatusButton({ id, status, reason }: { id: string; status: string; reason: string | null }) {
  const cur = status === "draft" ? "in_progress" : status;
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const save = async (s: string) => {
    if (NEEDS_REASON[s] && !why.trim()) return setMsg("Scrie motivul.");
    setBusy(s); setMsg("");
    const error = await patch(id, { status: s, reason: why });
    setBusy(null);
    if (error) return setMsg(error);
    location.reload();
  };
  const choose = (s: string) => {
    if (NEEDS_REASON[s]) { setPick(s); setWhy(s === cur ? reason ?? "" : ""); setMsg(""); return; }
    if (s === cur) return setOpen(false);
    save(s);
  };
  const curLabel = STATUSES.find(([k]) => k === cur)?.[1] ?? cur;
  return (
    <>
      <button type="button" className="btn btnOnNavy btnSm" onClick={() => { setOpen(true); setPick(null); setMsg(""); }}>Schimbă status</button>
      {open && createPortal(
        <div className="vfModal sheet" role="dialog" aria-modal="true" aria-labelledby="stTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox">
            <div className="cardHead"><h2 id="stTitle">Statusul raportului</h2><button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)} aria-label="Închide">×</button></div>
            <p className="stNow">Acum: <span className={`stNowPill st-${cur}`}><i />{curLabel}</span>{(cur === "suspended" || cur === "cancelled") && reason ? <small> · {reason}</small> : null}</p>
            <div className="stChoices">
              {STATUSES.map(([k, l]) => (
                <button key={k} type="button" className={`stChoice st-${k}${k === cur ? " on" : ""}${k === pick ? " picked" : ""}`} aria-pressed={k === cur} disabled={!!busy}
                  onClick={() => choose(k)}>
                  <i aria-hidden />
                  <span><b>{l}</b><small>{STATUS_HINT[k]}</small></span>
                  {k === cur && <em className="stCur">✓ status actual</em>}
                  {busy === k && <em>Se salvează…</em>}
                </button>
              ))}
            </div>
            {pick && NEEDS_REASON[pick] && (
              <div className="stReason">
                <label className="field">{NEEDS_REASON[pick][0]}<textarea className="textarea" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} autoFocus placeholder={NEEDS_REASON[pick][1]} /></label>
                <small className="muted">Motivul rămâne pe raport și apare în mesajele echipei.</small>
                <button type="button" className={`btn ${pick === "cancelled" ? "btnDanger" : "btnNavy"}`} disabled={!!busy || !why.trim()} onClick={() => save(pick)}>
                  {busy ? "Se salvează…" : pick === cur ? "Actualizează motivul" : NEEDS_REASON[pick][2]}
                </button>
              </div>
            )}
            {msg && <div role="alert" className="error">{msg}</div>}
          </div>
        </div>, document.body)}
    </>
  );
}

export function NotesEditor({ id, notes }: { id: string; notes: string | null }) {
  const [v, setV] = useState(notes ?? "");
  const [saved, setSaved] = useState(notes ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="notesForm" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMsg(null);
      const error = await patch(id, { notes: v });
      setBusy(false);
      if (error) return setMsg({ ok: false, text: error });
      setSaved(v); setMsg({ ok: true, text: "Notele au fost salvate." });
    }}>
      <textarea className="textarea" rows={6} value={v} onChange={(e) => { setV(e.target.value); setMsg(null); }} placeholder="Ce trebuie să știe echipa despre acest raport: termene, documente cerute, acces la imobil…" aria-label="Note interne" />
      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
      {v !== saved && <button type="submit" className="btn btnNavy btnSm" style={{ alignSelf: "flex-start" }} disabled={busy}>{busy ? "Se salvează…" : "Salvează notele"}</button>}
    </form>
  );
}

/** File picker that uploads right away. `doc` fills a document that was marked as missing. */
export function UploadButton({ id, kind = "source", doc, label, className = "btn btnGhost btnSm", accept, docType, asset }: {
  id: string; kind?: "source" | "final"; doc?: string; label: string; className?: string; accept?: string; docType?: "cf" | "rlv"; asset?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <>
      <input ref={input} type="file" hidden accept={accept ?? (kind === "final" ? ".pdf" : ".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx,.xls,.xlsx,.zip")} onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setBusy(true); setMsg("");
        const body = new FormData();
        body.set("file", f); body.set("kind", kind);
        if (doc) body.set("doc", doc);
        if (docType) body.set("doc_type", docType);
        if (asset) body.set("asset", asset);
        const error = await send(`/api/crm/reports/${id}/documents`, { method: "POST", body });
        setBusy(false); e.target.value = "";
        if (error) return setMsg(error);
        location.reload();
      }} />
      <button type="button" className={className} disabled={busy} onClick={() => input.current?.click()}>{busy ? "Se încarcă…" : label}</button>
      {msg && <span role="alert" className="error inlineErr">{msg}</span>}
    </>
  );
}

/** Drop zone for the signed final PDF. */
export function FinalDrop({ id }: { id: string }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setMsg("");
    const body = new FormData();
    body.set("file", f); body.set("kind", "final");
    const error = await send(`/api/crm/reports/${id}/documents`, { method: "POST", body });
    setBusy(false);
    if (error) return setMsg(error);
    location.reload();
  };
  return (
    <>
      <button type="button" className={`dropzone${over ? " over" : ""}`} disabled={busy} onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files?.[0]); }}>
        <b>{busy ? "Se încarcă…" : "Fișierul final al raportului nu este încărcat"}</b>
        <span className="mono">PDF semnat · trage fișierul aici sau apasă</span>
      </button>
      <input ref={input} type="file" accept=".pdf" hidden onChange={(e) => upload(e.target.files?.[0])} />
      {msg && <div role="alert" className="error">{msg}</div>}
    </>
  );
}

export function MissingDoc({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  if (!open) return <button type="button" className="linkBtn" onClick={() => setOpen(true)}>+ Marchează un document lipsă</button>;
  return (
    <form className="inlineForm" onSubmit={async (e) => {
      e.preventDefault();
      const error = await send(`/api/crm/reports/${id}/documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ missing: name }) });
      if (error) return setMsg(error);
      location.reload();
    }}>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Extras CF 284120 (garaj)" aria-label="Document lipsă" autoFocus />
      <button type="submit" className="btn btnNavy btnSm">Adaugă</button>
      <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)}>Renunță</button>
      {msg && <span role="alert" className="error inlineErr">{msg}</span>}
    </form>
  );
}

/** CF / RLV / other: what a source document is, so the inspector gets it in the inspections app. */
export function DocTypeSelect({ id, doc, value, assets }: { id: string; doc: string; value: string; assets: { id: string; label: string }[] | null }) {
  const [v, setV] = useState(value);
  return (
    <select className="select selectSm" aria-label="Tip document" value={v} onChange={async (e) => {
      const next = e.target.value;
      const [type, asset] = next.split(":");
      setV(next);
      const error = await send(`/api/crm/reports/${id}/documents`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc, doc_type: type, asset: asset || null }) });
      if (error) { setV(value); alert(error); }
    }}>
      {!value.includes(":") && <option value="other">Alte acte</option>}
      {DOC_KINDS.flatMap(([t, l]) => [
        <option key={t} value={`${t}:`}>{l}{assets && assets.length > 1 ? " · toate bunurile" : ""}</option>,
        ...(assets && assets.length > 1 ? assets.map((x) => <option key={`${t}${x.id}`} value={`${t}:${x.id}`}>{l} · {x.label}</option>) : []),
      ])}
    </select>
  );
}

export function DeleteDoc({ id, doc, name }: { id: string; doc: string; name: string }) {
  return (
    <button type="button" className="linkBtn danger" onClick={async () => {
      if (!confirm(`Ștergi „${name}”?`)) return;
      const error = await send(`/api/crm/reports/${id}/documents?doc=${doc}`, { method: "DELETE" });
      if (error) return alert(error);
      location.reload();
    }}>Șterge</button>
  );
}

/**
 * "Predă raportul": number and date of the report, then "Finalizat" on the report and the order. For portal and
 * website orders the client gets an email with the download link (unless unticked).
 */
export function DeliverButton({ id, ready, number, suggested, notifyTo }: { id: string; ready: boolean; number: string | null; suggested: string; notifyTo: string | null }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ number: number ?? suggested, report_date: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" }), notify: !!notifyTo });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.number.trim()) return setMsg("Completează numărul raportului.");
    setBusy(true); setMsg("");
    const error = await patch(id, { delivered: true, ...f });
    setBusy(false);
    if (error) return setMsg(error);
    location.reload();
  };
  return (
    <>
      <button type="button" className="btn btnGold btnSm" style={{ alignSelf: "flex-start" }} disabled={!ready} title={ready ? undefined : "Încarcă întâi PDF-ul semnat"} onClick={() => setOpen(true)}>Predă raportul</button>
      {open && (
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="delTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="vfModalBox" onSubmit={submit}>
            <h2 id="delTitle">Predă raportul</h2>
            <p className="hint">Raportul devine Finalizat, iar comanda se închide.</p>
            <div className="formRow">
              <label className="field">Nr. raport<input className="input mono" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} readOnly={!!number} /></label>
              <label className="field">Data raportului<input className="input" type="date" value={f.report_date} onChange={(e) => setF({ ...f, report_date: e.target.value })} /></label>
            </div>
            {notifyTo ? (
              <label className="check"><input type="checkbox" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} />
                <span>Anunță clientul pe email (<b>{notifyTo}</b>) că raportul e gata, cu linkul de descărcare</span></label>
            ) : <p className="hint">Comanda nu vine din portal sau de pe site: predarea către bancă / client o faci pe canalul obișnuit.</p>}
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="submit" className="btn btnNavy" disabled={busy}>{busy ? "Se salvează…" : "Predă raportul"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/** Working stage of the report: start drafting (also without an inspection), send to the verifier, or go back. */
export function StageActions({ id, stage, hasVerifier }: { id: string; stage: string; hasVerifier: boolean }) {
  const [busy, setBusy] = useState(false);
  const go = async (next: string | null, ask?: string) => {
    if (ask && !confirm(ask)) return;
    setBusy(true);
    const error = await patch(id, { stage: next });
    setBusy(false);
    if (error) return alert(error);
    location.reload();
  };
  if (stage === "delivered") return null;
  return (
    <span className="actions" style={{ gap: 8 }}>
      {stage === "inspection" && <button type="button" className="linkBtn" disabled={busy} onClick={() => go("drafting", "Treci raportul la redactare fără să aștepți inspecția?")}>Începe redactarea</button>}
      {stage === "drafting" && <button type="button" className="btn btnNavy btnSm" disabled={busy} onClick={() => go("review")}>{hasVerifier ? "Trimite la verificare" : "Marchează în verificare"}</button>}
      {stage === "review" && <button type="button" className="linkBtn" disabled={busy} onClick={() => go("drafting")}>← Înapoi la redactare</button>}
    </span>
  );
}

/** The verifier: finish the review, or send the report back to the main evaluator with what to fix. */
export function VerifyActions({ id, verified }: { id: string; verified: string | null }) {
  const [back, setBack] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const go = async (stage: "verified" | "back") => {
    if (stage === "back" && !comment.trim()) return setMsg("Scrie ce trebuie corectat.");
    setBusy(true);
    const error = await patch(id, { stage, comment });
    setBusy(false);
    if (error) return setMsg(error);
    location.reload();
  };
  if (verified) return <span className="pill pillOk"><i />Verificat {verified}</span>;
  if (back) {
    return (
      <form className="inlineForm" onSubmit={(e) => { e.preventDefault(); go("back"); }}>
        <textarea className="textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ce trebuie corectat (îl primește evaluatorul principal)" aria-label="Comentariu pentru evaluator" style={{ minWidth: 260 }} />
        <button type="submit" className="btn btnNavy btnSm" disabled={busy}>Întoarce la evaluator</button>
        <button type="button" className="btn btnGhost btnSm" onClick={() => { setBack(false); setMsg(""); }}>Renunță</button>
        {msg && <span role="alert" className="error inlineErr">{msg}</span>}
      </form>
    );
  }
  return (
    <span className="actions" style={{ gap: 8 }}>
      <button type="button" className="btn btnNavy btnSm" disabled={busy} onClick={() => go("verified")}>Finalizează verificarea</button>
      <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => setBack(true)}>Întoarce cu comentariu</button>
      {msg && <span role="alert" className="error inlineErr">{msg}</span>}
    </span>
  );
}

const ROLES: [string, string][] = [["evaluator", "Evaluator"], ["inspector", "Inspector"], ["verifier", "Verificator"], ["assistant", "Asistent"]];

export function AddMember({ id, people }: { id: string; people: PickPerson[] }) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState("");
  const [role, setRole] = useState("evaluator");
  const [msg, setMsg] = useState("");
  if (!open) return <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(true)}>+ Adaugă membru</button>;
  return (
    <form className="inlineForm" onSubmit={async (e) => {
      e.preventDefault();
      if (!user) return setMsg("Alege persoana.");
      const error = await send(`/api/crm/reports/${id}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user, role }) });
      if (error) return setMsg(error);
      location.reload();
    }}>
      <div style={{ minWidth: 280 }}><PersonPicker label="Persoana" value={user} onChange={setUser} people={people} placeholder="Alege persoana…" /></div>
      <select className="select" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Rol">{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <button type="submit" className="btn btnNavy btnSm">Adaugă</button>
      <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)}>Renunță</button>
      {msg && <span role="alert" className="error inlineErr">{msg}</span>}
    </form>
  );
}

export function RemoveMember({ id, user, role, name }: { id: string; user: string; role: string; name: string }) {
  return (
    <button type="button" className="linkBtn danger" onClick={async () => {
      if (!confirm(`Scoți pe ${name} din echipa raportului?`)) return;
      const error = await send(`/api/crm/reports/${id}/members?user=${user}&role=${role}`, { method: "DELETE" });
      if (error) return alert(error);
      location.reload();
    }}>Scoate</button>
  );
}

/** Image that falls back to `fallback` (or disappears) when the file cannot be loaded. */
export function SafeImg({ src, alt = "", className, fallback = null }: { src: string; alt?: string; className?: string; fallback?: React.ReactNode }) {
  const [bad, setBad] = useState(false);
  // eslint-disable-next-line @next/next/no-img-element
  return bad ? <>{fallback}</> : <img src={src} alt={alt} className={className} loading="lazy" onError={() => setBad(true)} />;
}

/** "Încasat": marked by hand on the report. */
export function CollectedToggle({ id, collected, at }: { id: string; collected: boolean; at: string | null }) {
  const [on, setOn] = useState(collected);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <span className="collToggle">
      <label className="check" style={{ alignItems: "center" }}>
        <input type="checkbox" checked={on} disabled={busy} onChange={async (e) => {
          const v = e.target.checked; setBusy(true); setErr("");
          const error = await patch(id, { collected: v });
          setBusy(false);
          if (error) setErr(error); else setOn(v);
        }} />
        {on ? <b style={{ color: "var(--ok-text)" }}>Încasat{at && collected ? ` · ${at.slice(0, 10).split("-").reverse().join(".")}` : ""}</b> : "Neîncasat"}
      </label>
      {err && <small className="error">{err}</small>}
    </span>
  );
}
