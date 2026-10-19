"use client";
// An offer (new or edited): the client, the assets, the fee and the terms. No contract, no bank: that is decided
// later, when the offer is converted into work.
import { useState } from "react";
import { PAYMENT_PRESETS, PURPOSES } from "@/lib/order-labels";
import { assetProfile, capType, emptyAsset, type AssetForm } from "@/lib/asset-labels";
import { AssetsEditor, newUid } from "@/components/AssetsEditor";
import { ClientSearch, type ClientHit } from "@/components/ClientSearch";

export type QuoteInitial = {
  id: string; client_id: string; client_kind: "person" | "company"; client_name: string; client_phone: string; client_email: string; client_cui: string;
  purpose: string; report_type: string; fee: string; term_days: string; valid_until: string; urgent: boolean; channel: string; collaboration_id: string; sent_via: string;
  /** a preset key, or "custom" with the text in payment_terms */
  payment: string; payment_terms: string;
  inspection_notes: string; notes: string; assets: AssetForm[];
};
type Collab = { id: string; firm: string; number: string | null };

const USES = ["Garantare bancară", ...PURPOSES.filter((x) => x !== "Credit bancar")];
const REPORT_KINDS = ["Raport de evaluare", "Notă de evaluare", "Notă de inspecție"];
const SENT_VIA: [string, string][] = [["", "Încă netrimisă (o notez)"], ["email", "Email"], ["whatsapp", "WhatsApp"], ["phone", "Telefon"], ["meeting", "La birou / întâlnire"]];
const plusDays = (n: number) => { const d = new Date(Date.now() + n * 86400000); return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" }); };
const Step = ({ n, title, sub, done }: { n: number; title: string; sub?: string; done?: boolean }) => (
  <div className="nwStepHead"><span className={`nwNum${done ? " done" : ""}`}>{done ? "✓" : n}</span><span><h2>{title}</h2>{sub && <small>{sub}</small>}</span></div>
);
const Req = () => <span className="req" aria-label="obligatoriu">*</span>;

export function QuoteForm({ base, initial, collabs, vatPercent }: { base: string; initial: QuoteInitial | null; collabs: Collab[]; vatPercent: number }) {
  const [f, setF] = useState(initial ?? {
    id: "", client_id: "", client_kind: "person" as "person" | "company", client_name: "", client_phone: "", client_email: "", client_cui: "",
    purpose: "", report_type: "Raport de evaluare", fee: "", term_days: "3", valid_until: plusDays(14), urgent: false, channel: "", collaboration_id: "", sent_via: "",
    payment: "avans50", payment_terms: "", inspection_notes: "", notes: "", assets: [] as AssetForm[],
  });
  const [assets, setAssets] = useState<AssetForm[]>(initial?.assets.length ? initial.assets : [{ ...emptyAsset(), uid: newUid(), full_address: "", is_main: true }]);
  const [picked, setPicked] = useState<ClientHit | null>(initial?.client_id ? { id: initial.client_id, kind: initial.client_kind, name: initial.client_name, cui: initial.client_cui || null, phone: initial.client_phone || null, email: initial.client_email || null, city: null, reports: 0 } : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { setF({ ...f, [k]: e.target.value }); setErrors((x) => ({ ...x, [k]: "" })); };
  const feeNum = parseFloat(f.fee.replace(/\s/g, "").replace(",", "."));
  const gross = Number.isFinite(feeNum) ? Math.round(feeNum * (1 + vatPercent / 100) * 100) / 100 : null;

  const pickClient = (h: ClientHit) => {
    setPicked(h);
    setF({ ...f, client_id: h.id, client_name: h.name, client_kind: h.kind === "company" ? "company" : "person", client_phone: h.phone ?? f.client_phone, client_email: h.email ?? f.client_email, client_cui: h.cui ?? "" });
    setErrors((x) => ({ ...x, client_name: "", client_phone: "" }));
  };
  const check = () => {
    const e: Record<string, string> = {};
    if (!f.client_name.trim()) e.client_name = "Completează numele clientului.";
    if (f.client_phone.replace(/\D/g, "").length < 9 && !f.client_email.trim()) e.client_phone = "Completează telefonul sau emailul clientului.";
    assets.forEach((a, i) => {
      if (!a.type.trim()) e[`asset${i}`] = `Bunul ${i + 1}: alege tipul.`;
      else if (assetProfile(a.category, a.type).address && !a.city.trim() && !a.full_address.trim()) e[`asset${i}`] = `Bunul ${i + 1}: completează adresa sau localitatea.`;
    });
    if (f.channel === "collab" && !f.collaboration_id) e.collaboration_id = "Alege firma colaboratoare.";
    return e;
  };
  const now = check();
  const missing = Object.values(now);
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = check();
    setErrors(e);
    if (Object.keys(e).length) { setMsg(""); setTimeout(() => document.querySelector(".nwForm .fieldErr")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0); return; }
    setBusy(true); setMsg("");
    const body = { ...f, assets: assets.map((a, i) => ({ ...a, is_main: i === 0 })) };
    const r = await fetch(f.id ? `/api/crm/quotes/${f.id}` : "/api/crm/quotes", { method: f.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { id?: string; error?: string } | undefined;
    if (!r?.ok) { setBusy(false); setMsg(d?.error || "Nu am putut salva. Încearcă din nou."); return; }
    location.href = `${base}/oferte/${f.id || d?.id}`;
  };
  const err = (k: string) => errors[k] ? <span className="fieldErr" role="alert">{errors[k]}</span> : null;

  return (
    <form onSubmit={submit} noValidate className="nwForm">
      <div className="nwTop">
        <section className="card nwCard">
          <Step n={1} title="Client" sub="Cui îi faci oferta" done={!now.client_name && !now.client_phone} />
          <div className="segment nwSeg" role="group" aria-label="Tip client">
            <button type="button" aria-pressed={f.client_kind === "person"} disabled={!!picked} onClick={() => setF({ ...f, client_kind: "person" })}>Persoană fizică</button>
            <button type="button" aria-pressed={f.client_kind === "company"} disabled={!!picked} onClick={() => setF({ ...f, client_kind: "company" })}>Persoană juridică</button>
          </div>
          <div className="field"><span className="fLabel">{f.client_kind === "company" ? "Denumire firmă" : "Nume și prenume"} <Req /></span>
            <ClientSearch value={f.client_name} invalid={!!errors.client_name} onPick={pickClient}
              onType={(v) => { const off = picked && v !== picked.name; setF({ ...f, client_name: v, client_id: off ? "" : f.client_id }); if (off) setPicked(null); setErrors((x) => ({ ...x, client_name: "" })); }} />
            {err("client_name")}
          </div>
          {f.client_name.trim().length >= 2 && (picked
            ? <div className="nwClient ok"><span className={`nwKind ${picked.kind}`}>{picked.kind === "company" ? "PJ" : "PF"}</span><span><b>Client existent</b><small>datele de contact s-au completat din fișa lui</small></span>
                <button type="button" className="linkBtn" onClick={() => { setPicked(null); setF({ ...f, client_id: "" }); }}>alt client</button></div>
            : <div className="nwClient new"><span className="nwKind new">+</span><span><b>Client nou</b><small>se adaugă în CRM la conversia ofertei în lucrare</small></span></div>)}
          <div className="formRow">
            <label className="field"><span className="fLabel">Telefon <Req /></span>
              <input className="input" type="tel" value={f.client_phone} onChange={set("client_phone")} aria-invalid={!!errors.client_phone || undefined} placeholder="07xx xxx xxx" />
              {err("client_phone")}
            </label>
            <label className="field"><span className="fLabel">Email <small>(sau telefon)</small></span><input className="input" type="email" value={f.client_email} onChange={set("client_email")} placeholder="nume@exemplu.ro" /></label>
          </div>
          {f.client_kind === "company" && <label className="field"><span className="fLabel">CUI <small>(opțional)</small></span><input className="input mono" value={f.client_cui} onChange={set("client_cui")} placeholder="ex. 12345678" disabled={!!picked} /></label>}
        </section>

        <section className="card nwCard">
          <Step n={2} title="Oferta" sub="Ce ai propus clientului" done={true} />
          <div className="formRow">
            <label className="field">Utilizarea desemnată
              <select className="select" value={f.purpose} onChange={set("purpose")}>
                <option value="">— de stabilit —</option>
                {!USES.includes(f.purpose) && f.purpose && <option value={f.purpose}>{f.purpose}</option>}
                {USES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <div className="field"><span className="fLabel">Onorariu fără TVA</span>
              <span className="nwSuffix"><input className="input" inputMode="decimal" value={f.fee} onChange={set("fee")} placeholder="ex. 900" aria-label="Onorariu fără TVA" /><em>lei</em></span>
              {gross != null && gross > 0 && <small className="muted">{gross.toLocaleString("ro-RO", { maximumFractionDigits: 2 })} lei cu TVA {vatPercent}%</small>}
            </div>
          </div>
          <div className="field">Tip raport
            <div className="segment nwSeg" role="group" aria-label="Tip raport">
              {REPORT_KINDS.map((k) => <button key={k} type="button" aria-pressed={f.report_type === k} onClick={() => setF({ ...f, report_type: k })}>{k}</button>)}
            </div>
          </div>
          <div className="formRow">
            <label className="field">Termen propus <small>(zile lucrătoare)</small><input className="input" inputMode="numeric" value={f.term_days} onChange={set("term_days")} /></label>
            <label className="field">Valabilă până la<input className="input" type="date" value={f.valid_until} onChange={set("valid_until")} /></label>
          </div>
          <div className="field">Plata
            <select className="select" value={f.payment} onChange={set("payment")}>
              {PAYMENT_PRESETS.map(([k, l]) => <option key={k} value={k}>{l.split(/[.,] /)[0]}</option>)}
              <option value="custom">Altfel (scriu eu)</option>
            </select>
            {f.payment === "custom" && <input className="input" style={{ marginTop: 6 }} value={f.payment_terms} onChange={set("payment_terms")} placeholder="ex. avans 40% la acceptare, restul în 2 rate" maxLength={300} />}
            <small className="muted">apare pe pagina ofertei, la „Plată”</small>
          </div>
          <div className="formRow">
            <label className="field">Transmisă prin
              <select className="select" value={f.sent_via} onChange={set("sent_via")}>{SENT_VIA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <div className="field">Prioritate
              <label className={`nwUrgent${f.urgent ? " on" : ""}`}><input type="checkbox" checked={f.urgent} onChange={(e) => setF({ ...f, urgent: e.target.checked })} /><span>Urgent</span><small>clientul are nevoie repede</small></label>
            </div>
          </div>
          <div className="field">Dacă acceptă, lucrarea merge
            <div className="segment nwSeg" role="group" aria-label="Canal">
              <button type="button" aria-pressed={f.channel === ""} onClick={() => setF({ ...f, channel: "", collaboration_id: "" })}>Decid la conversie</button>
              <button type="button" aria-pressed={f.channel === "direct"} onClick={() => setF({ ...f, channel: "direct", collaboration_id: "" })}>Direct · contract clasic</button>
              <button type="button" aria-pressed={f.channel === "collab"} onClick={() => setF({ ...f, channel: "collab" })}>Pe colaborare</button>
            </div>
            {f.channel === "collab" && (
              <>
                <select className="select" value={f.collaboration_id} onChange={set("collaboration_id")} aria-invalid={!!errors.collaboration_id || undefined} style={{ marginTop: 6 }}>
                  <option value="">Alege firma colaboratoare…</option>
                  {collabs.map((c) => <option key={c.id} value={c.id}>{c.firm}{c.number ? ` · ${c.number}` : ""}</option>)}
                </select>
                {err("collaboration_id")}
              </>
            )}
          </div>
        </section>
      </div>

      <section className="card nwCard">
        <Step n={3} title="Bunuri de evaluat" sub="Ce se evaluează: tipul și adresa sunt de ajuns acum, restul se completează la lucrare." done={assets.every((_, i) => !now[`asset${i}`])} />
        <AssetsEditor assets={assets} setAssets={(a) => { setAssets(a); setErrors((x) => Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith("asset")))); }} client={{ name: f.client_name, phone: f.client_phone }} />
        {assets.map((_, i) => <span key={i} style={{ display: "contents" }}>{err(`asset${i}`)}</span>)}
        <label className="field"><span className="fLabel">Observații pentru inspecție <small>(opțional)</small></span>
          <textarea className="textarea" rows={2} value={f.inspection_notes} onChange={set("inspection_notes")} /></label>
        <label className="field"><span className="fLabel">Note <small>(ce ai discutat, condiții, de urmărit)</small></span>
          <textarea className="textarea" rows={3} value={f.notes} onChange={set("notes")} placeholder="ex. vrea raportul până vineri; a cerut și evaluarea garajului; sună după 15 ale lunii" /></label>
      </section>

      {msg && <div role="alert" className="error">{msg}</div>}
      <div className="nwBar">
        <div className="nwSum">
          <span>{f.client_name ? <b>{f.client_name}</b> : <span className="muted">fără client</span>}</span>
          <span>{assets.length} {assets.length === 1 ? "bun" : "bunuri"}{assets[0]?.type ? ` · ${capType(assets[0].type)}` : ""}</span>
          <span>{Number.isFinite(feeNum) && feeNum > 0 ? <b>{feeNum.toLocaleString("ro-RO")} lei</b> : <span className="muted">fără onorariu</span>}</span>
          {missing.length > 0 ? <span className="nwMissing" title={missing.join("\n")}>{missing.length === 1 ? "Mai lipsește 1 câmp" : `Mai lipsesc ${missing.length} câmpuri`}</span> : <span className="nwReady">Gata de salvat</span>}
        </div>
        <div className="actions">
          <a className="btn btnGhost" href={f.id ? `${base}/oferte/${f.id}` : `${base}/oferte`}>Renunță</a>
          <button type="submit" className="btn btnGold" disabled={busy}>{busy ? "Se salvează…" : f.id ? "Salvează oferta" : "Salvează oferta"}</button>
        </div>
      </div>
    </form>
  );
}
