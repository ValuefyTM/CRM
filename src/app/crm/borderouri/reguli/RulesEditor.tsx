"use client";
// The statement rules: for whom, on what criteria (which reports count in a month, which shares), how often.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BASIS_PICK, RECURRENCE_PICK, type Rule } from "@/lib/statement-labels";

type Choice = { party: string; name: string; sub: string };
type Data = { rules: Rule[]; users: Choice[]; contracts: Choice[]; collabs: Choice[] };
type Form = { party: string; recurrence: string; basis: string; inc_evaluator: boolean; inc_verifier: boolean; inc_inspector: boolean; referral_pct: string; fixed_amount: string; fixed_label: string; active: boolean; notes: string };
const empty: Form = { party: "", recurrence: "monthly", basis: "delivered", inc_evaluator: true, inc_verifier: true, inc_inspector: true, referral_pct: "", fixed_amount: "", fixed_label: "", active: true, notes: "" };
const lei = (n: number | null) => (n == null ? "" : `${n.toLocaleString("ro-RO")} lei`);

export function RulesEditor({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) {
  const [d, setD] = useState<Data | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/crm/statements/rules").then((r) => r.json() as Promise<Data>).then(setD).catch(() => setD({ rules: [], users: [], contracts: [], collabs: [] }));
  useEffect(() => { load(); }, []);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const edit = (r: Rule) => {
    setEditing(r.id); setMsg("");
    setForm({ party: r.party, recurrence: r.recurrence, basis: r.basis, inc_evaluator: !!r.inc_evaluator, inc_verifier: !!r.inc_verifier, inc_inspector: !!r.inc_inspector,
      referral_pct: r.referral_pct == null ? "" : String(r.referral_pct), fixed_amount: r.fixed_amount == null ? "" : String(r.fixed_amount), fixed_label: r.fixed_label ?? "", active: !!r.active, notes: r.notes ?? "" });
  };
  const save = async () => {
    if (!form) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/crm/statements/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).catch(() => null);
    const x = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setMsg(x.error ?? "Nu s-a salvat.");
    setForm(null); setEditing(null); load();
  };
  const del = async (r: Rule) => {
    if (!confirm(`Ștergi regula pentru ${r.name}? Borderourile deja deschise rămân.`)) return;
    const x = await fetch(`/api/crm/statements/rules?id=${r.id}`, { method: "DELETE" }).catch(() => null);
    if (!x?.ok) return setMsg("Nu s-a șters.");
    load();
  };
  if (!d) return <p className="hint pad">Se încarcă…</p>;
  const payout = form ? form.party.startsWith("u:") : false;
  const taken = new Set(d.rules.map((r) => r.party));
  const group = (kind: "payout" | "receivable") => d.rules.filter((r) => r.kind === kind);
  const table = (kind: "payout" | "receivable", title: string, hint: string) => (
    <section className="card flush">
      <div className="cardHead"><h2>{title}</h2><span className="muted">{hint}</span></div>
      {group(kind).length === 0 ? <p className="hint pad">Nicio regulă.</p> : (
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Pentru</th><th>Când</th><th>Ce intră</th><th>Cote</th><th>Stare</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {group(kind).map((r) => (
                <tr key={r.id}>
                  <td><b>{r.name}</b>{r.sub && <div className="muted">{r.sub}</div>}</td>
                  <td>{RECURRENCE_PICK.find(([k]) => k === r.recurrence)?.[1]}</td>
                  <td>{BASIS_PICK.find(([k]) => k === r.basis)?.[1]}</td>
                  <td className="muted">{kind === "payout"
                    ? [r.inc_evaluator ? "evaluator" : null, r.inc_verifier ? "verificator" : null, r.inc_inspector ? "inspecții" : null, r.referral_pct ? `recomandări ${r.referral_pct}%` : null, r.fixed_amount ? `fix ${lei(r.fixed_amount)}` : null].filter(Boolean).join(" · ") || "—"
                    : "tariful fiecărui raport"}</td>
                  <td><span className={`pill ${r.active ? "pillOk" : ""}`}><i />{r.active ? "activă" : "oprită"}</span></td>
                  {canEdit && <td><span className="actions" style={{ flexWrap: "nowrap" }}><button type="button" className="linkBtn" onClick={() => edit(r)}>modifică</button>{canDelete && <button type="button" className="linkBtn danger" onClick={() => del(r)}>șterge</button>}</span></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
  return (
    <>
      {canEdit && <div className="actions" style={{ marginBottom: 4 }}><button type="button" className="btn btnNavy btnSm" onClick={() => { setEditing(null); setForm(empty); setMsg(""); }}>+ Regulă nouă</button>{msg && !form && <span className="errTxt">{msg}</span>}</div>}
      {table("payout", "Plăți colaboratori", "persoanele care primesc lunar un borderou cu ce le datorează firma")}
      {table("receivable", "De încasat", "băncile (contracte cadru) și firmele colaboratoare cărora li se face lunar borderoul")}
      {form && createPortal(
        <div className="vfModal sheet" role="dialog" aria-modal="true" aria-labelledby="rlT" onClick={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
          <div className="vfModalBox">
            <div className="cardHead"><h2 id="rlT">{editing ? "Regulă de borderou" : "Regulă nouă"}</h2><button type="button" className="btn btnGhost btnSm" onClick={() => setForm(null)} aria-label="Închide">×</button></div>
            <label className="field">Pentru cine
              <select className="select" value={form.party} disabled={!!editing} onChange={(e) => set("party", e.target.value)}>
                <option value="">— alege —</option>
                <optgroup label="Plată evaluator">{d.users.filter((c) => editing || !taken.has(c.party)).map((c) => <option key={c.party} value={c.party}>{c.name} · {c.sub}</option>)}</optgroup>
                <optgroup label="De încasat · contract cadru">{d.contracts.filter((c) => editing || !taken.has(c.party)).map((c) => <option key={c.party} value={c.party}>{c.name} · {c.sub}</option>)}</optgroup>
                <optgroup label="De încasat · colaborare">{d.collabs.filter((c) => editing || !taken.has(c.party)).map((c) => <option key={c.party} value={c.party}>{c.name} · {c.sub}</option>)}</optgroup>
              </select>
            </label>
            <div className="frGrid">
              <label className="field">Recurență
                <select className="select" value={form.recurrence} onChange={(e) => set("recurrence", e.target.value)}>{RECURRENCE_PICK.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <small className="hint">{RECURRENCE_PICK.find(([k]) => k === form.recurrence)?.[2]}</small>
              </label>
              <label className="field">Ce intră în lună
                <select className="select" value={form.basis} onChange={(e) => set("basis", e.target.value)}>{BASIS_PICK.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <small className="hint">{BASIS_PICK.find(([k]) => k === form.basis)?.[2]}</small>
              </label>
            </div>
            {payout && (
              <>
                <div className="section">Ce se plătește</div>
                <label className="check"><input type="checkbox" checked={form.inc_evaluator} onChange={(e) => set("inc_evaluator", e.target.checked)} /><span>Cota ca evaluator principal (procentul din fișa utilizatorului)</span></label>
                <label className="check"><input type="checkbox" checked={form.inc_verifier} onChange={(e) => set("inc_verifier", e.target.checked)} /><span>Cota ca verificator</span></label>
                <label className="check"><input type="checkbox" checked={form.inc_inspector} onChange={(e) => set("inc_inspector", e.target.checked)} /><span>Tariful de inspecție, pentru inspecțiile făcute în lună (când nu e și evaluatorul raportului)</span></label>
                <div className="frGrid">
                  <label className="field">Comision pe rapoartele recomandate <small>(% din onorariu · „Recomandată de”)</small><input className="input" inputMode="decimal" value={form.referral_pct} onChange={(e) => set("referral_pct", e.target.value)} placeholder="de ex. 10" /></label>
                  <label className="field">Sumă fixă lunară <small>(lei)</small><input className="input" inputMode="decimal" value={form.fixed_amount} onChange={(e) => set("fixed_amount", e.target.value)} placeholder="de ex. 1500" /></label>
                </div>
                {form.fixed_amount && <label className="field">Denumirea sumei fixe<input className="input" value={form.fixed_label} onChange={(e) => set("fixed_label", e.target.value)} placeholder="de ex. Manager de zonă" /></label>}
              </>
            )}
            {form.party && !payout && <p className="hint" style={{ margin: 0 }}>Intră fiecare raport predat (sau încasat) în lună pe acest contract / această colaborare, cu tariful lui{form.party.startsWith("c:") ? " (partea firmei, după cota colaborării)" : ""}.</p>}
            <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /><span>Regulă activă</span></label>
            <label className="field">Observații <small>(opțional)</small><textarea className="textarea" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></label>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="button" className="btn btnNavy" disabled={busy || !form.party} onClick={save}>{busy ? "Se salvează…" : "Salvează"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setForm(null)}>Renunță</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
