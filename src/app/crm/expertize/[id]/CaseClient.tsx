"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DONE_STAGE, FILE_BEFORE_DAYS, PARTY_ROLES, STAGES, SUMMON_METHODS, TERM_KINDS, type Case, type Doc, type Folder, type Objective, type Party, type Summon, type Term } from "@/lib/expert-labels";

type Detail = { case: Case; parties: Party[]; terms: Term[]; summons: Summon[]; folders: Folder[]; docs: Doc[] };
const ro = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "—");
const lei = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("ro-RO")} lei`);
const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });

/** The page of a case: stages, then one tab at a time; every change is saved at once and the page reloads its data. */
export function CaseClient({ base, d, tab }: { base: string; d: Detail; tab: string }) {
  const router = useRouter();
  const c = d.case;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const url = `/api/crm/expertize/${c.id}`;
  const send = useCallback(async (method: "PUT" | "POST" | "DELETE", body?: unknown) => {
    setBusy(true); setError("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) { setError(j?.error ?? "Nu am putut salva."); return false; }
    router.refresh();
    return true;
  }, [url, router]);
  const act = (action: string, body: Record<string, unknown> = {}) => send("POST", { action, ...body });
  const TABS: [string, string, number | null][] = [["date", "Date dosar", null], ["parti", "Părți", d.parties.length], ["termene", "Termene", d.terms.filter((t) => !t.done).length],
    ["convocari", "Convocări", d.summons.length], ["acte", "Acte", d.docs.filter((x) => x.current).length], ["onorariu", "Onorariu", null]];
  const remove = async () => {
    if (!confirm(`Ștergi dosarul ${c.number} cu toate părțile, termenele și actele lui? Nu se mai poate recupera.`)) return;
    if (await send("DELETE")) router.push(`${base}/expertize`);
  };
  return (
    <div className="xj">
      <PortalBar c={c} busy={busy} act={act} />
      <div className="xjFlow">
        {STAGES.map((s, i) => (
          <button key={s} type="button" className={i < c.stage ? "done" : i === c.stage ? "now" : ""} disabled={busy} title="Mută dosarul la această etapă" onClick={() => i !== c.stage && send("PUT", { stage: i })}>{s}</button>
        ))}
      </div>
      <nav className="tabs" aria-label="Secțiunile dosarului">
        {TABS.map(([k, l, n]) => <a key={k} href={`${base}/expertize/${c.id}${k === "date" ? "" : `?tab=${k}`}`} aria-current={tab === k ? "page" : undefined}>{l}{n != null ? <small>{n}</small> : null}</a>)}
      </nav>
      {error && <div className="error" role="alert">{error}</div>}
      {tab === "date" && <DataTab c={c} busy={busy} save={(b) => send("PUT", b)} remove={remove} />}
      {tab === "parti" && <PartiesTab list={d.parties} busy={busy} act={act} />}
      {tab === "termene" && <TermsTab list={d.terms} busy={busy} act={act} closed={c.stage >= DONE_STAGE} />}
      {tab === "convocari" && <SummonsTab c={c} list={d.summons} parties={d.parties} busy={busy} act={act} save={(b) => send("PUT", b)} />}
      {tab === "acte" && <DocsTab caseId={c.id} folders={d.folders} docs={d.docs} busy={busy} act={act} onError={setError} />}
      {tab === "onorariu" && <FeeTab c={c} busy={busy} save={(b) => send("PUT", b)} />}
    </div>
  );
}

/** The portal: news to look at (with „am verificat”), monitoring on / off, check now, when it was last checked. */
function PortalBar({ c, busy, act }: { c: Case; busy: boolean; act: Act }) {
  const news = c.portal_changed_at && c.portal_changed_at > (c.portal_ack_at ?? "") ? (c.portal_change ?? "").split("\n").filter(Boolean) : [];
  const when = (iso: string) => new Date(iso).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <>
      {news.length > 0 && (
        <div className="xjNews" role="status">
          <div><b>Noutăți pe portal.just.ro</b> <small>· {when(c.portal_changed_at!)}</small>
            <ul>{news.map((n, i) => <li key={i}>{n}</li>)}</ul>
            <small>Intră în dosarul electronic și verifică dacă ai de făcut ceva: de depus, de răspuns, de convocat.</small></div>
          <button type="button" className="btn btnGold btnSm" disabled={busy} onClick={() => act("portal.ack")}>Am verificat dosarul electronic</button>
        </div>
      )}
      <div className="xjMon">
        <button type="button" className={`btn btnSm ${c.monitor ? "btnNavy" : "btnGhost"}`} aria-pressed={!!c.monitor} disabled={busy} onClick={() => act("portal.monitor", { on: !c.monitor })}>
          <i className={c.monitor ? "on" : ""} />{c.monitor ? "Dosar monitorizat" : "Monitorizează dosarul"}</button>
        <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => act("portal.sync")}>{busy ? "Se verifică…" : "Verifică acum pe portal"}</button>
        <span className="muted">{c.portal_error ? <span style={{ color: "var(--err)" }}>{c.portal_error}</span>
          : c.portal_at ? <>Ultima verificare: {when(c.portal_at)}{c.portal_stage ? ` · stadiu: ${c.portal_stage}` : ""}{c.monitor ? " · se verifică singur, la câteva ore" : ""}</>
          : c.monitor ? "Prima verificare are loc în cel mult 15 minute." : "Monitorizarea preia singură ședințele, soluțiile și termenele noi din portal.just.ro."}</span>
      </div>
    </>
  );
}

type Save = (b: Record<string, unknown>) => Promise<boolean>;
type Act = (action: string, body?: Record<string, unknown>) => Promise<boolean>;

function DataTab({ c, busy, save, remove }: { c: Case; busy: boolean; save: Save; remove: () => void }) {
  const [f, setF] = useState({ number: c.number, court: c.court ?? "", section: c.section ?? "", panel: c.panel ?? "", object: c.object ?? "", specialty: c.specialty ?? "", appointed_on: c.appointed_on ?? "", property: c.property ?? "", notes: c.notes ?? "" });
  const [edit, setEdit] = useState(false);
  let objs: Objective[] = [];
  try { objs = JSON.parse(c.objectives) as Objective[]; } catch { /* none */ }
  const [text, setText] = useState("");
  const [by, setBy] = useState("instanța");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const rows: [string, string | null][] = [["Număr dosar", c.number], ["Instanța", c.court], ["Secția · complet", [c.section, c.panel].filter(Boolean).join(" · ") || null], ["Obiectul dosarului", c.object],
    ["Specializarea", c.specialty], ["Încheiere de numire", c.appointed_on ? ro(c.appointed_on) : null], ["Bunul expertizat", c.property], ["Note", c.notes]];
  return (
    <div className="cols">
      <section className="card">
        <div className="cardHead"><h2>Date dosar</h2>{!edit && <button type="button" className="btn btnGhost btnSm" onClick={() => setEdit(true)}>Modifică</button>}</div>
        {!edit ? <dl className="kv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={k === "Număr dosar" ? "mono" : ""}>{v || <span className="muted">—</span>}</dd></div>)}</dl> : (
          <form className="xjForm" onSubmit={async (e) => { e.preventDefault(); if (await save(f)) setEdit(false); }}>
            <div className="grid2">
              <label className="field"><span>Număr dosar</span><input className="input mono" value={f.number} onChange={set("number")} required /></label>
              <label className="field"><span>Instanța</span><input className="input" value={f.court} onChange={set("court")} /></label>
              <label className="field"><span>Secția</span><input className="input" value={f.section} onChange={set("section")} /></label>
              <label className="field"><span>Completul</span><input className="input" value={f.panel} onChange={set("panel")} /></label>
              <label className="field"><span>Obiectul dosarului</span><input className="input" value={f.object} onChange={set("object")} /></label>
              <label className="field"><span>Specializarea</span><input className="input" value={f.specialty} onChange={set("specialty")} /></label>
              <label className="field"><span>Data încheierii de numire</span><input className="input" type="date" value={f.appointed_on} onChange={set("appointed_on")} /></label>
            </div>
            <label className="field"><span>Bunul expertizat</span><input className="input" value={f.property} onChange={set("property")} /></label>
            <label className="field"><span>Note <small>(doar pentru tine)</small></span><textarea className="input" rows={3} value={f.notes} onChange={set("notes")} /></label>
            <span className="actions"><button type="submit" className="btn btnGold btnSm" disabled={busy}>Salvează</button><button type="button" className="btn btnGhost btnSm" onClick={() => setEdit(false)}>Renunță</button></span>
          </form>
        )}
        {!edit && <button type="button" className="linkBtn xjDanger" onClick={remove} disabled={busy}>Șterge dosarul</button>}
      </section>
      <section className="card">
        <h2>Obiectivele expertizei</h2>
        {objs.length === 0 ? <p className="hint">Niciun obiectiv încă. Adaugă-le cum sunt în încheierea de numire.</p> : (
          <ol className="xjObj">
            {objs.map((o, i) => (
              <li key={i} className={o.done ? "done" : ""}>
                <label className="check"><input type="checkbox" checked={o.done} disabled={busy} onChange={() => save({ objectives: objs.map((x, n) => (n === i ? { ...x, done: !x.done } : x)) })} />
                  <span>{i === 0 && <b className="xjMain">Obiectivul principal</b>}{o.text}<small className="xjBy">stabilit de {o.by || "instanță"}</small></span></label>
                <button type="button" className="linkBtn" aria-label="Șterge obiectivul" disabled={busy} onClick={() => save({ objectives: objs.filter((_, n) => n !== i) })}>✕</button>
              </li>
            ))}
          </ol>
        )}
        <form className="xjInline" onSubmit={async (e) => { e.preventDefault(); if (text.trim() && await save({ objectives: [...objs, { text, done: false, by }] })) setText(""); }}>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Obiectiv nou" aria-label="Obiectiv nou" />
          <select className="input xjBySel" value={by} onChange={(e) => setBy(e.target.value)} aria-label="Stabilit de">{["instanța", "reclamant", "pârât", "intervenient"].map((x) => <option key={x}>{x}</option>)}</select>
          <button type="submit" className="btn btnNavy btnSm" disabled={busy || !text.trim()}>Adaugă</button>
        </form>
        <p className="hint">Bifează un obiectiv când are răspuns în raport.</p>
      </section>
    </div>
  );
}

function PartiesTab({ list, busy, act }: { list: Party[]; busy: boolean; act: Act }) {
  const EMPTY = { id: "", role: "Reclamant", name: "", address: "", phone: "", email: "", lawyer: "", note: "" };
  const [f, setF] = useState<typeof EMPTY | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => (x ? { ...x, [k]: e.target.value } : x));
  return (
    <section className="card">
      <div className="cardHead"><h2>Părți și reprezentanți</h2>{!f && <button type="button" className="btn btnNavy btnSm" onClick={() => setF({ ...EMPTY })}>+ Parte</button>}</div>
      {list.length === 0 && !f && <p className="hint">Nicio parte încă.</p>}
      <div className="xjParties">
        {list.map((p) => (
          <div key={p.id}>
            <span className="xjRole">{p.role}</span><b>{p.name}</b>
            {p.address && <small>{p.address}</small>}
            {(p.phone || p.email) && <small>{[p.phone, p.email].filter(Boolean).join(" · ")}</small>}
            {p.lawyer && <small>repr. {p.lawyer}</small>}
            {p.note && <small>{p.note}</small>}
            <span className="tdActs">
              <button type="button" className="btn btnGhost btnSm" onClick={() => setF({ id: p.id, role: p.role, name: p.name, address: p.address ?? "", phone: p.phone ?? "", email: p.email ?? "", lawyer: p.lawyer ?? "", note: p.note ?? "" })}>Modifică</button>
              <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => confirm(`Scoți partea „${p.name}”?`) && act("party.delete", { id: p.id })}>Șterge</button>
            </span>
          </div>
        ))}
      </div>
      {f && (
        <form className="xjForm xjSub" onSubmit={async (e) => { e.preventDefault(); if (await act("party.save", f)) setF(null); }}>
          <div className="grid2">
            <label className="field"><span>Calitate</span><select className="input" value={f.role} onChange={set("role")}>{[...new Set([...PARTY_ROLES, f.role])].map((r) => <option key={r}>{r}</option>)}</select></label>
            <label className="field"><span>Nume / denumire</span><input className="input" value={f.name} onChange={set("name")} required autoFocus /></label>
            <label className="field"><span>Adresă de citare</span><input className="input" value={f.address} onChange={set("address")} /></label>
            <label className="field"><span>Avocat / reprezentant</span><input className="input" value={f.lawyer} onChange={set("lawyer")} /></label>
            <label className="field"><span>Telefon</span><input className="input" value={f.phone} onChange={set("phone")} /></label>
            <label className="field"><span>E-mail</span><input className="input" type="email" value={f.email} onChange={set("email")} /></label>
          </div>
          <label className="field"><span>Observații</span><input className="input" value={f.note} onChange={set("note")} /></label>
          <span className="actions"><button type="submit" className="btn btnGold btnSm" disabled={busy}>Salvează</button><button type="button" className="btn btnGhost btnSm" onClick={() => setF(null)}>Renunță</button></span>
        </form>
      )}
      <p className="hint">Adresele de aici se folosesc la convocări. Ca tot dosarul, datele părților le vezi doar tu.</p>
    </section>
  );
}

function TermsTab({ list, busy, act, closed }: { list: Term[]; busy: boolean; act: Act; closed: boolean }) {
  const EMPTY = { id: "", on_date: "", at_time: "", kind: "judecata", title: "", note: "", done: false, result: "", with_filing: true };
  const [f, setF] = useState<typeof EMPTY | null>(null);
  const t0 = today();
  const next = list.find((t) => !t.done && t.on_date >= t0)?.id;
  const left = (d: string) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${t0}T12:00:00Z`)) / 864e5);
  return (
    <section className="card">
      <div className="cardHead"><h2>Termene și evenimente</h2>{!f && <button type="button" className="btn btnNavy btnSm" onClick={() => setF({ ...EMPTY })}>+ Termen</button>}</div>
      {f && (
        <form className="xjForm xjSub" onSubmit={async (e) => { e.preventDefault(); if (await act("term.save", f)) setF(null); }}>
          <div className="grid2">
            <label className="field"><span>Ce este</span><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{TERM_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="field"><span>Data</span><input className="input" type="date" value={f.on_date} onChange={(e) => setF({ ...f, on_date: e.target.value })} required /></label>
            <label className="field"><span>Ora <small>(opțional)</small></span><input className="input" type="time" value={f.at_time} onChange={(e) => setF({ ...f, at_time: e.target.value })} /></label>
            <label className="field"><span>Titlu <small>(gol = cel de mai sus)</small></span><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          </div>
          <label className="field"><span>Detalii <small>(sala, ce s-a dispus)</small></span><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          {f.id ? <label className="field"><span>Ce s-a întâmplat la termen</span><input className="input" value={f.result} onChange={(e) => setF({ ...f, result: e.target.value })} placeholder="ex. amânat pentru lipsa raportului" /></label>
            : f.kind === "judecata" && <label className="check"><input type="checkbox" checked={f.with_filing} onChange={(e) => setF({ ...f, with_filing: e.target.checked })} /><span>Adaugă și limita de depunere a raportului, cu {FILE_BEFORE_DAYS} zile înainte</span></label>}
          <label className="check"><input type="checkbox" checked={f.done} onChange={(e) => setF({ ...f, done: e.target.checked })} /><span>Trecut / rezolvat (nu mai dă alerte)</span></label>
          <span className="actions"><button type="submit" className="btn btnGold btnSm" disabled={busy}>Salvează</button><button type="button" className="btn btnGhost btnSm" onClick={() => setF(null)}>Renunță</button></span>
        </form>
      )}
      {list.length === 0 ? <p className="hint">Niciun termen încă.</p> : (
        <ol className="xjTl">
          {list.map((t) => {
            const k = left(t.on_date), late = !t.done && k < 0;
            return (
              <li key={t.id} className={t.done ? "ok" : late ? "bad" : t.id === next ? "next" : ""}>
                <time>{ro(t.on_date)}{t.at_time ? <small>{t.at_time}</small> : null}</time><i />
                <div>
                  <b>{t.title}</b>{t.id === next && <span className="pill pillWarn">următorul · {k === 0 ? "astăzi" : k === 1 ? "mâine" : `în ${k} zile`}</span>}{late && <span className="pill pillErr">depășit cu {-k} {k === -1 ? "zi" : "zile"}</span>}
                  {t.source === "portal" && <span className="pill xjSrc">portal.just.ro</span>}
                  {t.panel && <small>Complet: {t.panel}</small>}
                  {t.solution && <small><span className="pill pillInfo">{t.solution}</span></small>}
                  {t.summary && <small className="xjSum">{t.summary}</small>}
                  {t.doc && <small>Document: {t.doc}{t.doc_no ? ` nr. ${t.doc_no}` : ""}{t.doc_date ? ` din ${ro(t.doc_date)}` : ""} <span className="muted">· îl găsești în dosarul electronic</span></small>}
                  {t.note && <small>{t.note}</small>}{t.result && <small>→ {t.result}</small>}
                  <span className="tdActs">
                    {!t.done ? <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => { const r = prompt("Ce s-a întâmplat la termen? (opțional)") ; if (r !== null) act("term.done", { id: t.id, result: r }); }}>Marchează trecut</button>
                      : <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => act("term.done", { id: t.id, done: false })}>Redeschide</button>}
                    <button type="button" className="btn btnGhost btnSm" onClick={() => setF({ id: t.id, on_date: t.on_date, at_time: t.at_time ?? "", kind: t.kind, title: t.title, note: t.note ?? "", done: !!t.done, result: t.result ?? "", with_filing: false })}>Modifică</button>
                    <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => confirm(`Ștergi „${t.title}” din ${ro(t.on_date)}?`) && act("term.delete", { id: t.id })}>Șterge</button>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="hint">{closed ? "Dosarul este finalizat: termenele nu mai dau alerte." : "Pentru fiecare termen deschis primești alertă în clopoțel, pe telefon și pe e-mail cu 7, 3 și 1 zi înainte și în ziua respectivă."}</p>
    </section>
  );
}

function SummonsTab({ c, list, parties, busy, act, save }: { c: Case; list: Summon[]; parties: Party[]; busy: boolean; act: Act; save: Save }) {
  const EMPTY = { id: "", to_name: "", method: SUMMON_METHODS[0], sent_on: today(), confirmed_on: "", proof: "" };
  const [f, setF] = useState<typeof EMPTY | null>(null);
  const [v, setV] = useState({ visit_on: c.visit_on ?? "", visit_time: c.visit_time ?? "", visit_place: c.visit_place ?? "", visit_done: !!c.visit_done });
  const dirty = v.visit_on !== (c.visit_on ?? "") || v.visit_time !== (c.visit_time ?? "") || v.visit_place !== (c.visit_place ?? "") || v.visit_done !== !!c.visit_done;
  const missing = parties.filter((p) => !list.some((s) => s.to_name === p.name));
  return (
    <>
      <section className="card">
        <h2>Constatarea la fața locului</h2>
        <div className="grid2">
          <label className="field"><span>Data</span><input className="input" type="date" value={v.visit_on} onChange={(e) => setV({ ...v, visit_on: e.target.value })} /></label>
          <label className="field"><span>Ora</span><input className="input" type="time" value={v.visit_time} onChange={(e) => setV({ ...v, visit_time: e.target.value })} /></label>
        </div>
        <label className="field"><span>Locul</span><input className="input" value={v.visit_place} onChange={(e) => setV({ ...v, visit_place: e.target.value })} placeholder={c.property ?? "adresa imobilului"} /></label>
        <label className="check"><input type="checkbox" checked={v.visit_done} onChange={(e) => setV({ ...v, visit_done: e.target.checked })} /><span>Constatarea a fost efectuată</span></label>
        {dirty && <button type="button" className="btn btnGold btnSm" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => save(v)}>Salvează</button>}
      </section>
      <section className="card">
        <div className="cardHead"><h2>Convocări</h2>
          <span className="actions">
            {missing.length > 0 && !f && <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => act("summon.all", { method: SUMMON_METHODS[0], sent_on: today() })}>Convoacă toate părțile ({missing.length})</button>}
            {!f && <button type="button" className="btn btnNavy btnSm" onClick={() => setF({ ...EMPTY })}>+ Convocare</button>}
          </span>
        </div>
        {f && (
          <form className="xjForm xjSub" onSubmit={async (e) => { e.preventDefault(); if (await act("summon.save", f)) setF(null); }}>
            <div className="grid2">
              <label className="field"><span>Cine este convocat</span><input className="input" value={f.to_name} onChange={(e) => setF({ ...f, to_name: e.target.value })} list="xj-parties" required autoFocus />
                <datalist id="xj-parties">{parties.flatMap((p) => [p.name, p.lawyer]).filter(Boolean).map((n) => <option key={n} value={n!} />)}</datalist></label>
              <label className="field"><span>Cum</span><select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{[...new Set([...SUMMON_METHODS, f.method])].map((m) => <option key={m}>{m}</option>)}</select></label>
              <label className="field"><span>Trimisă la</span><input className="input" type="date" value={f.sent_on} onChange={(e) => setF({ ...f, sent_on: e.target.value })} /></label>
              <label className="field"><span>Dovada primirii la <small>(gol = încă neprimită)</small></span><input className="input" type="date" value={f.confirmed_on} onChange={(e) => setF({ ...f, confirmed_on: e.target.value })} /></label>
            </div>
            <label className="field"><span>Dovada <small>(nr. recomandată, observații)</small></span><input className="input" value={f.proof} onChange={(e) => setF({ ...f, proof: e.target.value })} /></label>
            <span className="actions"><button type="submit" className="btn btnGold btnSm" disabled={busy}>Salvează</button><button type="button" className="btn btnGhost btnSm" onClick={() => setF(null)}>Renunță</button></span>
          </form>
        )}
        {list.length === 0 ? <p className="hint">Nicio convocare încă. „Convoacă toate părțile” adaugă câte un rând pentru fiecare parte, cu data de azi.</p> : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Cine</th><th>Cum</th><th>Trimisă</th><th>Dovada primirii</th><th /></tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.to_name}</b></td><td>{s.method}</td><td className="mono">{ro(s.sent_on)}</td>
                    <td>{s.confirmed_on ? <span className="pill pillOk">primită {ro(s.confirmed_on)}</span> : <span className="pill pillWarn">neprimită încă</span>}{s.proof ? <div className="muted">{s.proof}</div> : null}</td>
                    <td><span className="tdActs">
                      {!s.confirmed_on && <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => act("summon.save", { ...s, confirmed_on: today() })}>Primită azi</button>}
                      <button type="button" className="btn btnGhost btnSm" onClick={() => setF({ id: s.id, to_name: s.to_name, method: s.method, sent_on: s.sent_on ?? "", confirmed_on: s.confirmed_on ?? "", proof: s.proof ?? "" })}>Modifică</button>
                      <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => confirm(`Ștergi convocarea pentru „${s.to_name}”?`) && act("summon.delete", { id: s.id })}>Șterge</button>
                    </span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">Dovezile de comunicare (confirmări de primire, e-mailuri) le pui în folderul „Convocări și confirmări” de la Acte.</p>
      </section>
    </>
  );
}

