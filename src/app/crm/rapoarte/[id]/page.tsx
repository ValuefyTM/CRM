import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { cap, getReport, INSPECTION_STATUS, lei, propertyHistory, REPORT_STATUS, reportAssets, reportTeam, ROLE_LABEL } from "@/lib/reports";
import { CrmShell } from "@/components/CrmShell";
import { ReportList } from "@/components/ReportList";

export const metadata: Metadata = { title: "Raport | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { person: "Persoană fizică", company: "Persoană juridică", bank: "Bancă" };
const CONTACT: Record<string, string> = { client: "Clientul", owner: "Proprietarul", agent: "Agent imobiliar", other: "Altă persoană" };
const APPROACH: Record<string, string> = { market: "Abordarea prin piață", income: "Abordarea prin venit", cost: "Abordarea prin cost" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage();
  const { id } = await params;
  const r = await getReport(db, id);
  if (!r) notFound();
  const [team, assets] = await Promise.all([reportTeam(db, id), reportAssets(db, id)]);
  const main = assets[0];
  const history = main ? await propertyHistory(db, main.property_id, id) : [];
  const [label, cls] = REPORT_STATUS[r.status] ?? [r.status, ""];

  return (
    <CrmShell
      user={user} base={base} active="reports" title={r.label ?? `Raport ${r.number ?? ""}`}
      subtitle={`${r.report_type ?? "Raport"} · ${r.issuer_name ?? ""}${r.report_date ? ` · ${fmtDate(r.report_date)}` : ""}`}
      actions={<a href={`${base}/rapoarte`} className="btn btnGhost btnSm">← Rapoarte</a>}
    >
      {r.status === "suspended" && r.suspend_reason && <div className="note"><b>Suspendat:</b> {r.suspend_reason}</div>}
      <div className="cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <div className="cardHead"><h2>Raport nr. {r.number ?? "—"}</h2><span className={`pill ${cls}`}><i />{label}</span></div>
            <dl className="dl">
              <div><dt>Tip raport</dt><dd>{r.report_type ?? "—"}</dd></div>
              <div><dt>Tip evaluare</dt><dd>{r.valuation_types?.replace(/,/g, ", ") ?? "—"}</dd></div>
              <div><dt>Scop</dt><dd>{r.purpose ?? "—"}</dd></div>
              <div><dt>Tip valoare</dt><dd>{r.value_type ?? "—"}</dd></div>
              <div><dt>Valoare rezultată</dt><dd>{lei(r.result_value, r.currency === "EUR" ? "EUR" : "lei")}</dd></div>
              <div><dt>Data evaluării</dt><dd>{fmtDate(r.valuation_date)}</dd></div>
              <div><dt>Data raportului</dt><dd>{fmtDate(r.report_date)}</dd></div>
              <div><dt>Intrat în lucru</dt><dd>{fmtDate(r.received_on)}</dd></div>
              <div><dt>Onorariu</dt><dd>{lei(r.fee)}</dd></div>
              {r.collab_fee != null && <div><dt>Onorariu VALUEFY (colaborare)</dt><dd>{lei(r.collab_fee)}</dd></div>}
              <div><dt>Emitent</dt><dd>{r.issuer_name ?? "—"}</dd></div>
              {r.reporting_year && <div><dt>An raportare ANEVAR</dt><dd>{r.reporting_year}</dd></div>}
            </dl>
          </section>

          {assets.map((a, i) => {
            const [ins, insCls] = INSPECTION_STATUS[a.inspection_status ?? ""] ?? ["—", ""];
            return (
              <section key={a.id} className="card">
                <div className="cardHead">
                  <h2>{assets.length > 1 ? `Bunul ${i + 1}${a.is_main ? " · principal" : ""}` : "Bunul evaluat"}</h2>
                  {a.value != null && <span className="pill pillOk"><i />{lei(a.value)}</span>}
                </div>
                {(a.image_url || a.sheet_photo) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="assetImg" src={(a.sheet_photo ?? a.image_url)!} alt="" loading="lazy" />
                )}
                <dl className="dl">
                  <div><dt>Tip</dt><dd>{cap(a.type) || "—"}{a.construction === "under_construction" ? " · în construcție" : ""}</dd></div>
                  <div style={{ gridColumn: "1 / -1" }}><dt>Adresă</dt><dd>{a.full_address ?? a.city ?? "—"}</dd></div>
                  <div><dt>Carte funciară</dt><dd className="mono">{a.cf_number ?? "—"}</dd></div>
                  {a.cad_building && a.cad_building !== a.cf_number && <div><dt>Nr. cadastral</dt><dd className="mono">{a.cad_building}</dd></div>}
                  {a.usable_area && <div><dt>Suprafață utilă</dt><dd>{a.usable_area.toLocaleString("ro-RO")} mp</dd></div>}
                  {a.year_built && <div><dt>An construcție</dt><dd>{a.year_built}</dd></div>}
                  {a.approach && <div><dt>Abordare</dt><dd>{APPROACH[a.approach]}</dd></div>}
                  {a.geo && <div><dt>Localizare</dt><dd><a className="rowLink" href={`https://www.google.com/maps?q=${encodeURIComponent(a.geo)}`} target="_blank" rel="noopener">Hartă →</a></dd></div>}
                </dl>
                <div className="section">Inspecție</div>
                <dl className="dl">
                  <div><dt>Status</dt><dd><span className={`pill ${insCls}`}><i />{ins}</span></dd></div>
                  <div><dt>Data</dt><dd>{fmtDate(a.done_at ?? a.scheduled_at, true)}</dd></div>
                  <div><dt>Inspector</dt><dd>{a.inspector ?? "—"}</dd></div>
                  <div><dt>Contact</dt><dd>{a.contact_kind ? CONTACT[a.contact_kind] : "—"}{a.contact_name ? ` · ${a.contact_name}` : ""}{a.contact_phone ? ` · ${a.contact_phone}` : ""}</dd></div>
                  {a.sheet_person && <div><dt>Prezent la inspecție</dt><dd>{a.sheet_person}</dd></div>}
                </dl>
                {(a.description ?? a.sheet_description) && <p className="prose">{a.description ?? a.sheet_description}</p>}
                {(a.cf_file || a.plan_file) && <p className="hint">Documente în Glide (de mutat): {[a.cf_file && "extras CF", a.plan_file && "releveu"].filter(Boolean).join(", ")}.</p>}
              </section>
            );
          })}
          {assets.length === 0 && <section className="card"><h2>Bunuri evaluate</h2><p className="hint">Raportul nu are bunuri înregistrate.</p></section>}

          {r.market_analysis && (
            <section className="card">
              <h2>Analiza de piață</h2>
              <p className="prose">{r.market_analysis}</p>
            </section>
          )}
          <ReportList reports={history} base={base} title="Alte evaluări ale aceleiași proprietăți" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <h2>Client</h2>
            <dl className="dl">
              <div style={{ gridColumn: "1 / -1" }}><dt>{r.client_kind ? KIND[r.client_kind] ?? "Client" : "Client"}</dt><dd>{r.client_name ?? "—"}</dd></div>
              {r.client_phone && <div><dt>Telefon</dt><dd><a href={`tel:${r.client_phone.replace(/\s/g, "")}`}>{r.client_phone}</a></dd></div>}
              {r.client_email && <div><dt>Email</dt><dd><a href={`mailto:${r.client_email}`}>{r.client_email}</a></dd></div>}
              {r.client_cui && <div><dt>CUI</dt><dd>{r.client_cui}</dd></div>}
              {r.client_address && <div style={{ gridColumn: "1 / -1" }}><dt>Adresă facturare</dt><dd>{r.client_address}</dd></div>}
            </dl>
            <div className="section">Destinatar</div>
            <dl className="dl">
              <div><dt>Bancă / utilizator</dt><dd>{r.bank_name ?? "—"}</dd></div>
              {r.bank_branch && <div><dt>Agenție</dt><dd>{r.bank_branch}</dd></div>}
              {r.referral_name && <div><dt>Adus de</dt><dd><a className="rowLink" href={`${base}/utilizatori/${r.referral_id}`}>{r.referral_name}</a></dd></div>}
            </dl>
          </section>
          <section className="card">
            <h2>Echipa</h2>
            {team.length === 0 ? <p className="hint">Nimeni alocat.</p> : (
              <ul className="people">
                {team.map((m) => (
                  <li key={m.role + m.id}><span className="who"><a className="rowLink" href={`${base}/utilizatori/${m.id}`}>{m.name || m.email}</a></span><span className="pill"><i />{ROLE_LABEL[m.role] ?? m.role}</span></li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2>Contract și comandă</h2>
            <dl className="dl">
              <div><dt>Contract</dt><dd>{r.contract_number ? `${r.contract_kind === "framework" ? "Cadru" : "Clasic"} nr. ${r.contract_number}` : "—"}</dd></div>
              {r.contract_date && <div><dt>Din</dt><dd>{fmtDate(r.contract_date)}</dd></div>}
              {r.contract_fee != null && r.contract_kind !== "framework" && <div><dt>Tarif contract</dt><dd>{lei(r.contract_fee)}</dd></div>}
              <div><dt>Comandă</dt><dd>{r.order_id ? <a className="rowLink" href={`${base}/comenzi/${r.order_id}`}>Vezi comanda →</a> : "—"}</dd></div>
            </dl>
          </section>
        </div>
      </div>
    </CrmShell>
  );
}
