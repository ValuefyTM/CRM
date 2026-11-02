"use client";

import { useState } from "react";
import { PersonPicker } from "@/components/PersonPicker";
import { AssetsEditor } from "@/components/AssetsEditor";
import { dutyIn } from "@/lib/labels";
import { assetMissing, capType, type AssetForm } from "@/lib/asset-labels";

type Person = { id: string; name: string; role: string; duties?: string | null };
type Choice = { id: string; label: string };
type OrderInfo = { id: string; ref: string; partner: string | null; client: string | null; phone: string | null; email: string | null; purpose: string | null; report_type: string | null;
  urgent: boolean; fee: number | null; docs: number };

const STEPS = ["Tarif și termen", "Unde se lucrează", "Raport și client", "Bunul evaluat"];
const KINDS: [string, string][] = [["EPI", "Proprietăți imobiliare"], ["EBM", "Bunuri mobile"], ["EI", "Întreprinderi"], ["EIF", "Instrumente financiare"]];

/**
 * A collaborator's portal order, processed without an offer: fee and term, then VALUEFY or a collaborating firm,
 * then the report (type of valuation, designated user, client, team), then the asset filled in from the order.
 */
export function PartnerWizard(p: {
  order: OrderInfo; base: string; me: string; asset: AssetForm; collabs: Choice[]; parties: Choice[]; purposes: string[]; reportTypes: string[]; valueTypes: string[];
  evaluators: Person[];
}) {
  const o = p.order;
  const [step, setStep] = useState(0);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [t, setT] = useState({ fee: o.fee ? String(o.fee) : "", term_days: o.urgent ? "5" : "10", urgent: o.urgent });
  const [where, setWhere] = useState({ kind: "intern" as "intern" | "collab", collaboration_id: "", report_number: "" });
  const [rep, setRep] = useState({
    valuation_types: ["EPI"], recipient_id: "", client_only: false, purpose: o.purpose ?? p.purposes[0] ?? "", report_type: o.report_type || "Raport de evaluare", value_type: p.valueTypes[0] ?? "",
    evaluator_id: p.evaluators.some((e) => e.id === p.me && dutyIn(e.duties, "evaluator")) ? p.me : "", verifier_id: "",
  });
  const [client, setClient] = useState({ kind: "person", name: o.client ?? "", phone: o.phone ?? "", email: o.email ?? "", cui: "" });
  const [assets, setAssets] = useState<AssetForm[]>([p.asset]);

  const check = (i: number) => {
    if (i === 0) {
      const f = parseFloat(t.fee.replace(",", "."));
      if (!(Number.isFinite(f) && f > 0)) return "Completează tariful (fără TVA).";
      const d = Number(t.term_days);
      if (!(Number.isInteger(d) && d >= 1 && d <= 180)) return "Completează termenul de predare, în zile lucrătoare.";
    }
    if (i === 1 && where.kind === "collab" && !where.collaboration_id) return "Alege firma colaboratoare.";
    if (i === 2) {
      if (!rep.valuation_types.length) return "Alege tipul evaluării.";
      if (!rep.client_only && !rep.recipient_id) return "Alege utilizatorul desemnat sau bifează „Doar clientul”.";
      if (!client.name.trim()) return "Completează numele clientului.";
      if (where.kind === "collab" && client.phone.replace(/\D/g, "").length < 9) return "Completează telefonul clientului.";
      if (!rep.evaluator_id) return "Alege evaluatorul principal.";
    }
    if (i === 3) for (const [n, a] of assets.entries()) {
      const miss = assetMissing(a);
      if (miss.length) return `Bunul ${n + 1}: completează ${miss.join(", ")}.`;
    }
    return "";
  };
  const go = (to: number) => {
    for (let i = step; i < to; i++) { const e = check(i); if (e) { setStep(i); return setMsg(e); } }
    setMsg(""); setStep(to);
  };
  const submit = async () => {
    for (let i = 0; i < 4; i++) { const e = check(i); if (e) { setStep(i); return setMsg(e); } }
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/orders/${o.id}/process-partner`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fee: t.fee, term_days: Number(t.term_days), urgent: t.urgent, where: where.kind, collaboration_id: where.collaboration_id, report_number: where.report_number,
        ...rep, client, assets: assets.map((a, i) => ({ ...a, is_main: i === 0, ...(a.contact_kind === "client" ? { contact_name: client.name, contact_phone: client.phone } : {}) })),
      }),
    }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { report?: string; error?: string } | undefined;
    if (!r?.ok || !d?.report) { setBusy(false); return setMsg(d?.error || "Nu am putut procesa comanda. Încearcă din nou."); }
    location.href = `${p.base}/rapoarte/${d.report}?tab=bunuri&alocare=1`;
  };
  const collab = p.collabs.find((x) => x.id === where.collaboration_id);

  return (
    <div className="wizard">
      <ol className="wizSteps" aria-label="Pași">
        {STEPS.map((l, i) => (
          <li key={l} className={i < step ? "past" : i === step ? "on" : ""}>
            <button type="button" onClick={() => go(i)} disabled={i > step + 1}><span className="dot">{i < step ? "✓" : i + 1}</span>{l}</button>
          </li>
        ))}
      </ol>

      <section className="card">
        <div className="note"><b>Comanda {o.ref}</b>{o.partner ? ` · de la ${o.partner}` : ""}{o.client ? ` · client ${o.client}` : ""} · fără ofertă: se confirmă direct, colaboratorul primește tariful și termenul pe email și în portal.</div>

        {step === 0 && (
          <>
            <h2>Tarif și termen de predare</h2>
            <div className="formRow">
              <label className="field">Tarif fără TVA (lei)<input className="input" inputMode="decimal" value={t.fee} onChange={(e) => setT({ ...t, fee: e.target.value })} autoFocus /></label>
              <label className="field">Termen de predare <small>(zile lucrătoare de la inspecție)</small><input className="input" inputMode="numeric" value={t.term_days} onChange={(e) => setT({ ...t, term_days: e.target.value.replace(/\D/g, "") })} /></label>
            </div>
            <label className="check"><input type="checkbox" checked={t.urgent} onChange={(e) => setT({ ...t, urgent: e.target.checked })} /><span>Urgent{o.urgent ? " · cerut de colaborator" : ""}</span></label>
            <p className="hint">Tariful și termenul se scriu de mână deocamdată; o grilă de tarife pentru colaboratori se poate adăuga mai târziu.</p>
          </>
        )}

        {step === 1 && (
          <>
            <h2>Unde se lucrează comanda</h2>
            <div className="segment" role="group" aria-label="Unde se lucrează" style={{ maxWidth: 480 }}>
              <button type="button" aria-pressed={where.kind === "intern"} onClick={() => setWhere({ ...where, kind: "intern" })}>VALUEFY (intern)</button>
              <button type="button" aria-pressed={where.kind === "collab"} onClick={() => setWhere({ ...where, kind: "collab" })}>Firmă colaboratoare</button>
            </div>
            {where.kind === "intern" ? (
              <p className="hint">Raportul se emite de VALUEFY, cu numărul următor din serie; contractul clasic se generează automat cu tariful de mai sus.</p>
            ) : (
              <>
                <div className="formRow">
                  <label className="field">Firma colaboratoare
                    <select className="select" value={where.collaboration_id} onChange={(e) => setWhere({ ...where, collaboration_id: e.target.value })}>
                      <option value="">Alege…</option>{p.collabs.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                  </label>
                  <label className="field">Nr. raport <small>(al firmei colaboratoare · opțional)</small><input className="input mono" value={where.report_number} onChange={(e) => setWhere({ ...where, report_number: e.target.value })} maxLength={30} /></label>
                </div>
                <p className="hint">Se creează o comandă nouă în Comenzi › Colaborări{collab ? ` (${collab.label})` : ""}, legată de aceasta, și se procesează imediat. Colaboratorul din portal urmărește tot comanda lui.</p>
              </>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h2>Raport și client</h2>
            <div className="field">Tipul evaluării
              <span className="chips" role="group" aria-label="Tipul evaluării">
                {KINDS.map(([k, l]) => (
                  <button key={k} type="button" className="chip" role="checkbox" aria-checked={rep.valuation_types.includes(k)}
                    onClick={() => setRep({ ...rep, valuation_types: rep.valuation_types.includes(k) ? rep.valuation_types.filter((x) => x !== k) : [...rep.valuation_types, k] })}>{k} · {l}</button>
                ))}
              </span>
            </div>
            <div className="formRow">
              <label className="field">Utilizator desemnat
                <select className="select" value={rep.recipient_id} disabled={rep.client_only} onChange={(e) => setRep({ ...rep, recipient_id: e.target.value })}>
                  <option value="">Alege banca / instituția…</option>{p.parties.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
                <label className="check" style={{ marginTop: 4 }}><input type="checkbox" checked={rep.client_only} onChange={(e) => setRep({ ...rep, client_only: e.target.checked, recipient_id: e.target.checked ? "" : rep.recipient_id })} /><span>Doar clientul</span></label>
              </label>
              <label className="field">Scop
                <select className="select" value={rep.purpose} onChange={(e) => setRep({ ...rep, purpose: e.target.value })}>{[...new Set([rep.purpose, ...p.purposes].filter(Boolean))].map((x) => <option key={x} value={x}>{x}</option>)}</select>
              </label>
            </div>
            <div className="formRow">
              <label className="field">Tip raport
                <select className="select" value={rep.report_type} onChange={(e) => setRep({ ...rep, report_type: e.target.value })}>{[...new Set([rep.report_type, ...p.reportTypes].filter(Boolean))].map((x) => <option key={x} value={x}>{x}</option>)}</select>
              </label>
              <label className="field">Tipul valorii
                <select className="select" value={rep.value_type} onChange={(e) => setRep({ ...rep, value_type: e.target.value })}>{p.valueTypes.map((x) => <option key={x} value={x}>{x}</option>)}</select>
              </label>
            </div>
            <div className="section">Client</div>
            <div className="segment" role="group" aria-label="Tip client" style={{ maxWidth: 380 }}>
              <button type="button" aria-pressed={client.kind === "person"} onClick={() => setClient({ ...client, kind: "person" })}>Persoană fizică</button>
              <button type="button" aria-pressed={client.kind === "company"} onClick={() => setClient({ ...client, kind: "company" })}>Persoană juridică</button>
            </div>
            <div className="formRow">
              <label className="field">{client.kind === "company" ? "Denumire firmă" : "Nume și prenume"}<input className="input" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} /></label>
              {client.kind === "company" && <label className="field">CUI<input className="input mono" value={client.cui} onChange={(e) => setClient({ ...client, cui: e.target.value })} /></label>}
            </div>
            <div className="formRow">
              <label className="field">Telefon<input className="input" type="tel" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} /></label>
              <label className="field">Email<input className="input" type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} /></label>
            </div>
            <div className="section">Echipa</div>
            <div className="formRow">
              <div className="field">Evaluator principal
                <PersonPicker label="Evaluator principal" value={rep.evaluator_id} onChange={(v) => setRep({ ...rep, evaluator_id: v })} people={p.evaluators.filter((x) => dutyIn(x.duties, "evaluator"))} me={p.me} />
              </div>
              <div className="field">Verificator <small>(opțional)</small>
                <PersonPicker label="Verificator" value={rep.verifier_id} onChange={(v) => setRep({ ...rep, verifier_id: v })} people={p.evaluators.filter((x) => x.id !== rep.evaluator_id && dutyIn(x.duties, "verifier"))} me={p.me}
                  extras={[{ value: "", label: "Mai târziu", hint: "se alege după creare" }]} placeholder="Mai târziu" />
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Bunul evaluat</h2>
            <p className="hint">Completat din comandă: verifică și adaugă ce lipsește (CF, nr. cadastral). {o.docs ? `Cele ${o.docs} acte ale comenzii se atașează automat la bunul principal.` : "Comanda nu are acte încărcate."}</p>
            <AssetsEditor required assets={assets} setAssets={setAssets} client={{ name: client.name, phone: client.phone }} />
            <div className="summaryBox">
              <b>{client.name || "—"}</b> · {t.fee} lei + TVA · {t.term_days} zile{t.urgent ? " · urgent" : ""}
              <span className="muted block">{where.kind === "intern" ? "VALUEFY" : collab?.label ?? "colaborare"} · {rep.valuation_types.join(", ")} · {assets.map((a) => capType(a.type) || "bun").join(", ")}</span>
            </div>
          </>
        )}

        {msg && <div role="alert" className="error">{msg}</div>}
        <div className="actions" style={{ justifyContent: "space-between" }}>
          {step > 0 ? <button type="button" className="btn btnGhost" onClick={() => setStep(step - 1)}>← Înapoi</button> : <span />}
          {step < 3
            ? <button type="button" className="btn btnNavy" onClick={() => go(step + 1)}>Continuă →</button>
            : <button type="button" className="btn btnGold" disabled={busy} onClick={submit}>{busy ? "Se procesează…" : "Procesează și creează raportul"}</button>}
        </div>
      </section>
    </div>
  );
}