function FolderIcon({ full }: { full: boolean }) {
  return <svg viewBox="0 0 30 26" aria-hidden="true"><path d="M1 5a3 3 0 0 1 3-3h7l3 3h12a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3z" fill={full ? "var(--acc)" : "none"} stroke="var(--acc)" strokeWidth="1.5" /></svg>;
}

/** The documents as folders (like a report's): open a folder, drop files on it or in it, make folders; a same-named file becomes a new version. */
function DocsTab({ caseId, folders, docs, busy, act, onError }: { caseId: string; folders: Folder[]; docs: Doc[]; busy: boolean; act: Act; onError: (t: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [up, setUp] = useState("");
  const [versions, setVersions] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const folder = folders.find((f) => f.id === open) ?? null;
  const current = docs.filter((d) => d.current);
  const upload = async (folderId: string, files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    onError(""); setUp(`Se încarcă ${list.length} ${list.length === 1 ? "fișier" : "fișiere"}…`);
    const fd = new FormData();
    fd.set("folder", folderId);
    list.forEach((f) => fd.append("file", f));
    const r = await fetch(`/api/crm/expertize/${caseId}/docs`, { method: "POST", body: fd }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { error?: string; errors?: string[] };
    setUp("");
    if (!r?.ok) onError(j?.error ?? "Nu am putut încărca."); else if (j.errors?.length) onError(j.errors.join(" "));
    router.refresh();
  };
  const drop = (folderId: string) => ({
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(folderId); } },
    onDragLeave: () => setOver(null),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(null); upload(folderId, e.dataTransfer.files); },
  });
  const newFolder = async () => { const n = prompt("Numele folderului nou"); if (n?.trim()) await act("folder.add", { name: n }); };
  const src = (d: Doc, dl = false) => `/api/crm/expertize/${caseId}/docs/${d.id}${dl ? "?dl=1" : ""}`;

  if (!folder) return (
    <section className="card">
      <div className="cardHead"><h2>Acte</h2><span className="actions">{up && <span className="muted">{up}</span>}<button type="button" className="btn btnNavy btnSm" disabled={busy} onClick={newFolder}>+ Folder nou</button></span></div>
      <div className="xjFolders">
        {folders.map((f) => {
          const n = current.filter((d) => d.folder_id === f.id).length;
          return (
            <button key={f.id} type="button" className={`xjFolder${over === f.id ? " over" : ""}${n ? "" : " empty"}`} onClick={() => setOpen(f.id)} {...drop(f.id)}>
              <FolderIcon full={n > 0} /><b>{f.name}</b><small>{n ? `${n} ${n === 1 ? "fișier" : "fișiere"}` : "gol"}</small>
            </button>
          );
        })}
      </div>
      <p className="hint">Deschide un folder cu un click sau trage fișierele direct peste el. Un fișier cu același nume îl înlocuiește pe cel vechi, care rămâne ca versiune.</p>
    </section>
  );

  const files = current.filter((d) => d.folder_id === folder.id);
  return (
    <section className={`card xjOpen${over === folder.id ? " over" : ""}`} {...drop(folder.id)}>
      <div className="cardHead">
        <h2><button type="button" className="linkBtn" onClick={() => setOpen(null)}>Acte</button> › {folder.name}</h2>
        <span className="actions">
          {up && <span className="muted">{up}</span>}
          {!folder.preset && <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={async () => { const n = prompt("Numele folderului", folder.name); if (n?.trim()) await act("folder.rename", { id: folder.id, name: n }); }}>Redenumește</button>}
          {!folder.preset && <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={async () => { if (confirm(`Ștergi folderul „${folder.name}”?`) && await act("folder.delete", { id: folder.id })) setOpen(null); }}>Șterge folderul</button>}
          <button type="button" className="btn btnGold btnSm" onClick={() => input.current?.click()}>Încarcă fișiere</button>
          <input ref={input} type="file" multiple hidden onChange={(e) => { if (e.target.files) upload(folder.id, e.target.files); e.target.value = ""; }} />
        </span>
      </div>
      {files.length === 0 ? <div className="xjDrop">Trage fișierele aici sau apasă „Încarcă fișiere”.</div> : (
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Fișier</th><th className="r">Mărime</th><th>Încărcat</th><th>Mută în</th><th /></tr></thead>
            <tbody>
              {files.map((d) => {
                const old = docs.filter((x) => !x.current && x.folder_id === d.folder_id && x.filename.toLowerCase() === d.filename.toLowerCase());
                return (
                  <tr key={d.id}>
                    <td><a className="link" href={src(d)} target="_blank" rel="noreferrer"><b>{d.filename}</b></a>
                      {d.version > 1 && <> <button type="button" className="pill pillWarn xjVer" onClick={() => setVersions(versions === d.id ? null : d.id)}>versiunea {d.version}</button></>}
                      {versions === d.id && <ul className="xjVers">{old.map((o) => (
                        <li key={o.id}><a className="link" href={src(o)} target="_blank" rel="noreferrer">versiunea {o.version}</a> <span className="muted">· {ro(o.created_at)} · {size(o.size_bytes)}</span>
                          <button type="button" className="linkBtn" disabled={busy} onClick={() => confirm(`Ștergi versiunea ${o.version}?`) && act("doc.delete", { id: o.id })}>șterge</button></li>))}</ul>}</td>
                    <td className="r mono">{size(d.size_bytes)}</td><td>{ro(d.created_at)}</td>
                    <td><select className="input xjMove" value="" aria-label={`Mută ${d.filename}`} disabled={busy} onChange={(e) => e.target.value && act("doc.move", { id: d.id, folder_id: e.target.value })}>
                      <option value="">—</option>{folders.filter((f) => f.id !== folder.id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></td>
                    <td><span className="tdActs"><a className="btn btnGhost btnSm" href={src(d, true)}>Descarcă</a>
                      <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => confirm(`Ștergi „${d.filename}”${d.version > 1 ? " cu toate versiunile" : ""}?`) && act("doc.delete", { id: d.id, all: true })}>Șterge</button></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FeeTab({ c, busy, save }: { c: Case; busy: boolean; save: Save }) {
  const n = (v: number | null) => (v == null ? "" : String(v));
  const [f, setF] = useState({ fee_prov: n(c.fee_prov), fee_paid: !!c.fee_paid, fee_extra: n(c.fee_extra), fee_final: n(c.fee_final), fee_cashed: n(c.fee_cashed) });
  const num = (v: string) => (v === "" ? null : Number(v));
  const due = Math.max(0, (num(f.fee_final) ?? (num(f.fee_prov) ?? 0) + (num(f.fee_extra) ?? 0)) - (num(f.fee_cashed) ?? 0));
  const field = (k: "fee_prov" | "fee_extra" | "fee_final" | "fee_cashed", label: string, hint: string) => (
    <label className="field"><span>{label} <small>({hint})</small></span><input className="input" type="number" min={0} step={50} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );
  return (
    <section className="card">
      <h2>Onorariu</h2>
      <form className="xjForm" onSubmit={(e) => { e.preventDefault(); save(f); }}>
        <div className="grid2">
          {field("fee_prov", "Provizoriu, lei", "din încheierea de numire")}
          {field("fee_extra", "Majorare cerută, lei", "prin decont, la depunerea raportului")}
          {field("fee_final", "Definitiv, lei", "stabilit de instanță")}
          {field("fee_cashed", "Încasat, lei", "prin Biroul local de expertize")}
        </div>
        <label className="check"><input type="checkbox" checked={f.fee_paid} onChange={(e) => setF({ ...f, fee_paid: e.target.checked })} /><span>Onorariul provizoriu a fost consemnat de parte</span></label>
        <p className="xjDue">De încasat: <b>{lei(due)}</b></p>
        <button type="submit" className="btn btnGold btnSm" style={{ alignSelf: "flex-start" }} disabled={busy}>Salvează</button>
      </form>
    </section>
  );
}
