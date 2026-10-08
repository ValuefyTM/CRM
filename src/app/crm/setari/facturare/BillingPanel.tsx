"use client";

import { useEffect, useState } from "react";
import type { BillingMode, BillingSettings } from "@/lib/billing";
import { BillingTextEdit } from "./BillingTextEdit";

type Rules = {
  contracts: { id: string; number: string | null; billing_mode: BillingMode | null; custom: number; party: string | null; reports: number }[];
  collabs: { id: string; number: string | null; billing_mode: BillingMode | null; custom: number; party: string; share: number | null; orders: number }[];
};
type Conn = { ok: boolean; error?: string; companies?: { cif: string; company: string }[]; cif?: string; series?: { type: string; name: string; next: string; default: number | boolean }[]; vat?: { name: string; percent: number; default: boolean }[] };

/** The billing settings: Oblio connection (tested live), documents, direct clients, framework contracts and collaborations. */
export function BillingPanel({ edit, initial, creds, rules, modes, flows }: {
  edit: boolean; initial: BillingSettings; creds: { email: string | null; secret: string | null }; rules: Rules;
  modes: [BillingMode, string, string][]; flows: [BillingSettings["directFlow"], string][];
}) {
  const [f, setF] = useState(initial);
  const [conn, setConn] = useState<Conn | null>(null);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ruleMsg, setRuleMsg] = useState("");
  const [trial, setTrial] = useState<{ ok: boolean; steps: string[]; error: string | null } | null>(null);
  const [trying, setTrying] = useState(false);
  const runTrial = async () => {
    if (!confirm("Se emite în Oblio o proformă de 1 leu către VALUEFY, marcată TEST, apoi se șterge imediat. Nu se emite nicio factură. Continui?")) return;
    setTrying(true); setTrial(null);
    const r = await fetch("/api/crm/billing/test", { method: "POST" }).catch(() => null);
    setTrial(((await r?.json().catch(() => null)) as typeof trial) ?? { ok: false, steps: [], error: "Nu am putut rula testul." });
    setTrying(false);
  };
  const set = <K extends keyof BillingSettings>(k: K, v: BillingSettings[K]) => setF((x) => ({ ...x, [k]: v }));

  const test = async (cif?: string) => {
    setTesting(true);
    const r = await fetch(`/api/crm/billing/oblio${cif ? `?cif=${encodeURIComponent(cif)}` : ""}`).catch(() => null);
    const d = ((await r?.json().catch(() => null)) as Conn | null) ?? { ok: false, error: "Nu am putut verifica conexiunea." };
    setConn(d); setTesting(false);
    if (d.ok && d.cif) setF((x) => ({
      ...x, cif: d.cif!,
      invoiceSeries: x.invoiceSeries || d.series?.find((s) => /factur/i.test(s.type) && s.default)?.name || d.series?.find((s) => /factur/i.test(s.type))?.name || "",
      proformaSeries: x.proformaSeries || d.series?.find((s) => /proform/i.test(s.type) && s.default)?.name || d.series?.find((s) => /proform/i.test(s.type))?.name || "",
    }));
  };
  useEffect(() => { if (edit && creds.email && creds.secret) test(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/crm/billing/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    setMsg(r?.ok ? { ok: true, text: "Setările de facturare au fost salvate." } : { ok: false, text: d?.error || "Nu am putut salva." });
  };
  const setRule = async (kind: "contract" | "collab", id: string, mode: string) => {
    setRuleMsg("");
    const r = await fetch("/api/crm/billing/rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, mode: mode || null }) }).catch(() => null);
    setRuleMsg(r?.ok ? "Regula a fost salvată." : "Nu am putut salva regula.");
  };

  const seriesOf = (re: RegExp) => (conn?.series ?? []).filter((s) => re.test(s.type));
  // A plain function (not a component): an input made inside the render would lose focus on every keystroke.
  const seriesField = (label: string, k: "invoiceSeries" | "proformaSeries", re: RegExp) => {
    const list = seriesOf(re);
    return (
      <label className="field">{label}
        {list.length ? (
          <select className="select" value={f[k]} disabled={!edit} onChange={(e) => set(k, e.target.value)}>
            <option value="">Alege seria…</option>
            {list.map((s) => <option key={s.name} value={s.name}>{s.name} · următorul nr. {s.next}</option>)}
          </select>
        ) : <input className="input mono" value={f[k]} disabled={!edit} onChange={(e) => set(k, e.target.value.toUpperCase())} placeholder="ex. VLF" />}
      </label>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section className="card">
        <div className="cardHead"><h2>Conexiune Oblio</h2>
          <span className={`pill ${conn?.ok ? "pillOk" : conn ? "pillErr" : ""}`}><i />{testing ? "Se verifică…" : conn?.ok ? "Conectat" : conn ? "Neconectat" : creds.email && creds.secret ? "Neverificat" : "Lipsesc datele de acces"}</span></div>
        <dl className="dl">
          <div><dt>Email cont (Cloudflare)</dt><dd className="mono">{creds.email ?? "— lipsește (OBLIO_EMAIL)"}</dd></div>
          <div><dt>Secret API (Cloudflare)</dt><dd className="mono">{creds.secret ?? "— lipsește (OBLIO_API_SECRET)"}</dd></div>
        </dl>
        {conn && !conn.ok && <div className="error" role="alert">{conn.error}</div>}
        {conn?.ok && (conn.companies?.length ?? 0) > 0 && (
          <label className="field">Firma din Oblio pe care se emit documentele
            <select className="select" value={f.cif} disabled={!edit} onChange={(e) => { set("cif", e.target.value); test(e.target.value); }}>
              {conn.companies!.map((c) => <option key={c.cif} value={c.cif}>{c.company} · CIF {c.cif}</option>)}
            </select>
          </label>
        )}
        {(!conn || !conn.ok) && <label className="field">CIF firmă în Oblio<input className="input mono" value={f.cif} disabled={!edit} onChange={(e) => set("cif", e.target.value)} /></label>}
        {edit && (
          <div className="actions">
            <button type="button" className="btn btnGhost btnSm" disabled={testing} onClick={() => test(f.cif)}>{testing ? "Se verifică…" : "Testează conexiunea"}</button>
            <button type="button" className="btn btnGhost btnSm" disabled={trying || !conn?.ok} onClick={runTrial} title="Proformă de 1 leu, ștearsă imediat">{trying ? "Se testează…" : "Test complet (proformă ștearsă automat)"}</button>
          </div>
        )}
        <p className="hint" style={{ margin: 0 }}>„Testează conexiunea” doar citește din Oblio (firme, serii, TVA). „Test complet” emite o proformă de 1 leu către VALUEFY, îi descarcă PDF-ul și o șterge — fără factură, fără e-Factura. Salvează întâi seria de proforme.</p>
        {trial && (
          <div className={trial.ok ? "note" : "error"} role="status">
            <b>{trial.ok ? "Testul a reușit." : trial.error}</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{trial.steps.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Documente</h2>
        <div className="formRow">
          {seriesField("Serie facturi", "invoiceSeries", /factur/i)}
          {seriesField("Serie proforme", "proformaSeries", /proform/i)}
        </div>
        <div className="formRow">
          <label className="field">Cota TVA
            {conn?.vat?.length ? (
              <select className="select" value={`${f.vatName}|${f.vatPercent}`} disabled={!edit || !f.vatPayer} onChange={(e) => { const [n, p] = e.target.value.split("|"); setF((x) => ({ ...x, vatName: n, vatPercent: Number(p) })); }}>
                {conn.vat.map((v) => <option key={v.name + v.percent} value={`${v.name}|${v.percent}`}>{v.name} · {v.percent}%</option>)}
              </select>
            ) : <input className="input" inputMode="decimal" value={String(f.vatPercent)} disabled={!edit || !f.vatPayer} onChange={(e) => set("vatPercent", Number(e.target.value.replace(",", ".")) || 0)} />}
          </label>
          <label className="field">Scadență (zile de la emitere)<input className="input" inputMode="numeric" value={String(f.dueDays)} disabled={!edit} onChange={(e) => set("dueDays", Number(e.target.value) || 0)} /></label>
          <label className="check" style={{ alignSelf: "end", paddingBottom: 8 }}><input type="checkbox" checked={f.vatPayer} disabled={!edit} onChange={(e) => set("vatPayer", e.target.checked)} /><span>Plătitor de TVA</span></label>
        </div>
        <div className="formRow">
          <label className="field">Denumire serviciu pe factură<input className="input" value={f.product} disabled={!edit} onChange={(e) => set("product", e.target.value)} /></label>
          <label className="field">Unitate de măsură<input className="input" value={f.unit} disabled={!edit} onChange={(e) => set("unit", e.target.value)} /></label>
          <label className="field">Întocmit de <small>(opțional)</small><input className="input" value={f.issuer} disabled={!edit} onChange={(e) => set("issuer", e.target.value)} /></label>
        </div>
        <label className="field">Mențiuni pe factură <small>(opțional; se adaugă după „Conform contractului nr. …”)</small><textarea className="textarea" rows={2} value={f.mentions} disabled={!edit} onChange={(e) => set("mentions", e.target.value)} /></label>
      </section>

      <section className="card">
        <h2>Clienți direcți (contract clasic)</h2>
        <div className="blFlows">
          {flows.map(([k, l]) => (
            <label key={k} className="check"><input type="radio" name="flow" checked={f.directFlow === k} disabled={!edit} onChange={() => set("directFlow", k)} /><span>{l}</span></label>
          ))}
        </div>
        <p className="hint">Deocamdată documentele se emit din fișa contractului, cu previzualizare; varianta aleasă aici e cea propusă implicit acolo.</p>
      </section>

      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "note" : "error"}>{msg.text}</div>}
      {edit && <div className="actions"><button type="button" className="btn btnGold" disabled={busy} onClick={save}>{busy ? "Se salvează…" : "Salvează setările"}</button></div>}

      <section className="card flush">
        <div className="cardHead"><h2>Contracte cadru și colaborări</h2>{ruleMsg && <span className="muted">{ruleMsg}</span>}</div>
        <div className="blDefaults">
          <label className="field">Implicit pentru contracte cadru
            <select className="select" value={f.frameworkDefault} disabled={!edit} onChange={(e) => set("frameworkDefault", e.target.value as BillingMode)}>{modes.map(([k, l]) => <option key={k} value={k} disabled={k === "monthly"}>{k === "monthly" ? `${l} (mai târziu)` : l}</option>)}</select>
          </label>
          <label className="field">Implicit pentru colaborări
            <select className="select" value={f.collabDefault} disabled={!edit} onChange={(e) => set("collabDefault", e.target.value as BillingMode)}>{modes.map(([k, l]) => <option key={k} value={k} disabled={k === "monthly"}>{k === "monthly" ? `${l} (mai târziu)` : l}</option>)}</select>
          </label>
        </div>
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Partener</th><th>Contract</th><th>Lucrări</th><th>Când se facturează</th><th>Ce scrie pe factură</th></tr></thead>
            <tbody>
              {rules.contracts.map((k) => (
                <tr key={k.id}>
                  <td><b>{k.party ?? "—"}</b><div className="muted">Bancă · contract cadru</div></td>
                  <td className="mono">{k.number ?? "—"}</td>
                  <td>{k.reports.toLocaleString("ro-RO")} rapoarte</td>
                  <td><select className="select" defaultValue={k.billing_mode ?? ""} disabled={!edit} onChange={(e) => setRule("contract", k.id, e.target.value)}>
                    <option value="">Implicit ({modes.find(([m]) => m === f.frameworkDefault)?.[1]})</option>
                    {modes.map(([m, l]) => <option key={m} value={m} disabled={m === "monthly"}>{m === "monthly" ? `${l} (mai târziu)` : l}</option>)}
                  </select></td>
                  <td><BillingTextEdit kind="contract" id={k.id} party={k.party ?? "contract cadru"} custom={!!k.custom} product={f.product} /></td>
                </tr>
              ))}
              {rules.collabs.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.party}</b><div className="muted">Colaborare{c.share != null ? ` · cota VALUEFY ${Math.round(c.share * 100)}%` : ""}</div></td>
                  <td className="mono">{c.number ?? "—"}</td>
                  <td>{c.orders.toLocaleString("ro-RO")} comenzi</td>
                  <td><select className="select" defaultValue={c.billing_mode ?? ""} disabled={!edit} onChange={(e) => setRule("collab", c.id, e.target.value)}>
                    <option value="">Implicit ({modes.find(([m]) => m === f.collabDefault)?.[1]})</option>
                    {modes.map(([m, l]) => <option key={m} value={m} disabled={m === "monthly"}>{m === "monthly" ? `${l} (mai târziu)` : l}</option>)}
                  </select></td>
                  <td><BillingTextEdit kind="collab" id={c.id} party={c.party} custom={!!c.custom} product={f.product} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ padding: "0 16px 14px" }}>„Per comandă”: în pagina raportului apare „Emite factura” după predare (aprobare). Facturarea lunară pe borderou se va adăuga mai târziu; până atunci, aceste facturi se fac în afara CRM-ului. Implicitele se salvează cu butonul de mai sus.</p>
      </section>
    </div>
  );
}
