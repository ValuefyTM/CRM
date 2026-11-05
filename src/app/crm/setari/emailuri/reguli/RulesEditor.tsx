"use client";
// The rules of Emailuri primite: each a pattern (sender / subject / text contains), what it reads (the order number,
// the client), what it does (a processing task for a bank order, a plain task, ignore) and whom it notifies. Tested on
// the emails received before saving.
import { useState } from "react";

export type RuleForm = {
  id: string | null; name: string; active: boolean; from_has: string; subject_has: string; body_has: string; ref_after: string; ref_shape: string; client_after: string; type_after: string;
  action: "bank_order" | "task" | "ignore" | "resume_report"; bank_id: string; task_title: string; notify_roles: string[]; notify_users: string[];
};
type Hit = { id: string; at: string; subject: string | null; from: string | null; ref: string | null; client: string | null; type: string | null };
const ACTIONS: [RuleForm["action"], string, string][] = [
  ["bank_order", "Procesare comandă bancă", "task urgent: deschide „Comandă nouă” pe contractul cadru al băncii, cu numărul și clientul completate"],
  ["task", "Task simplu", "un task cu titlul ales, de marcat rezolvat"],
  ["resume_report", "Reia raportul suspendat", "găsește raportul după nr. comenzii; dacă e suspendat îl trece în lucru (timpul curge din nou); notează în Mesaje; anunță echipa raportului pe telefon și email"],
  ["ignore", "Ignoră", "emailul e doar păstrat (reclame, newslettere)"],
];
const EMPTY: RuleForm = { id: null, name: "", active: true, from_has: "", subject_has: "", body_has: "", ref_after: "", ref_shape: "", client_after: "", type_after: "", action: "bank_order", bank_id: "", task_title: "", notify_roles: ["owner", "admin", "operator"], notify_users: [] };
const day = (iso: string) => new Date(iso).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function post(body: unknown) {
  const r = await fetch("/api/crm/mail-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const d = (await r?.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  return r?.ok ? d : { ...d, error: d?.error ?? "Nu s-a putut salva." };
}

export function RulesEditor(p: { rules: RuleForm[]; draft: RuleForm | null; openId: string | null; fromEmail: { id: string; subject: string; from: string } | null;
  banks: { id: string; name: string }[]; roles: [string, string][]; people: { id: string; name: string }[]; base: string }) {
  const [edit, setEdit] = useState<RuleForm | null>(p.draft ?? p.rules.find((r) => r.id === p.openId) ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [test, setTest] = useState<{ total: number; hits: Hit[]; here: (Omit<Hit, "id" | "at" | "subject" | "from"> & { matches: boolean }) | null } | null>(null);
  const set = <K extends keyof RuleForm>(k: K, v: RuleForm[K]) => { if (edit) { setEdit({ ...edit, [k]: v }); setTest(null); setMsg(""); } };
  const toggle = (k: "notify_roles" | "notify_users", v: string) => edit && set(k, edit[k].includes(v) ? edit[k].filter((x) => x !== v) : [...edit[k], v]);
  const save = async () => {
    if (!edit) return;
    setBusy(true); setMsg("");
    const d = await post({ id: edit.id, rule: edit });
    setBusy(false);
    if (d.error) return setMsg(d.error);
    location.href = p.fromEmail ? `${p.base}/setari/emailuri/${p.fromEmail.id}` : `${p.base}/setari/emailuri/reguli`;
  };
  const run = async () => {
    if (!edit) return;
    setBusy(true); setMsg("");
    const d = await post({ op: "test", rule: edit, email: p.fromEmail?.id });
    setBusy(false);
    if (d.error) return setMsg(d.error);
    setTest(d as unknown as NonNullable<typeof test>);
  };
  const act = async (body: unknown) => { setBusy(true); const d = await post(body); setBusy(false); if (d.error) return alert(d.error); location.reload(); };
  const remove = async (id: string) => {
    if (!confirm("Ștergi regula? Emailurile și task-urile rămân.")) return;
    await fetch(`/api/crm/mail-rules?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    location.href = `${p.base}/setari/emailuri/reguli`;
  };
  const what = (r: RuleForm) => [r.from_has && `expeditor: ${r.from_has}`, r.subject_has && `subiect: ${r.subject_has}`, r.body_has && `text: ${r.body_has}`].filter(Boolean).join(" · ");

  return (
    <div className="ruGrid">
      <section className="card flush">
        <div className="cardHead" style={{ padding: "16px 22px 0" }}><h2>Reguli</h2><button type="button" className="btn btnGold btnSm" onClick={() => { setEdit({ ...EMPTY }); setTest(null); setMsg(""); }}>+ Regulă nouă</button></div>
        {p.rules.length === 0 ? <p className="hint pad">Nicio regulă încă.</p> : (
          <ol className="ruList">
            {p.rules.map((r, i) => (
              <li key={r.id} className={`${edit?.id === r.id ? "on" : ""}${r.active ? "" : " off"}`}>
                <button type="button" className="ruMain" onClick={() => { setEdit(r); setTest(null); setMsg(""); }}>
                  <b>{i + 1}. {r.name}</b>
                  <small>{ACTIONS.find(([k]) => k === r.action)?.[1]}{r.action === "bank_order" ? ` · ${p.banks.find((b) => b.id === r.bank_id)?.name ?? "bancă nealeasă"}` : ""}</small>
                  <small className="muted">{what(r) || "fără condiții"}</small>
                </button>
                <span className="ruTools">
                  <button type="button" className="linkBtn" disabled={busy || i === 0} onClick={() => act({ op: "move", id: r.id, dir: "up" })} aria-label="Mută mai sus">↑</button>
                  <button type="button" className="linkBtn" disabled={busy || i === p.rules.length - 1} onClick={() => act({ op: "move", id: r.id, dir: "down" })} aria-label="Mută mai jos">↓</button>
                  <button type="button" className={`pill ${r.active ? "pillOk" : ""}`} disabled={busy} onClick={() => act({ op: "active", id: r.id, active: !r.active })}><i />{r.active ? "Activă" : "Oprită"}</button>
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="hint pad">Regulile se încearcă de sus în jos; prima care se potrivește decide. Un email fără regulă rămâne în „Fără regulă”.</p>
      </section>

      {edit ? (
        <section className="card ruEdit">
          <div className="cardHead"><h2>{edit.id ? "Modifică regula" : "Regulă nouă"}</h2>{edit.id && <button type="button" className="linkBtn" onClick={() => remove(edit.id!)}>Șterge</button>}</div>
          {p.fromEmail && !edit.id && <div className="note">Din emailul „{p.fromEmail.subject || "(fără subiect)"}”{p.fromEmail.from ? ` de la ${p.fromEmail.from}` : ""}. Testează regula: vezi ce găsește în el.</div>}
          <label className="field">Nume <input className="input" value={edit.name} onChange={(e) => set("name", e.target.value)} placeholder="ex. Procesare comandă BRD" /></label>

          <div className="section">1 · Când se aplică <small>(oricare dintre variantele separate cu |; litere mari / mici și diacriticele nu contează)</small></div>
          <label className="field">Textul emailului conține <input className="input" value={edit.body_has} onChange={(e) => set("body_has", e.target.value)} placeholder="ex. selectata pentru realizarea | Alocare comanda" /></label>
          <div className="formRow">
            <label className="field">Expeditorul conține <input className="input" value={edit.from_has} onChange={(e) => set("from_has", e.target.value)} placeholder="ex. brd.ro (gol = orice)" /></label>
            <label className="field">Subiectul conține <input className="input" value={edit.subject_has} onChange={(e) => set("subject_has", e.target.value)} placeholder="gol = orice" /></label>
          </div>

          <div className="section">2 · Ce face</div>
          <div className="chips" role="radiogroup" aria-label="Acțiune">
            {ACTIONS.map(([k, l]) => <button key={k} type="button" className="chip" role="radio" aria-checked={edit.action === k} onClick={() => set("action", k)}>{l}</button>)}
          </div>
          <p className="hint" style={{ margin: "4px 0 0" }}>{ACTIONS.find(([k]) => k === edit.action)?.[2]}</p>
          {(edit.action === "bank_order" || edit.action === "resume_report") && (
            <label className="field">Banca{edit.action === "resume_report" ? <small> (opțional: caută comanda doar la această bancă)</small> : null} <select className="select" value={edit.bank_id} onChange={(e) => set("bank_id", e.target.value)}><option value="">Alege banca…</option>{p.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          )}
          {edit.action === "task" && <label className="field">Titlul task-ului <small>({"{ref}"} = nr. comandă, {"{client}"} = clientul)</small><input className="input" value={edit.task_title} onChange={(e) => set("task_title", e.target.value)} placeholder="ex. Informații primite {ref} · {client}" /></label>}

          {edit.action !== "ignore" && <>
            <div className="section">3 · Ce citește din email</div>
            <div className="formRow">
              <label className="field">Nr. comandă: codul de după <input className="input" value={edit.ref_after} onChange={(e) => set("ref_after", e.target.value)} placeholder="ex. cererii | ID de cerere:" /></label>
              <label className="field">Codul începe cu <input className="input mono" value={edit.ref_shape} onChange={(e) => set("ref_shape", e.target.value.toUpperCase())} placeholder="ex. EVA | REV" /></label>
            </div>
            <div className="formRow">
              <label className="field">Clientul: cuvintele de după <input className="input" value={edit.client_after} onChange={(e) => set("client_after", e.target.value)} placeholder="ex. client | Numele clientului:" /></label>
              <label className="field">Tipul cererii, de după <small>(opțional)</small><input className="input" value={edit.type_after} onChange={(e) => set("type_after", e.target.value)} placeholder="ex. Codul cererii:" /></label>
            </div>

            {edit.action !== "resume_report" && <>
            <div className="section">4 · Pe cine anunță <small>(clopoțel, telefon, email; reamintire la 2 ore, luni–vineri 8:00–18:00, până se procesează)</small></div>
            {edit.action === "bank_order" && <p className="hint" style={{ margin: 0 }}>În plus, task-ul îl văd și îl pot procesa automat cei agreați pe contractul cadru al băncii (fișa utilizatorului → Agreeri).</p>}
            <div className="chips" role="group" aria-label="Roluri">
              {p.roles.map(([k, l]) => <button key={k} type="button" className="chip" role="checkbox" aria-checked={edit.notify_roles.includes(k)} onClick={() => toggle("notify_roles", k)}>{l}</button>)}
            </div>
            <details className="ruPeople"><summary>și persoane anume {edit.notify_users.length ? `(${edit.notify_users.length})` : ""}</summary>
              <div className="chips">{p.people.map((u) => <button key={u.id} type="button" className="chip" role="checkbox" aria-checked={edit.notify_users.includes(u.id)} onClick={() => toggle("notify_users", u.id)}>{u.name}</button>)}</div>
            </details>
            </>}
            {edit.action === "resume_report" && <p className="hint" style={{ margin: 0 }}>Anunță automat membrii raportului găsit (push și email).</p>}
          </>}

          {msg && <div role="alert" className="error">{msg}</div>}
          <div className="actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btnGhost" onClick={() => { setEdit(null); setTest(null); }}>Renunță</button>
            <button type="button" className="btn btnGhost" disabled={busy} onClick={run}>Testează pe emailurile primite</button>
            <button type="button" className="btn btnGold" disabled={busy} onClick={save}>{busy ? "…" : "Salvează regula"}</button>
          </div>

          {test && (
            <div className="ruTest">
              {test.here && <p className={test.here.matches ? "okMsg" : "error"}>{test.here.matches ? <>Emailul tău: se potrivește · nr. <b className="mono">{test.here.ref ?? "negăsit"}</b> · client <b>{test.here.client ?? "negăsit"}</b>{test.here.type ? <> · {test.here.type}</> : null}</> : "Emailul tău nu se potrivește cu condițiile."}</p>}
              <b>Se potrivește cu {test.hits.length}{test.hits.length === 30 ? "+" : ""} din ultimele {test.total} emailuri</b>
              {test.hits.length > 0 && (
                <table className="table"><thead><tr><th>Primit</th><th>Subiect</th><th>Nr. comandă</th><th>Client</th></tr></thead>
                  <tbody>{test.hits.map((h) => <tr key={h.id}><td className="muted">{day(h.at)}</td><td><a className="link" href={`${p.base}/setari/emailuri/${h.id}`} target="_blank" rel="noreferrer">{h.subject || "(fără subiect)"}</a></td>
                    <td className={`mono${h.ref ? "" : " neg"}`}>{h.ref ?? "negăsit"}</td><td>{h.client ?? <span className="muted">—</span>}</td></tr>)}</tbody></table>
              )}
            </div>
          )}
        </section>
      ) : <section className="card"><p className="hint">Alege o regulă din stânga ca s-o modifici, sau adaugă una nouă. Cel mai simplu: deschide un email din „Fără regulă” și selectează în el numărul comenzii și clientul.</p></section>}
    </div>
  );
}
