import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { can } from "@/lib/perms";
import { history } from "@/lib/history";
import { getQuote, isExpired, quoteAssets, quoteCode, QUOTE_STATUS, SENT_VIA } from "@/lib/quotes";
import { contractChoices } from "@/lib/contract-orders";
import { evaluatorChoices } from "@/lib/dossier";
import { getBilling } from "@/lib/billing";
import { capType } from "@/lib/asset-labels";
import { CrmShell } from "@/components/CrmShell";
import { History } from "@/components/History";
import { QuoteActions } from "./QuoteActions";
import { MiniMap, type MiniPoint } from "@/components/MiniMap";
import { parseGeo } from "@/lib/registry";
import { offerLink } from "@/lib/offer-emails";

export const metadata: Metadata = { title: "Ofertă | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** One offer: what was offered to whom, its state, and the way into work (direct or on a collaboration). */
export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage("orders");
  const { id } = await params;
  const q = await getQuote(db, id);
  if (!q) notFound();
  if (!can(user, "orders.all") && q.created_by !== user.id) notFound();
  const [{ collabs }, evaluators, billing, log, publicLink] = await Promise.all([contractChoices(db), evaluatorChoices(db), getBilling(db), history(db, [id]), q.token && q.sent_at ? offerLink({ token: q.token }) : Promise.resolve(null)]);
  const assets = quoteAssets(q);
  const exp = isExpired(q);
  const [label, cls] = exp ? ["Expirată", "pillWarn"] : QUOTE_STATUS[q.status];
  const lei = (n: number) => `${n.toLocaleString("ro-RO", { maximumFractionDigits: 2 })} lei`;
  const Row = ({ k, children }: { k: string; children?: React.ReactNode }) => (children || children === 0 ? <div><dt>{k}</dt><dd>{children}</dd></div> : null);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
  return (
    <CrmShell back={{ href: `${base}/oferte`, label: "Oferte" }} user={user} base={base} active="quotes" title={`Oferta ${quoteCode(q)}`}
      subtitle={`${q.client_name}${q.fee ? ` · ${lei(q.fee)} fără TVA` : ""} · ${label.toLowerCase()}`}>
      <div className="cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <div className="cardHead"><h2>Oferta</h2><span className={`pill ${cls}`}><i />{label}</span></div>
            <dl className="kv">
              <Row k="Client"><b>{q.client_name}</b>{q.client_kind === "company" ? " · PJ" : ""}{q.client_cui ? ` · CUI ${q.client_cui}` : ""}{q.client_id && <> · <a className="link" href={`${base}/clienti/${q.client_id}`}>fișa clientului</a></>}</Row>
              <Row k="Contact">{[q.client_phone, q.client_email].filter(Boolean).join(" · ")}</Row>
              <Row k="Recomandată de">{q.referral_user_id ? <a className="link" href={`${base}/utilizatori/${q.referral_user_id}`}>{q.referral_name ?? "colaborator"}</a> : q.referral_name ?? null}</Row>
              <Row k="Onorariu">{q.fee != null ? <><span className="mono num">{lei(q.fee)}</span> fără TVA <small className="muted">· {lei(Math.round(q.fee * (1 + billing.vatPercent / 100) * 100) / 100)} cu TVA</small></> : <span className="muted">de stabilit</span>}</Row>
              <Row k="Scop · tip">{[q.purpose, q.report_type].filter(Boolean).join(" · ")}</Row>
              <Row k="Termen propus">{q.term_days ? `${q.term_days} zile lucrătoare` : null}</Row>
              <Row k="Plata">{(q.payment_terms ?? "50% avans la acceptare, 50% la livrarea raportului").split(/[.,] (?=[A-ZÎȘȚ]|prin )/)[0]}</Row>
              <Row k="Valabilă până">{q.valid_until ? <span className={exp ? "errTxt" : undefined}>{fmtDate(q.valid_until)}{exp ? " · expirată" : ""}</span> : null}</Row>
              <Row k="Transmisă">{q.sent_at ? `${fmtDate(q.sent_at, true)}${q.sent_via ? ` · ${SENT_VIA.find(([k]) => k === q.sent_via)?.[1].toLowerCase()}` : ""}${q.sent_to ? ` · ${q.sent_to}` : ""}` : null}</Row>
              <Row k="Pagina publică">{publicLink ? <><a className="link" href={publicLink} target="_blank" rel="noopener">deschide ↗</a>{q.viewed_at ? ` · văzută de client ${fmtDate(q.viewed_at, true)}` : " · neaccesată încă"}</> : null}</Row>
              <Row k="Răspuns">{q.decided_at ? `${q.status === "accepted" || q.status === "converted" ? `acceptată${q.accepted_name ? ` și semnată de ${q.accepted_name}` : ""}` : q.status === "cancelled" ? "anulată" : "refuzată"} ${fmtDate(q.decided_at, true)}${q.decline_reason ? ` · ${q.decline_reason}` : ""}` : null}</Row>
              <Row k="Dacă acceptă">{q.channel === "collab" ? `pe colaborare${q.collab_firm ? ` · ${q.collab_firm}` : ""}` : q.channel === "direct" ? "direct · contract clasic" : "se decide la conversie"}</Row>
              {q.urgent ? <Row k="Prioritate"><span className="pill pillErr"><i />Urgent</span></Row> : null}
              <Row k="Note"><span style={{ whiteSpace: "pre-wrap" }}>{q.notes}</span></Row>
              <Row k="Pentru inspecție"><span style={{ whiteSpace: "pre-wrap" }}>{q.inspection_notes}</span></Row>
            </dl>
            {q.signature && (
              <div className="qtSig">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={q.signature} alt={`Semnătura ${q.accepted_name ?? ""}`} />
                <small className="muted">Semnată online{q.content_hash ? ` · amprentă ${q.content_hash.slice(0, 16)}` : ""}</small>
              </div>
            )}
            {q.status === "converted" && (
              <div className="note">Convertită {fmtDate(q.converted_at, true)} în {q.channel === "collab" ? "comandă pe colaborare" : "lucrare directă"}:{" "}
                {q.report_id && <a className="link" href={`${base}/rapoarte/${q.report_id}`}>raport {q.report_number ?? ""}</a>}
                {q.order_id && <> · <a className="link" href={`${base}/comenzi/${q.order_id}`}>comanda{q.order_seq ? ` CO-${q.order_seq}` : ""}</a></>}
                {q.contract_id && <> · <a className="link" href={`${base}/contracte/${q.contract_id}`}>contract {q.contract_number ?? ""}</a></>}
              </div>
            )}
            <QuoteActions id={q.id} status={q.status} base={base} canEdit={can(user, "orders.E")} canDelete={can(user, "orders.D")} canConvert={can(user, "orders.A")}
              collabs={collabs.map((c) => ({ id: c.id, firm: c.firm, number: c.number }))} me={user.id} channel={q.channel} collaborationId={q.collaboration_id} hasEmail={!!q.client_email} email={q.client_email ?? ""} hasFee={!!q.fee} publicLink={publicLink}
              evaluators={evaluators.map((e) => ({ id: e.id, name: e.name, sub: e.sub, presence: e.presence, seen: e.seen, photo: e.photo, duties: e.duties }))} />
          </section>
          <section className="card">
            <h2>Bunuri de evaluat <span className="muted">· {assets.length}</span></h2>
            {assets.length === 0 ? <p className="hint">Niciun bun.</p> : (
              <ul className="qtAssets">
                {assets.map((a, i) => (
                  <li key={i}>
                    <b>{i + 1}. {capType(str(a.type)) || "Bun"}</b>
                    <span className="muted">{[str(a.full_address), str(a.city), str(a.county)].filter(Boolean).join(", ") || "fără adresă"}</span>
                    <small className="muted">{[str(a.usable_area) && `${a.usable_area} m²`, str(a.cf_number) && `CF ${a.cf_number}`, str(a.cad_building) && `cad. ${a.cad_building}`, str(a.rooms) && `${a.rooms} camere`, str(a.land_area) && `teren ${a.land_area} m²`, str(a.vehicle_make) && `${a.vehicle_make} ${str(a.vehicle_model)}`.trim(), str(a.description)].filter(Boolean).join(" · ")}</small>
                    {(() => {
                      const ll = parseGeo(str(a.geo) || null);
                      const src = (["cadastru", "adresa", "localitate"].includes(str(a.geo_source)) ? str(a.geo_source) : "adresa") as MiniPoint["source"];
                      return ll ? <div className="qtMap"><MiniMap point={{ lat: ll[0], lng: ll[1], source: src }} height={180} /><small className="muted">{src === "cadastru" ? "Din planul cadastral (geoportal)" : src === "adresa" ? "După adresă" : "Aproximativ: centrul localității"}{str(a.geo_note) ? ` · ${a.geo_note}` : ""}</small></div>
                        : str(a.geo_note) ? <small className="muted">Fără punct pe hartă: {a.geo_note}</small> : null;
                    })()}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <h2>Cum merge</h2>
            <ul className="blHow">
              <li><b>Trimite clientului</b> îi dă pe email pagina ofertei (ca ofertele din portal): o citește, o acceptă și o semnează online; vezi aici când a deschis-o și semnătura. Sau marchezi tu pașii: trimisă → acceptată / refuzată.</li>
              <li><b>Convertește în lucrare</b> face comanda și raportul din datele ofertei: <b>direct</b> (contract clasic VALUEFY, cu semnare online) sau <b>pe colaborare</b> (comandă pe firma aleasă, raport emis pe ea).</li>
              <li>Ofertele se pot nota și din Claude, prin conectorul CRM („adaugă oferta…”).</li>
            </ul>
          </section>
          <section className="card">
            <h2>Date</h2>
            <dl className="kv">
              <Row k="Creată">{fmtDate(q.created_at, true)}{q.author ? ` · ${q.author}` : ""}</Row>
              <Row k="Modificată">{fmtDate(q.updated_at, true)}</Row>
            </dl>
          </section>
          <History log={log} />
        </div>
      </div>
    </CrmShell>
  );
}
