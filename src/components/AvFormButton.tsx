"use client";
// The Appraisal & Valuation order form: what the CRM fills in, what is missing (in red), editable here; saved back
// on the client, the properties and the order, then downloaded in their own Excel format.
import { useState } from "react";
import { createPortal } from "react-dom";
import { AV_COUNTIES, AV_FIRMS, AV_MOBILE, AV_PURPOSES, AV_STATES, AV_SUBTYPES, AV_TYPES, avMissing, type AvAddress, type AvAsset, type AvForm } from "@/lib/av-labels";

type Data = { form: AvForm; assets: AvAsset[]; hasRecipient: boolean; missing: string[]; canEdit: boolean };
const ADDR: [keyof AvAddress, string][] = [["county", "Județ"], ["city", "Localitate"], ["street", "Strada"], ["number", "Nr."], ["block", "Bloc"], ["stair", "Scara"], ["floor", "Etaj"], ["apartment", "Ap."]];
const REQ_ADDR = new Set(["county", "city", "street", "number"]);

export function AvFormButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState(false);
  // Complete: downloaded straight away. Something missing: the form opens, with only that to fill in.
  const load = async () => {
    setMsg(""); setD(null); setBusy(true);
    const r = await fetch(`/api/crm/reports/${id}/av-form`).catch(() => null);
    const x = (await r?.json().catch(() => ({}))) as Data & { error?: string };
    setBusy(false);
    if (!r?.ok) { setOpen(true); setMsg(x.error ?? "Nu am putut încărca formularul."); return; }
    setD(x);
    if (!x.missing.length) { await fetchFile(); return; }
    setOpen(true);
  };
  const missing = d ? avMissing(d.form, d.assets, d.hasRecipient) : [];
  const miss = (label: string) => missing.some((m) => m.startsWith(label));
  const setF = <K extends keyof AvForm>(k: K, v: AvForm[K]) => { setSaved(false); setD((x) => (x ? { ...x, form: { ...x.form, [k]: v } } : x)); };
  const setAddr = (k: keyof AvAddress, v: string) => setD((x) => (x ? { ...x, form: { ...x.form, addr: { ...x.form.addr, [k]: v } } } : x));
  const setA = (i: number, k: keyof AvAsset, v: string) => { setSaved(false); setD((x) => (x ? { ...x, assets: x.assets.map((a, j) => (j === i ? { ...a, [k]: v } : a)) } : x)); };
  const setAA = (i: number, k: keyof AvAddress, v: string) => { setSaved(false); setD((x) => (x ? { ...x, assets: x.assets.map((a, j) => (j === i ? { ...a, addr: { ...a.addr, [k]: v } } : a)) } : x)); };
  const copyAddr = () => { const m = d?.assets.find((a) => !a.mobile); if (m) setD((x) => (x ? { ...x, form: { ...x.form, addr: { ...m.addr }, same: true } } : x)); };
  const save = async () => {
    if (!d) return false;
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/reports/${id}/av-form`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ form: d.form, assets: d.assets }) }).catch(() => null);
    const x = (await r?.json().catch(() => ({}))) as Data & { error?: string };
    setBusy(false);
    if (!r?.ok) { setMsg(x.error ?? "Nu s-a salvat."); return false; }
    setD((cur) => (cur ? { ...cur, form: x.form, assets: x.assets, missing: x.missing } : cur)); setSaved(true);
    return true;
  };
  const download = async () => {
    if (d?.canEdit && !(await save())) return;
    if (await fetchFile()) setOpen(false);
  };
  const fetchFile = async () => {
    setBusy(true);
    const r = await fetch(`/api/crm/reports/${id}/av-form`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { const x = (await r?.json().catch(() => ({}))) as { error?: string }; setOpen(true); setMsg(x.error ?? "Nu am putut genera fișierul."); return false; }
    const blob = await r.blob();
    const m = (r.headers.get("Content-Disposition") ?? "").match(/filename\*=UTF-8''([^;]+)/);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = m ? decodeURIComponent(m[1]) : "formular.xlsx";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return true;
  };
  const ro = !d?.canEdit;
  const inp = (label: string, value: string, on: (v: string) => void, req = false, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className={`field${req && !value.trim() ? " avMiss" : ""}`}>{label}{req && <span className="avReq">*</span>}
      <input className="input" value={value} readOnly={ro} onChange={(e) => on(e.target.value)} aria-invalid={(req && !value.trim()) || undefined} {...props} /></label>
  );
  const sel = (label: string, value: string, opts: readonly string[], on: (v: string) => void, req = false) => (
    <label className={`field${req && !value ? " avMiss" : ""}`}>{label}{req && <span className="avReq">*</span>}
      <select className="select" value={value} disabled={ro} onChange={(e) => on(e.target.value)} aria-invalid={(req && !value) || undefined}>
        <option value="">—</option>{[...new Set([...opts, ...(value && !opts.includes(value) ? [value] : [])])].map((o) => <option key={o} value={o}>{o.trim()}</option>)}
      </select></label>
  );
  const addrFields = (a: AvAddress, on: (k: keyof AvAddress, v: string) => void) => (
    <div className="avAddr">
      {ADDR.map(([k, l]) => k === "county" ? <div key={k}>{sel(l, a.county, AV_COUNTIES, (v) => on(k, v), true)}</div> : <div key={k}>{inp(l, a[k], (v) => on(k, v), REQ_ADDR.has(k))}</div>)}
    </div>
  );
  return (
    <>
      <button type="button" className="btn btnOnNavy btnSm" onClick={load} disabled={busy && !open}>{busy && !open ? "Se generează…" : "Descarcă formular Appraisal & Valuation"}</button>
      {open && createPortal(
        <div className="vfModal sheet" role="dialog" aria-modal="true" aria-labelledby="avT" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox avBox">
            <div className="cardHead"><h2 id="avT">Formular facturare · Appraisal & Valuation</h2><button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)} aria-label="Închide">×</button></div>
            {!d ? <p className="hint">{msg || "Se încarcă…"}</p> : (
              <>
                {missing.length ? <div className="note avNote"><b>Formularul nu se poate descărca încă: lipsesc {missing.length} {missing.length === 1 ? "câmp" : "câmpuri"}</b> (marcate cu roșu): {missing.join(", ")}. Restul e completat automat din CRM.</div>
                  : <div className="note avOk"><b>Formularul e complet.</b> Îl poți descărca și trimite.</div>}
                <div className="section">1. Client și proiect</div>
                <div className="avGrid">
                  {sel("Firma facturată", d.form.firm, AV_FIRMS, (v) => setF("firm", v), true)}
                  {inp("ID client (al lor)", d.form.client_id, (v) => setF("client_id", v))}
                  {inp("Denumire client", d.form.name, (v) => setF("name", v), true)}
                  <label className="field">Client PJ<input className="input" value={d.form.pj ? "DA" : "NU"} readOnly /></label>
                  {d.form.pj ? <>
                    {inp("CUI", d.form.cui, (v) => setF("cui", v), true)}
                    {inp("Nr. Reg. Com.", d.form.reg_no, (v) => setF("reg_no", v))}
                    {inp("Reprezentant legal", d.form.legal_rep, (v) => setF("legal_rep", v))}
                  </> : inp("CNP", d.form.cnp, (v) => setF("cnp", v.replace(/\D/g, "").slice(0, 13)), true, { inputMode: "numeric" })}
                  {inp("Email client", d.form.email, (v) => setF("email", v), true, { type: "email" })}
                  {inp("Telefon client", d.form.phone, (v) => setF("phone", v), true)}
                  {inp("Destinatar raport", d.form.recipient, (v) => setF("recipient", v), d.hasRecipient)}
                  {inp("Sucursala băncii", d.form.branch, (v) => setF("branch", v))}
                  {inp("Email ofițer credit", d.form.officer_email, (v) => setF("officer_email", v), false, { type: "email" })}
                  {sel("Scop evaluare", d.form.purpose, AV_PURPOSES, (v) => setF("purpose", v), true)}
                  {inp("Nr. zile scadență factură", d.form.due_days, (v) => setF("due_days", v.replace(/\D/g, "")), true, { inputMode: "numeric" })}
                </div>
                <div className="avSub">Adresa clientului (sediu / domiciliu) {!ro && d.assets.some((a) => !a.mobile) && <button type="button" className="linkBtn" onClick={copyAddr}>la fel ca imobilul</button>}</div>
                {addrFields(d.form.addr, setAddr)}
                <label className="check"><input type="checkbox" checked={d.form.same} disabled={ro} onChange={(e) => setF("same", e.target.checked)} /><span>Datele imobilului sunt aceleași cu sediul / domiciliul clientului</span></label>
                <p className="hint" style={{ margin: 0 }}>Onorariul se trece fără TVA („Onorariu cu TVA inclus” = NU).</p>

                {d.assets.map((a, i) => (
                  <div key={a.id} className="avAsset">
                    <div className="section">{a.mobile ? "3. Bun mobil" : "2. Imobil"} {i + 1} · <span className="muted" style={{ textTransform: "none", letterSpacing: 0 }}>{a.label}</span></div>
                    <div className="avGrid">
                      {a.mobile ? <>
                        {sel("Tip bun mobil", a.type, AV_MOBILE, (v) => setA(i, "type", v), true)}
                        {inp("Detalii bun", a.details, (v) => setA(i, "details", v))}
                        {inp("Marca", a.make, (v) => setA(i, "make", v))}
                        {inp("Model", a.model, (v) => setA(i, "model", v))}
                        {inp("Anul PIF", a.year, (v) => setA(i, "year", v))}
                      </> : <>
                        {sel("Existentă / în construcție", a.state, AV_STATES, (v) => setA(i, "state", v), true)}
                        {sel("Tip proprietate", a.type, AV_TYPES, (v) => setA(i, "type", v), true)}
                        {sel("Subtip", a.subtype, AV_SUBTYPES, (v) => setA(i, "subtype", v), true)}
                        {inp("Detalii proprietate", a.details, (v) => setA(i, "details", v), true)}
                        {inp("Nr. CF", a.cf, (v) => setA(i, "cf", v), true)}
                        {inp("Suprafață utilă", a.area, (v) => setA(i, "area", v))}
                        {inp("Locuri parcare", a.parking, (v) => setA(i, "parking", v.replace(/\D/g, "")))}
                      </>}
                      {inp("Onorariu fără TVA (lei)", a.fee, (v) => setA(i, "fee", v), true, { inputMode: "decimal" })}
                      {inp("Cod poștal", a.postal, (v) => setA(i, "postal", v.replace(/\D/g, "").slice(0, 6)), !a.mobile, { inputMode: "numeric" })}
                      {inp("Cartier", a.district, (v) => setA(i, "district", v))}
                      {inp("Nr. zile min", a.days_min, (v) => setA(i, "days_min", v.replace(/\D/g, "")), !a.mobile)}
                      {inp("Nr. zile max", a.days_max, (v) => setA(i, "days_max", v.replace(/\D/g, "")), !a.mobile)}
                    </div>
                    {addrFields(a.addr, (k, v) => setAA(i, k, v))}
                  </div>
                ))}
                {msg && <div role="alert" className="error">{msg}</div>}
                <div className="actions avActs">
                  {!ro && <button type="button" className="btn btnGhost" disabled={busy} onClick={save}>{busy ? "…" : saved ? "Salvat ✓" : "Salvează datele"}</button>}
                  <button type="button" className="btn btnNavy" disabled={busy || missing.length > 0} title={missing.length ? "Completează câmpurile marcate cu roșu" : undefined} onClick={download}>Salvează și descarcă (.xlsx)</button>
                  {ro && <span className="muted">Doar citire: datele le completează cine poate edita raportul.</span>}
                </div>
                {miss("Email client") && <p className="hint" style={{ margin: 0 }}>Emailul clientului e obligatoriu la Appraisal & Valuation; se salvează și pe fișa clientului.</p>}
              </>
            )}
          </div>
        </div>, document.body)}
    </>
  );
}
