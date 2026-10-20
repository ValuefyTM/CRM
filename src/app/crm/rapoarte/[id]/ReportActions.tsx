"use client";

import { DOC_KINDS } from "@/lib/doc-kinds";
import { PersonPicker, type PickPerson } from "@/components/PersonPicker";
import { dutyIn, type Duty } from "@/lib/labels";
import { useEffect, useRef, useState } from "react";
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
const REOPEN: [string, string, string] = ["Motivul redeschiderii", "ex. banca cere corectarea suprafeței", "Redeschide raportul"];
const NEEDS_REASON: Record<string, [label: string, placeholder: string, button: string]> = {
  suspended: ["Motivul suspendării", "ex. așteptăm actele de la client", "Suspendă raportul"],
  cancelled: ["Motivul anulării", "ex. clientul a renunțat la credit", "Anulează raportul"],
};

/** "Schimbă status" in the report header: a sheet (from the bottom on a phone) with one big button per status. */
/** `locked`: the report is finished; it can only be reopened ("În lucru"), with the reason. */
/** `finish`: "Finalizat" opens the delivery (a link) or tells why it cannot yet (a message); null: no delivery step (already delivered). */
export function StatusButton({ id, status, reason, locked = false, finish = null }: { id: string; status: string; reason: string | null; locked?: boolean; finish?: string | null }) {
  const cur = locked ? "done" : status === "draft" ? "in_progress" : status;
  const why_ = (s: string) => (locked && s === "in_progress" ? REOPEN : NEEDS_REASON[s]);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const save = async (s: string) => {
    if (why_(s) && !why.trim()) return setMsg("Scrie motivul.");
    setBusy(s); setMsg("");
    const error = await patch(id, { status: s, reason: why });
    setBusy(null);
    if (error) return setMsg(error);
    location.reload();
  };
  const choose = (s: string) => {
    // Finishing is the delivery: number, date, the value of each asset (lei, euro, approach).
    if (s === "done" && s !== cur && finish) {
      if (finish.startsWith("/")) { location.href = finish; return; }
      setPick(null); setMsg(finish); return;
    }
    if (why_(s)) { setPick(s); setWhy(s === cur ? reason ?? "" : ""); setMsg(""); return; }
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
              {STATUSES.filter(([k]) => !locked || k === "in_progress" || k === cur).map(([k, l]) => (
                <button key={k} type="button" className={`stChoice st-${k}${k === cur ? " on" : ""}${k === pick ? " picked" : ""}`} aria-pressed={k === cur} disabled={!!busy || (locked && k === cur)}
                  onClick={() => choose(k)}>
                  <i aria-hidden />
                  <span><b>{l}</b><small>{STATUS_HINT[k]}</small></span>
                  {k === cur && <em className="stCur">✓ status actual</em>}
                  {busy === k && <em>Se salvează…</em>}
                </button>
              ))}
            </div>
            {locked && <p className="hint">Raportul este finalizat și blocat. Îl poți redeschide (În lucru) cu motivul; după modificări se predă din nou.</p>}
            {pick && why_(pick) && (
              <div className="stReason">
                <label className="field">{why_(pick)![0]}<textarea className="textarea" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} autoFocus placeholder={why_(pick)![1]} /></label>
                <small className="muted">Motivul rămâne pe raport și apare în mesajele echipei.</small>
                <button type="button" className={`btn ${pick === "cancelled" ? "btnDanger" : "btnNavy"}`} disabled={!!busy || !why.trim()} onClick={() => save(pick)}>
                  {busy ? "Se salvează…" : pick === cur ? "Actualizează motivul" : why_(pick)![2]}
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

export function DeleteDoc({ id, doc, name, missing = false }: { id: string; doc: string; name: string; missing?: boolean }) {
  return (
    <button type="button" className="linkBtn danger" onClick={async () => {
      if (!confirm(missing ? `Anulezi cererea pentru „${name}”? Actul nu mai apare ca lipsă și nu mai blochează predarea.` : `Ștergi „${name}”?`)) return;
      const error = await send(`/api/crm/reports/${id}/documents?doc=${doc}`, { method: "DELETE" });
      if (error) return alert(error);
      location.reload();
    }}>{missing ? "Anulează" : "Șterge"}</button>
  );
}

export type DeliverAsset = { id: string; label: string; sub: string | null; value: number | null; approach: string | null };
const APPROACHES: [string, string][] = [["market", "Piață"], ["income", "Venit"], ["cost", "Cost"]];
const numOf = (s: string) => { const n = parseFloat(s.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
const fmt = (n: number, d = 0) => n.toLocaleString("ro-RO", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * "Predă raportul": the date of the valuation and its result — each asset's value in euro and the approach that gave
 * it; the total is the report's result. The lei value is worked out on the server at the BNR rate of the report's date
 * (never asked). Then "Finalizat" on the report and the order. For portal and website orders the client gets an
 * email with the download link (unless unticked).
 * `values`: the report values something (not an inspection / information note), so the values are required.
 */
export function DeliverButton({ id, ready, number, suggested, notifyTo, assets, values, auto = true, autoOpen = false }: {
  id: string; ready: boolean; number: string | null; suggested: string; notifyTo: string | null; assets: DeliverAsset[]; values: boolean;
  /** VALUEFY's report: the number of its series, automatic (a collaborating firm's is typed). */
  auto?: boolean;
  /** Opened right away (from "Finalizat" or "Livrare raport"). */
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Opened once in the browser (the modal is a portal on document.body, which the server does not have).
  useEffect(() => { if (autoOpen && ready) setOpen(true); }, [autoOpen, ready]);
  const [f, setF] = useState({ number: number ?? suggested, report_date: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" }), notify: !!notifyTo });
  // `value` of an asset here: its value in euro (already given at an earlier attempt)
  const [vals, setVals] = useState<Record<string, { value: string; approach: string }>>(() =>
    Object.fromEntries(assets.map((a) => [a.id, { value: a.value != null ? String(a.value) : "", approach: a.approach ?? "" }])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const total = assets.reduce((s, a) => s + (numOf(vals[a.id]?.value ?? "") ?? 0), 0);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auto && !f.number.trim()) return setMsg("Completează numărul raportului.");
    if (values) {
      for (const a of assets) {
        const v = vals[a.id];
        if (!numOf(v?.value ?? "")) return setMsg(`Completează valoarea (în euro) pentru ${a.label}.`);
        if (!v.approach) return setMsg(`Alege abordarea care a dat valoarea pentru ${a.label}.`);
      }
    }
    setBusy(true); setMsg("");
    const error = await patch(id, { delivered: true, ...f, ...(values ? { values: assets.map((a) => ({ id: a.id, eur: numOf(vals[a.id].value), approach: vals[a.id].approach })) } : {}) });
    setBusy(false);
    if (error) return setMsg(error);
    location.reload();
  };
  return (
    <>
      <button type="button" className="btn btnGold btnSm" style={{ alignSelf: "flex-start" }} disabled={!ready} title={ready ? undefined : "Încarcă întâi PDF-ul semnat"} onClick={() => setOpen(true)}>Predă raportul</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="delTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className={`vfModalBox${values && assets.length > 1 ? " wide" : ""}`} onSubmit={submit} noValidate>
            <h2 id="delTitle">Predă raportul</h2>
            <p className="hint" style={{ margin: 0 }}>Raportul devine Finalizat, iar comanda se închide.{values ? " Rezultatul evaluării, în euro, se trece pe fiecare bun și se adună." : ""}</p>
            <div className="formRow">
              <label className="field">Nr. raport<input className="input mono" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} readOnly={!!number || auto} />
                {auto && !number && <small className="muted">Automat, următorul din seria VALUEFY</small>}</label>
              <label className="field">Data evaluării (data raportului)<input className="input" type="date" value={f.report_date} onChange={(e) => setF({ ...f, report_date: e.target.value })} /></label>
            </div>
            {values && (
              <div className="delValues">
                <table className="table delTable">
                  <thead><tr><th>Bun</th><th style={{ textAlign: "right" }}>Valoare (€)</th><th>Abordare</th></tr></thead>
                  <tbody>
                    {assets.map((a) => {
                      const v = vals[a.id];
                      return (
                        <tr key={a.id}>
                          <td><b>{a.label}</b>{a.sub && <div className="muted">{a.sub}</div>}</td>
                          <td style={{ textAlign: "right" }}><span className="nwSuffix" style={{ justifyContent: "flex-end" }}><input className="input mono num" inputMode="decimal" style={{ width: 130, textAlign: "right" }} value={v.value} aria-label={`Valoare ${a.label} în euro`}
                            onChange={(e) => setVals({ ...vals, [a.id]: { ...v, value: e.target.value } })} /><em>€</em></span></td>
                          <td><select className="select" value={v.approach} aria-label={`Abordare ${a.label}`} onChange={(e) => setVals({ ...vals, [a.id]: { ...v, approach: e.target.value } })}>
                            <option value="">— alege —</option>{APPROACHES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {assets.length > 1 && (
                    <tfoot><tr><th>Rezultat evaluare</th><th style={{ textAlign: "right" }} className="mono num">{total ? `${fmt(total)} €` : "—"}</th><th /></tr></tfoot>
                  )}
                </table>
                {assets.length === 1 && <div className="field">Rezultat evaluare<b className="mono num" style={{ fontSize: 18 }}>{total ? `${fmt(total)} €` : "—"}</b></div>}
                <p className="hint" style={{ margin: 0 }}>Echivalentul în lei se calculează singur, la cursul BNR din data raportului.</p>
              </div>
            )}
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
        </div>, document.body)}
    </>
  );
}

/** The number of a report issued on a collaborating firm (the firm's own numbering): a small pencil next to it. */
export function ReportNumberEdit({ id, number, firm }: { id: string; number: string | null; firm: string }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(number ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.trim()) return setMsg("Scrie numărul raportului.");
    setBusy(true); setMsg("");
    const error = await patch(id, { number: v.trim() });
    setBusy(false);
    if (error) return setMsg(error);
    location.reload();
  };
  return (
    <>
      <button type="button" className="numEdit" title="Modifică numărul raportului" aria-label="Modifică numărul raportului" onClick={() => { setV(number ?? ""); setMsg(""); setOpen(true); }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
      </button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="numEditT" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="vfModalBox" style={{ width: "min(420px, 100%)" }} onSubmit={save} noValidate>
            <h2 id="numEditT">Numărul raportului</h2>
            <p className="hint" style={{ margin: 0 }}>Raportul e emis pe <b>{firm}</b>: numărul îl dă firma colaboratoare.</p>
            <label className="field">Nr. raport<input className="input mono" value={v} onChange={(e) => setV(e.target.value)} maxLength={30} autoFocus /></label>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="submit" className="btn btnGold" disabled={busy}>{busy ? "Se salvează…" : "Salvează"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </form>
        </div>, document.body)}
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
      <div style={{ minWidth: 280 }}><PersonPicker label="Persoana" value={user} onChange={setUser} people={role === "assistant" ? people : people.filter((x) => dutyIn(x.duties, role as Duty))} placeholder="Alege persoana…" /></div>
      <select className="select" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Rol">{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <button type="submit" className="btn btnNavy btnSm">Adaugă</button>
      <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)}>Renunță</button>
      {msg && <span role="alert" className="error inlineErr">{msg}</span>}
    </form>
  );
}

/** "Scoate" a team member; someone with several roles (evaluator and inspector) is taken out of one role or of all. */
export function RemoveMember({ id, user, roles, name }: { id: string; user: string; roles: { role: string; label: string }[]; name: string }) {
  const remove = async (list: { role: string; label: string }[], what: string) => {
    if (!confirm(`Scoți pe ${name} ${what}?`)) return;
    for (const x of list) {
      const error = await send(`/api/crm/reports/${id}/members?user=${user}&role=${x.role}`, { method: "DELETE" });
      if (error) return alert(error);
    }
    location.reload();
  };
  if (roles.length < 2) return <button type="button" className="linkBtn danger" onClick={() => remove(roles, "din echipa raportului")}>Scoate</button>;
  return (
    <details className="rmMenu">
      <summary className="linkBtn danger">Scoate</summary>
      <div className="rmList">
        {roles.map((x) => <button key={x.role} type="button" onClick={() => remove([x], `din rolul de ${x.label}`)}>ca {x.label}</button>)}
        <button type="button" className="danger" onClick={() => remove(roles, "din echipa raportului")}>din toate rolurile</button>
      </div>
    </details>
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
