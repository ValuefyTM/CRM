import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { niceName } from "@/lib/labels";
import { history } from "@/lib/history";
import { cap, lei, REPORT_STATUS } from "@/lib/reports";
import { orderRef, SOURCE_LABEL } from "@/lib/order-labels";
import { CONTRACT_PURPOSES, getContract, REPORT_KINDS } from "@/lib/contracts";
import { CrmShell } from "@/components/CrmShell";
import { History } from "@/components/History";
import { ContractEdit } from "./ContractEdit";
import { ContractTermsEdit } from "./ContractTermsEdit";
import { SendSign } from "./SendSign";
import { billingMissing, signContractById, signLink } from "@/lib/contract-sign";
import { contractDoc } from "@/lib/contract-doc";
import { DELIVERABLES, VALUE_TYPES } from "@/lib/contract-terms";

export const metadata: Metadata = { title: "Contract | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { person: "Persoană fizică", company: "Persoană juridică", bank: "Bancă", ifn: "IFN" };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage();
  const { id } = await params;
  const d = await getContract(db, id);
  if (!d) notFound();
  const k = d.contract;
  const framework = k.kind === "framework";
  const [log, doc, sign] = await Promise.all([history(db, [id]), framework ? null : contractDoc(db, id), framework ? null : signContractById(db, id)]);
  const signed = !!sign?.signed_at;
  const link = sign?.sign_token ? await signLink(sign.sign_token) : null;
  const missing = doc && !signed ? billingMissing(doc) : [];
  const t = d.totals;

  return (
    <CrmShell user={user} base={base} active="contracts" title={`Contract ${framework ? "cadru" : "clasic"} nr. ${k.number ?? "—"}`}
      subtitle={`${niceName(k.client) || "Fără client"} · semnat ${fmtDate(k.signed_on)}${k.glide_id ? " · importat din Glide" : ""}`}
      actions={<>
        <a href={`${base}/contracte`} className="btn btnGhost btnSm">← Contracte</a>
        {framework
          ? <a href={`${base}/comenzi/noua?contract=${k.id}`} className="btn btnGold btnSm">+ Comandă pe acest contract</a>
          : <>
            <a href={`${base}/contracte/${k.id}/document`} className="btn btnNavy btnSm">{signed ? "Contract semnat (PDF)" : "Document contract (PDF)"}</a>
            <a href={`${base}/contracte/nou?contract=${k.id}`} className="btn btnGold btnSm">+ Raport nou pe acest contract</a>
          </>}
      </>}>
      <div className="dbKpis ibKpis">
        <div className="dbKpi"><span className="dbKpiLabel"><i style={{ background: "var(--ink)" }} />Rapoarte</span><b>{t.n.toLocaleString("ro-RO")}</b></div>
        <div className="dbKpi"><span className="dbKpiLabel"><i style={{ background: "var(--acc)" }} />În lucru</span><b>{t.open}</b></div>
        <div className="dbKpi"><span className="dbKpiLabel"><i style={{ background: "var(--ok)" }} />Finalizate</span><b>{t.done.toLocaleString("ro-RO")}</b></div>
        {framework
          ? <div className="dbKpi"><span className="dbKpiLabel"><i style={{ background: "var(--info)" }} />Comenzi luna aceasta</span><b>{t.month}</b></div>
          : <div className="dbKpi"><span className="dbKpiLabel"><i style={{ background: "var(--acc-ink)" }} />Onorariu contract</span><b className="ctKpiMoney">{lei(k.fee)}</b></div>}
        <div className="dbKpi"><span className="dbKpiLabel"><i style={{ background: "var(--muted)" }} />Onorarii rapoarte</span><b className="ctKpiMoney">{lei(Math.round(t.fees))}</b></div>
      </div>
      <div className="cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <div className="cardHead">
              <h2>Detalii contract</h2>
              {signed ? <span className="muted">semnat · se modifică prin act adițional</span> : <ContractEdit id={k.id} kind={k.kind} purposes={CONTRACT_PURPOSES} reportKinds={REPORT_KINDS}
                initial={{ number: k.number ?? "", signed_on: k.signed_on ?? "", fee: k.fee != null ? String(k.fee) : "", report_type: k.report_type ?? "", purpose: k.purpose ?? "", notes: k.notes ?? "" }} />}
            </div>
            <dl className="dl">
              <div><dt>Tip</dt><dd><span className={`ctKind ${k.kind}`}>{framework ? "Cadru" : "Clasic"}</span></dd></div>
              <div><dt>Număr</dt><dd className="mono">{k.number ?? "—"}</dd></div>
              <div><dt>Data semnării</dt><dd>{fmtDate(k.signed_on)}</dd></div>
              <div><dt>Prestator</dt><dd>VALUEFY</dd></div>
              <div><dt>Servicii</dt><dd>{cap(k.services) || "—"}</dd></div>
              <div><dt>Tip evaluare</dt><dd>{k.valuation_types ?? "—"}</dd></div>
              <div><dt>Tip raport</dt><dd>{k.report_type ?? "—"}</dd></div>
              <div><dt>Scop</dt><dd>{k.purpose ?? "—"}</dd></div>
              <div><dt>{framework ? "Tarif standard" : "Onorariu (fără TVA)"}</dt><dd>{k.fee ? lei(k.fee) : framework ? "grila de tarife a băncii" : "—"}</dd></div>
              {d.order && <div><dt>Provine din</dt><dd><a className="rowLink" href={`${base}/comenzi/${d.order.id}`}>{d.order.seq ? orderRef(d.order.seq) : "comanda"}</a> · {SOURCE_LABEL[d.order.source]?.toLowerCase() ?? d.order.source}{d.order.offer_number ? ` · oferta ${d.order.offer_number} acceptată ${fmtDate(d.order.accepted_at)}` : ""}</dd></div>}
              {k.notes && <div><dt>Note</dt><dd>{k.notes}</dd></div>}
            </dl>
            {framework && <p className="hint">Comenzile băncii se lucrează pe acest contract și se facturează la final de lună pe borderou (sau individual, la predarea raportului, după bancă).</p>}
          </section>

          {doc && (
            <section className="card" id="termeni">
              <div className="cardHead"><h2>Termeni de referință{doc.annexes.length > 1 ? ` · ${doc.annexes.length} rapoarte (Anexele 1.1–1.${doc.annexes.length})` : " (Anexa 1)"}</h2></div>
              <div className="ctAnnexes">
                {doc.annexes.map((x) => (
                  <div key={x.n} className="ctAnnex">
                    <div className="ctAnnexHead">
                      <b>{doc.annexes.length > 1 ? `Anexa 1.${x.n} · ` : ""}{x.purpose ?? "Scop nespecificat"}</b>
                      {x.reportId && !signed ? <ContractTermsEdit id={k.id} report={x.reportId} title={`Termeni de referință${doc.annexes.length > 1 ? ` · Anexa 1.${x.n}` : ""} · ${x.purpose ?? ""}`} terms={x.terms} defaults={x.defaults} />
                        : <span className="muted">{signed ? "semnat" : "după crearea raportului"}</span>}
                    </div>
                    <dl className="dl">
                      <div><dt>Livrabil</dt><dd>{DELIVERABLES.find(([v]) => v === x.terms.deliverable)?.[1]}{x.terms.deliverable === "nop" ? (x.terms.nop_inspection ? ", cu inspecție" : ", fără inspecție") : ""}{x.reportType && x.reportType !== DELIVERABLES.find(([v]) => v === x.terms.deliverable)?.[1] ? ` · ${x.reportType}` : ""}</dd></div>
                      <div><dt>Termen</dt><dd>{x.terms.term_days} zile lucrătoare de la inspecție</dd></div>
                      <div><dt>Tipul valorii</dt><dd>{VALUE_TYPES.find(([v]) => v === x.terms.value_type)?.[1]}</dd></div>
                      <div><dt>Utilizatori</dt><dd>{x.terms.users}</dd></div>
                      <div><dt>Bunuri</dt><dd>{x.assets.length ? x.assets.map((a) => `${a.type}${a.shared ? " (inspecție comună)" : ""}`).join(", ") : "—"}</dd></div>
                      {doc.annexes.length > 1 && <div><dt>Preț</dt><dd>{x.fee != null ? `${x.fee.toLocaleString("ro-RO")} lei` : "—"}</dd></div>}
                    </dl>
                  </div>
                ))}
              </div>
              <div className="cardHead ctPayHead"><h2>Plată (Anexa 2)</h2>{!signed && <ContractTermsEdit id={k.id} report={null} title="Condiții de plată · Anexa 2" terms={doc.payment} defaults={doc.paymentDefaults} />}</div>
              <dl className="dl">
                <div><dt>Preț total</dt><dd>{doc.total != null ? `${doc.total.toLocaleString("ro-RO")} lei + TVA` : "—"}</dd></div>
                <div><dt>Plata</dt><dd>{doc.payment.payment_when}</dd></div>
                <div><dt>Tranșe</dt><dd>{doc.payment.tranches.split(/\n+/).join(" · ")}</dd></div>
              </dl>
            </section>
          )}
          <section className="card flush">
            <div className="cardHead"><h2>{framework ? "Comenzi și rapoarte pe contract" : "Rapoarte pe contract"}</h2>{t.n > d.reports.length && <span className="muted">ultimele {d.reports.length} din {t.n.toLocaleString("ro-RO")}</span>}</div>
            {d.reports.length === 0 ? <div className="empty">Niciun raport pe acest contract.</div> : (
              <ul className="ctReports">
                {d.reports.map((r) => {
                  const [label, cls] = REPORT_STATUS[r.status] ?? [r.status, ""];
                  const [type, address] = (r.asset ?? "|").split("|");
                  return (
                    <li key={r.id}>
                      <span className="ctThumb" aria-hidden>{r.photo ? <img src={r.photo} alt="" loading="lazy" /> : <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="currentColor" /></svg>}</span>
                      <span className="who">
                        <a className="rowLink" href={`${base}/rapoarte/${r.id}`}>{r.number ? `Raport ${r.number}` : r.label ?? "Raport"}</a>
                        <span className="muted">{[cap(type), address].filter(Boolean).join(" · ") || r.label}</span>
                        <span className="muted">{fmtDate(r.received_on ?? r.report_date)} · {r.evaluator ?? "—"}{r.fee ? ` · ${lei(r.fee)}` : ""}</span>
                      </span>
                      <span className={`pill ${cls}`}><i />{label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          {sign && (
            <section className={`card ${signed ? "ctSigned" : ""}`}>
              <div className="cardHead"><h2>Semnare online</h2>
                <span className={`pill ${signed ? "pillOk" : sign.sign_viewed_at ? "pillWarn" : ""}`}><i />{signed ? "Semnat" : sign.sign_viewed_at ? "Deschis de client" : sign.sign_sent_at ? "Trimis" : "Netrimis"}</span></div>
              {signed ? (
                <dl className="dl">
                  <div><dt>Semnat de</dt><dd>{sign.signed_name}</dd></div>
                  <div><dt>Data</dt><dd>{fmtDate(sign.signed_at, true)}</dd></div>
                  {sign.signed_ip && <div><dt>IP</dt><dd className="mono">{sign.signed_ip}</dd></div>}
                  <div><dt>Amprentă</dt><dd className="mono" title={sign.signed_hash ?? ""}>{sign.signed_hash?.slice(0, 16)}…</dd></div>
                </dl>
              ) : (
                <>
                  {sign.sign_sent_at && <p className="hint" style={{ margin: 0 }}>Trimis la {sign.sign_sent_to} · {fmtDate(sign.sign_sent_at, true)}{sign.sign_viewed_at ? ` · deschis ${fmtDate(sign.sign_viewed_at, true)}` : ""}</p>}
                  {missing.length > 0 && <p className="hint" style={{ margin: 0 }}>Clientul va completa la semnare: {missing.join(", ")}.</p>}
                  <SendSign id={k.id} email={sign.sign_sent_to ?? k.client_email ?? ""} again={!!sign.sign_sent_at} link={link} />
                </>
              )}
              {signed && <a className="btn btnNavy btnSm" href={`${base}/contracte/${k.id}/document`}>Vezi contractul semnat</a>}
            </section>
          )}
          <section className="card">
            <h2>{framework ? "Banca" : "Client"}</h2>
            {k.client_id ? (
              <dl className="dl">
                <div><dt>Nume</dt><dd><a className="rowLink" href={`${base}/clienti/${k.client_id}`}>{niceName(k.client)}</a></dd></div>
                <div><dt>Tip</dt><dd>{KIND[k.client_kind ?? ""] ?? k.client_kind ?? "—"}</dd></div>
                {k.client_cui && <div><dt>CUI</dt><dd className="mono">{k.client_cui}</dd></div>}
                {k.client_phone && <div><dt>Telefon</dt><dd><a href={`tel:${k.client_phone}`}>{k.client_phone}</a></dd></div>}
                {k.client_email && <div><dt>Email</dt><dd><a href={`mailto:${k.client_email}`}>{k.client_email}</a></dd></div>}
                {k.client_city && <div><dt>Localitate</dt><dd>{k.client_city}</dd></div>}
              </dl>
            ) : <p className="hint">Contractul nu are client legat.</p>}
          </section>
          <section className="card">
            <h2>Facturare</h2>
            <p className="hint" style={{ margin: 0 }}>{framework ? "Pe borderoul lunar al băncii." : "O singură factură pe contract, cu câte o linie pentru fiecare raport (ca în Anexa 2), emisă din Oblio (în curând)."}</p>
          </section>
          <History log={log} />
        </div>
      </div>
    </CrmShell>
  );
}
