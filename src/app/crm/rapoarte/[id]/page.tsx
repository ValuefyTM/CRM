import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, initials, staffPage } from "@/lib/guard";
import {
  cap, getReport, INSPECTION_STATUS, lei, propertyHistory, REPORT_STATUS, reportAssets, reportDocuments, reportLog, reportOrderDocuments, reportTeam, ROLE_LABEL, teamCandidates,
} from "@/lib/reports";
import { fileSrc } from "@/lib/files";
import { fmtSize } from "@/lib/orders";
import { orderCode, SOURCE_LABEL } from "@/lib/order-labels";
import { SPECIALIZATIONS } from "@/lib/labels";
import { CrmShell } from "@/components/CrmShell";
import { ReportList } from "@/components/ReportList";
import { AllocateAll, AssignInspection, CancelInspection, NeedsInspection, type AllocRow } from "./InspectionActions";
import { AssetEditor, RemoveAsset } from "./AssetEditor";
import { emptyAsset, type AssetForm } from "@/lib/asset-labels";
import { canAssign, inspectorChoices } from "@/lib/insp-assign";
import { guessSheetType } from "@/lib/insp-forms";
import { docsByAsset, guessDocType } from "@/lib/insp-docs";
import { AddMember, DeleteDoc, DocTypeSelect, DeliverButton, FinalDrop, MissingDoc, NotesEditor, RemoveMember, SafeImg, StageActions, StatusButton, UploadButton } from "./ReportActions";
import { dueOf, STAGE_LABEL, STAGE_ORDER, stageOf } from "@/lib/dossier";
import { nextReportNumber, noticeTarget } from "@/lib/delivery";

export const metadata: Metadata = { title: "Raport | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { person: "Persoană fizică", company: "Persoană juridică", bank: "Bancă", ifn: "IFN", uat: "Instituție publică", anaf: "ANAF", broker: "Broker" };
const CONTACT: Record<string, string> = { client: "Clientul", owner: "Proprietarul", agent: "Agent imobiliar", other: "Altă persoană" };
const APPROACH: Record<string, string> = { market: "Piață", income: "Venit", cost: "Cost" };
const VAL_TYPE: Record<string, string> = { EPI: "EPI — proprietăți imobiliare", EBM: "EBM — bunuri mobile", EI: "EI — întreprinderi", EIF: "EIF — instrumente financiare" };
const TABS = [["general", "General"], ["bunuri", "Bunuri"], ["echipa", "Echipă"], ["utilizatori", "Utilizatori"], ["inspectii", "Inspecții"], ["documente", "Documente & Livrare"]] as const;
type Tab = (typeof TABS)[number][0];

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return "chiar acum";
  if (m < 60) return `acum ${m} min`;
  if (m < 60 * 24) return `acum ${Math.round(m / 60)} h`;
  if (m < 60 * 24 * 45) return `acum ${Math.round(m / 60 / 24)} zile`;
  return `la ${fmtDate(iso)}`;
};
const ext = (name: string) => (name.match(/\.(\w{2,4})$/)?.[1] ?? "doc").toUpperCase();
const specs = (s: string | null) => (s ? s.split(",").filter((k) => SPECIALIZATIONS.some(([v]) => v === k)).join(", ") : "");

/** Values of an asset for its edit form. */
const assetForm = (a: Awaited<ReturnType<typeof reportAssets>>[number]): AssetForm => ({
  id: a.id, category: a.category ?? "REZIDENTIAL", type: a.type ?? "", construction: a.construction ?? "existing", county: a.county ?? "", city: a.city ?? "",
  full_address: a.full_address ?? "", cf_number: a.cf_number ?? "", cad_building: a.cad_building ?? "", cad_land: a.cad_land ?? "",
  usable_area: a.usable_area != null ? String(a.usable_area) : "", year_built: a.year_built != null ? String(a.year_built) : "", description: a.description ?? "",
  is_main: !!a.is_main, value: a.value != null ? String(a.value) : "", approach: a.approach ?? "", notes: a.notes ?? "",
  contact_kind: a.a_contact_kind ?? "client", contact_name: a.a_contact_name ?? "", contact_phone: a.a_contact_phone ?? "",
});

function Row({ k, children }: { k: string; children?: React.ReactNode }) {
  return <div><dt>{k}</dt><dd>{children ?? "—"}</dd></div>;
}

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; alocare?: string }> }) {
  const { db, user, base } = await staffPage();
  const { id } = await params;
  const { tab: wanted, alocare } = await searchParams;
  const tab: Tab = TABS.find(([k]) => k === wanted)?.[0] ?? "general";
  const r = await getReport(db, id);
  if (!r) notFound();
  const [team, assets, docs, orderDocs, people] = await Promise.all([
    reportTeam(db, id), reportAssets(db, id), reportDocuments(db, id), reportOrderDocuments(db, r.order_id), teamCandidates(db),
  ]);
  const main = assets.find((a) => a.is_main) ?? assets[0];
  const [mayAssign, inspectors, inspDocs] = await Promise.all([canAssign(db, user, id), inspectorChoices(db, user.id), docsByAsset(db, id, assets.map((a) => a.id))]);
  const docState = (assetId: string) => ({ cf: !!inspDocs[assetId]?.cf.length, rlv: !!inspDocs[assetId]?.rlv.length });
  type A = (typeof assets)[number];
  const isActive = (a: A) => !!a.inspection_id && !a.inspection_from_glide && (a.inspection_status === "to_schedule" || a.inspection_status === "scheduled");
  // Who shows the asset: the open task's contact, else the asset's own, else the client.
  const contactOf = (a: A) => {
    const task = isActive(a) || a.inspection_status === "done";
    const own = a.a_contact_kind && a.a_contact_kind !== "client";
    return {
      contact_kind: (task && a.contact_kind) || a.a_contact_kind || "client",
      contact_name: (task && a.contact_name) || a.a_contact_name || (own ? null : r.client_name),
      contact_phone: (task && a.contact_phone) || a.a_contact_phone || (own ? null : r.client_phone),
    };
  };
  const inspState = (a: A): AllocRow["state"] => a.inspection_status === "done" ? "done" : isActive(a) ? "open" : a.no_inspection ? "none" : "free";
  const assetLabel = (a: A) => `${cap(a.type) || "Bun"}${a.full_address ? ` · ${a.full_address}` : ""}`;
  const [history, log, suggested, notifyTo] = await Promise.all([
    main ? propertyHistory(db, main.property_id, id) : Promise.resolve([]), reportLog(db, r, assets),
    r.number ? Promise.resolve("") : nextReportNumber(db), r.delivered_at ? Promise.resolve(null) : noticeTarget(db, r.order_id),
  ]);
  // Working stage and deadline (from the offer: working days counted from the inspection).
  const tasks = assets.filter((a) => a.inspection_status && a.inspection_status !== "cancelled");
  const stage = stageOf(r, { total: tasks.length, done: tasks.filter((a) => a.inspection_status === "done").length, none: assets.filter((a) => a.no_inspection).length });
  const inspectedOn = tasks.map((a) => a.done_at).filter((d): d is string => !!d).sort().pop()?.slice(0, 10) ?? null;
  const due = dueOf(r, inspectedOn);
  const late = !!due && stage !== "delivered" && due < new Date().toISOString().slice(0, 10);
  const [label, cls] = REPORT_STATUS[r.status] ?? [r.status, ""];
  const cur = r.currency === "EUR" ? "EUR" : "lei";
  const evaluator = team.find((m) => m.role === "evaluator");
  const verifier = team.find((m) => m.role === "verifier");
  const inspected = assets.filter((a) => a.inspection_status);
  const toSchedule = inspected.filter((a) => a.inspection_status === "to_schedule").length;
  const sources = docs.filter((d) => d.kind === "source");
  const missing = sources.filter((d) => d.status === "missing");
  const final = docs.find((d) => d.kind === "final" && d.status === "uploaded");
  const glideFiles = assets.flatMap((a) => [
    a.cf_file ? { name: `Extras CF ${a.cf_number ?? ""}`.trim(), path: a.cf_file } : null,
    a.plan_file ? { name: `Releveu ${cap(a.type)}`.trim(), path: a.plan_file } : null,
  ].filter((x): x is { name: string; path: string } => !!x));
  const docCount = sources.length + orderDocs.length + glideFiles.length + (final ? 1 : 0);
  const mains = assets.filter((a) => a.is_main).length;
  const assetsTotal = assets.reduce((s, a) => s + (a.value ?? 0), 0);
  const order = r.order_id ? orderCode({ id: r.order_id, seq: r.order_seq, bank_ref: r.order_bank_ref, bank: r.bank_code, source: r.order_source ?? undefined }) : null;
  type Recipient = { id: string; name: string; kind: string | null; role: string; contact: string; link?: boolean };
  const recipients: Recipient[] = [];
  if (r.recipient_id) recipients.push({ id: r.recipient_id, name: r.bank_name ?? "—", kind: r.recipient_kind, role: "Finanțator / utilizator desemnat", contact: [r.recipient_email, r.recipient_phone, r.recipient_code && `cod ${r.recipient_code}`].filter(Boolean).join(" · ") });
  if (r.client_id) recipients.push({ id: r.client_id, name: r.client_name ?? "—", kind: r.client_kind, role: r.recipient_id ? "Client / proprietar" : "Client / utilizator desemnat", contact: [r.client_phone, r.client_email].filter(Boolean).join(" · "), link: true });
  const checks: [state: "ok" | "miss" | "todo", text: string, note?: string][] = [
    main?.no_inspection ? ["ok", "Bun principal fără inspecție", main.no_inspection] : [main?.sheet_photo || main?.inspection_status === "done" ? "ok" : "todo", "Fișă inspecție bun principal atașată"],
    [assets.length > 0 && assets.every((a) => a.value != null) ? "ok" : "todo", "Valori completate pe toate bunurile", assets.length ? `${assets.filter((a) => a.value != null).length} din ${assets.length}` : "niciun bun"],
    ...missing.map((d): ["miss", string, string] => ["miss", `${d.filename} lipsă`, "blochează predarea"]),
    [evaluator ? "ok" : "todo", "Evaluator alocat", evaluator?.name],
    [verifier ? "ok" : "todo", `Verificare finală${verifier ? ` (${verifier.name})` : ""}`, verifier ? undefined : "verificator nealocat"],
    [final ? "ok" : "todo", "PDF semnat încărcat"],
  ];
  const href = (t: Tab) => `${base}/rapoarte/${id}${t === "general" ? "" : `?tab=${t}`}`;
  const counts: Partial<Record<Tab, number>> = { bunuri: assets.length, echipa: team.length, utilizatori: recipients.length, inspectii: inspected.length, documente: docCount };
  const logo = fileSrc(r.issuer_logo);

  return (
    <CrmShell
      user={user} base={base} active="reports" title={`${r.number ? `Raport nr. ${r.number}` : r.label ?? "Raport"} · Detaliu raport`}
      subtitle={`Operațional / Rapoarte${r.label ? ` · ${r.label}` : ""}`}
      actions={<a href={`${base}/rapoarte`} className="btn btnGhost btnSm">← Rapoarte</a>}
    >
      <section className="rHero">
        <div className="rHeroTop">
          <div className="rLogo">
            {logo ? <SafeImg src={logo} alt={r.issuer_name ?? ""} fallback={<span>{initials(r.issuer_name ?? "VALUEFY", "v")}</span>} /> : <span>{initials(r.issuer_name ?? "VALUEFY", "v")}</span>}
          </div>
          <div className="rHeroMain">
            <p className="eyebrow">Raport de evaluare{r.valuation_types && <span> · {r.valuation_types.split(",").map((v) => VAL_TYPE[v] ?? v).join(", ")}</span>}</p>
            <div className="rTitle">
              <h2>{r.number ? `Nr. ${r.number}` : "Fără număr"}</h2>
              <span className={`pill ${cls}`}><i />{label}</span>
              {r.delivered_at && <span className="pill pillOk"><i />Predat</span>}
            </div>
            <div className="rChips">
              {r.client_name && <a className="rChip" href={`${base}/clienti/${r.client_id}`}><span className="av">{initials(r.client_name, "c")}</span>{r.client_name}</a>}
              {r.bank_name && <span className="rChip"><span className="av gold">{(r.bank_code ?? r.bank_name).slice(0, 3).toUpperCase()}</span>{r.bank_name}</span>}
              {r.contract_number && <span className="rMeta">Contract <u>{r.contract_kind === "framework" ? "cadru " : ""}{r.contract_number}</u></span>}
              {order && <a className="rMeta" href={`${base}/comenzi/${r.order_id}`}>Comandă <u>{order}</u></a>}
            </div>
            <div className="rChips">
              {evaluator && <a className="rChip" href={`${base}/utilizatori/${evaluator.id}`}><span className="av navy">{initials(evaluator.name, evaluator.email)}</span>{evaluator.name || evaluator.email}<small>· evaluator principal</small></a>}
              <span className="rMeta">actualizat {ago(r.updated_at ?? r.created_at)}</span>
            </div>
          </div>
          <div className="rHeroActions">
            <StatusButton id={r.id} status={r.status} reason={r.suspend_reason} />
            <a className="btn btnGold btnSm" href={href("documente")}>{final ? "Livrare raport" : "Încarcă raportul final"}</a>
          </div>
        </div>
        <dl className="rKpis">
          <div><dt>Valoare rezultat</dt><dd className="big">{r.result_value || assetsTotal ? lei(r.result_value || assetsTotal, cur) : "—"}</dd></div>
          <div><dt>Data evaluării</dt><dd>{r.valuation_date ? fmtDate(r.valuation_date) : <span className="dim">—</span>}</dd></div>
          <div><dt>Data raport</dt><dd>{r.report_date ? fmtDate(r.report_date) : <span className="dim">în așteptare</span>}</dd></div>
          <div><dt>Bunuri</dt><dd>{assets.length} <small>{mains ? `· ${mains === 1 ? "1 principal" : `${mains} principale`}` : ""}</small></dd></div>
          <div><dt>Inspecții</dt><dd>{inspected.length} {toSchedule > 0 && <small className="gold">· {toSchedule} de programat</small>}</dd></div>
        </dl>
      </section>

      {!r.glide_id && r.status !== "cancelled" && (
        <section className="card stageBar">
          <ol className="stageSteps" aria-label="Etapa raportului">
            {STAGE_ORDER.map((k, i) => {
              const at = STAGE_ORDER.indexOf(stage);
              return <li key={k} className={i < at ? "past" : i === at ? "on" : ""}><span className="dot">{i < at ? "✓" : i + 1}</span>{STAGE_LABEL[k]}</li>;
            })}
          </ol>
          <div className="stageInfo">
            <span className={late ? "pill pillErr" : due ? "pill pillInfo" : "pill"}><i />
              {due ? `${late ? "Termen depășit" : "Termen"}: ${fmtDate(due)}` : r.term_days ? `Termen: ${r.term_days} zile lucrătoare de la inspecție` : "Fără termen"}</span>
            <StageActions id={r.id} stage={stage} hasVerifier={!!verifier} />
          </div>
        </section>
      )}
      {r.status === "suspended" && r.suspend_reason && <div className="note"><b>Suspendat:</b> {r.suspend_reason}</div>}

      <nav className="pillTabs" aria-label="Secțiuni raport">
        {TABS.map(([k, l]) => (
          <a key={k} href={href(k)} aria-current={tab === k ? "page" : undefined}>{l}{counts[k] ? <small>{counts[k]}</small> : null}</a>
        ))}
      </nav>

      {tab === "general" && (
        <>
          <div className="grid3">
            <section className="card">
              <h2>Client și sursă</h2>
              <dl className="kv">
                <Row k="Client">{r.client_name ? <a className="rowLink" href={`${base}/clienti/${r.client_id}`}>{r.client_name}</a> : null}</Row>
                <Row k="Tip client">{r.client_kind ? KIND[r.client_kind] ?? r.client_kind : null}</Row>
                <Row k="Utilizator / bancă">{r.bank_name}</Row>
                <Row k="Contract">{r.contract_number ? <span className="link">{r.contract_number} · {r.contract_kind === "framework" ? "cadru" : "clasic"}</span> : null}</Row>
                <Row k="Comandă">{order ? <a className="link" href={`${base}/comenzi/${r.order_id}`}>{order}{r.order_source ? ` · ${SOURCE_LABEL[r.order_source]?.toLowerCase() ?? r.order_source}` : ""}</a> : null}</Row>
                <Row k="Agenție bancară">{r.bank_branch}</Row>
                <Row k="Referral">{r.referral_name ? <a className="link" href={`${base}/utilizatori/${r.referral_id}`}>{r.referral_name}</a> : null}</Row>
              </dl>
            </section>
            <section className="card">
              <h2>Încadrare evaluare</h2>
              <dl className="kv">
                <Row k="Tip raport">{r.report_type ? cap(r.report_type) : null}</Row>
                <Row k="Tip evaluare">{r.valuation_types ? r.valuation_types.split(",").map((v) => VAL_TYPE[v] ?? v).join(", ") : null}</Row>
                <Row k="Scop">{r.purpose ? cap(r.purpose) : null}</Row>
                <Row k="Tip valoare">{r.value_type}</Row>
                <Row k="Monedă">{r.currency}</Row>
                <Row k="Anul raportării">{r.reporting_year ?? r.report_date?.slice(0, 4)}</Row>
                <Row k="Emitent">{r.issuer_name}</Row>
              </dl>
            </section>
            <section className="card">
              <h2>Comercial și status</h2>
              <dl className="kv">
                <Row k="Tarif">{r.fee != null ? <span className="mono num">{lei(r.fee, "RON")}</span> : null}</Row>
                <Row k="Tarif colaborator">{r.collab_fee != null ? <span className="mono num">{lei(r.collab_fee, "RON")}</span> : null}</Row>
                <Row k="Cotă evaluator">{evaluator?.share_evaluator != null ? `${evaluator.share_evaluator}%` : null}</Row>
                <Row k="Borderou">{r.statement_number ? `B-${r.statement_number}` : <span className="muted">neinclus</span>}</Row>
                <Row k="Status"><span className={`pill ${cls}`}><i />{label}</span></Row>
                <Row k="Motiv suspendare">{r.suspend_reason}</Row>
                <Row k="Intrat în lucru">{r.received_on ? fmtDate(r.received_on) : null}</Row>
              </dl>
            </section>
          </div>
          <div className="cols">
            <section className="card">
              <h2>Jurnal raport</h2>
              {log.length === 0 ? <p className="hint">Nicio activitate înregistrată.</p> : (
                <ul className="log rLog">
                  {log.map((l, i) => <li key={i}><time>{l.at.length > 10 ? fmtDate(l.at, true) : l.at.split("-").reverse().join(".")}</time><span>{l.text}{l.who && <span className="muted"> — {l.who}</span>}</span></li>)}
                </ul>
              )}
            </section>
            <section className="card">
              <h2>Note interne</h2>
              <NotesEditor id={r.id} notes={r.notes} />
            </section>
          </div>
          {r.market_analysis && <section className="card"><h2>Analiza de piață</h2><p className="prose">{r.market_analysis}</p></section>}
        </>
      )}

      {tab === "bunuri" && (
        <>
          <section className="card flush">
            <div className="cardHead" style={{ padding: "16px 22px 0" }}>
              <h2>Bunuri evaluate</h2>
              <AssetEditor report={r.id} label="+ Adaugă bun" client={{ name: r.client_name, phone: r.client_phone }}
                initial={{ ...emptyAsset({ county: main?.county, city: main?.city }), is_main: assets.length === 0, contact_name: r.client_name ?? "", contact_phone: r.client_phone ?? "" }} />
            </div>
            {assets.length === 0 ? <p className="hint pad">Raportul nu are bunuri înregistrate.</p> : (
              <div className="tableWrap">
                <table className="table">
                  <thead><tr><th>Proprietate</th><th>Tip / categorie</th><th>Supr. utilă</th><th>An constr.</th><th>Abordare</th><th className="r">Valoare</th><th /></tr></thead>
                  <tbody>
                    {assets.map((a) => (
                      <tr key={a.id}>
                        <td>
                          {a.is_main ? <span className="tag">Principal</span> : null}
                          <b className="block">{cap(a.type) || "Bun"}{a.construction === "under_construction" ? " · în construcție" : ""}</b>
                          <span className="muted">{a.full_address ?? a.city ?? "—"}{a.cf_number ? ` · CF ${a.cf_number}` : ""}{a.cad_building && a.cad_building !== a.cf_number ? ` · nr. cad. ${a.cad_building}` : ""}</span>
                          {a.other_reports > 0 && <span className="muted block">evaluat și în alte {a.other_reports} rapoarte</span>}
                          {(() => {
                            const st = inspState(a);
                            const [t, c] = st === "none" ? ["Fără inspecție", ""] : st === "done" ? ["Inspecție realizată", "pillOk"] : st === "open" ? [a.inspection_status === "scheduled" ? "Inspecție programată" : "Inspecție de programat", "pillInfo"] : ["Inspecție nealocată", "pillWarn"];
                            return <span className="block" style={{ marginTop: 4 }}><span className={`pill ${c}`}><i />{t}</span>{st === "none" && <span className="muted"> {a.no_inspection}</span>}</span>;
                          })()}
                        </td>
                        <td>{[cap(a.category), cap(a.type)].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="mono">{a.usable_area ? `${a.usable_area.toLocaleString("ro-RO")} mp` : "—"}</td>
                        <td>{a.year_built ?? "—"}</td>
                        <td>{a.approach ? APPROACH[a.approach] : "—"}</td>
                        <td className="mono num r">{a.value != null ? lei(a.value, cur) : "—"}</td>
                        <td className="r">
                          <span className="actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                            <AssetEditor report={r.id} label="Modifică" shared={a.other_reports} client={{ name: r.client_name, phone: r.client_phone }} initial={assetForm(a)} />
                            {assets.length > 1 && a.inspection_status !== "done" && !a.sheet_status && <RemoveAsset report={r.id} asset={a.id} name={cap(a.type) || "bunul"} />}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={5}>Total raport{r.value_type ? ` · ${r.value_type.toLowerCase()}` : ""}{r.valuation_date ? ` la ${fmtDate(r.valuation_date)}` : ""}</td>
                      <td className="mono num r">{lei(assetsTotal || r.result_value, cur)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
          <ReportList reports={history} base={base} title="Alte evaluări ale aceleiași proprietăți" />
        </>
      )}

      {tab === "echipa" && (
        <div className="cols">
          <section className="card">
            <div className="cardHead"><h2>Echipa raportului</h2><AddMember id={r.id} people={people} /></div>
            {team.length === 0 ? <p className="hint">Nimeni alocat încă.</p> : (
              <ul className="people">
                {team.map((m) => {
                  const share = m.role === "evaluator" ? m.share_evaluator : m.role === "verifier" ? m.share_verifier : null;
                  const what = [ROLE_LABEL[m.role], m.anevar_no && `legitimație ${m.anevar_no}`, specs(m.specializations), m.role === "inspector" && m.coverage && `zone: ${m.coverage}`, m.engagement === "contractor" && "colaborator extern"].filter(Boolean).join(" · ");
                  return (
                    <li key={m.role + m.id}>
                      <span className={`avatar${m.role === "evaluator" ? " gold" : ""}`}>{initials(m.name, m.email)}</span>
                      <span className="who"><a className="rowLink" href={`${base}/utilizatori/${m.id}`}>{m.name || m.email}</a><span className="muted">{what}</span></span>
                      <span className="pill"><i />{(ROLE_LABEL[m.role] ?? m.role).toUpperCase()}</span>
                      <b className="mono share">{share != null ? `${share}%` : "—"}</b>
                      <RemoveMember id={r.id} user={m.id} role={m.role} name={m.name || m.email} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className="card">
            <h2>Verificare înainte de predare</h2>
            <ul className="checklist">
              {checks.map(([s, t, n], i) => (
                <li key={i} className={s}><i aria-hidden>{s === "ok" ? "✓" : s === "miss" ? "!" : "○"}</i><span>{t}{n && <small>{n}</small>}</span></li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {tab === "utilizatori" && (
        <section className="card flush">
          <div className="cardHead"><h2>Utilizatori / destinatari ai raportului</h2></div>
          {recipients.length === 0 ? <p className="hint pad">Raportul nu are client sau utilizator desemnat.</p> : (
            <div className="tableWrap">
              <table className="table">
                <thead><tr><th>Entitate</th><th>Tip</th><th>Rol utilizator</th><th>Contact</th></tr></thead>
                <tbody>
                  {recipients.map((x) => (
                    <tr key={x.id + x.role}>
                      <td>{x.link ? <a className="rowLink" href={`${base}/clienti/${x.id}`}>{x.name}</a> : <b>{x.name}</b>}</td>
                      <td><span className="pill"><i />{(x.kind ? KIND[x.kind] ?? x.kind : "—").toUpperCase()}</span></td>
                      <td>{x.role}</td>
                      <td className="muted">{x.contact || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="hint pad">Raportul se emite către utilizatorii desemnați. Orice altă utilizare necesită acordul scris al evaluatorului.</p>
        </section>
      )}

      {tab === "inspectii" && (
        <>
          <section className="card flush">
            <div className="cardHead">
              <h2>Inspecții</h2>
              {mayAssign && assets.length > 0 && (
                <AllocateAll report={r.id} me={user.id} people={inspectors} autoOpen={alocare === "1" && assets.some((a) => inspState(a) === "free")}
                  rows={assets.map((a): AllocRow => ({
                    asset: a.id, label: `${cap(a.type) || "Bun"}${a.is_main && assets.length > 1 ? " (principal)" : ""}`, address: a.full_address ?? a.city, state: inspState(a),
                    inspector: a.inspector_id, none: a.no_inspection, sheet_type: guessSheetType(a.category, a.type), docs: docState(a.id), ...contactOf(a),
                  }))} />
              )}
            </div>
            {assets.length === 0 ? <p className="hint pad">Raportul nu are bunuri, deci nici inspecții.</p> : (
              <div className="tableWrap">
                <table className="table">
                  <thead><tr><th>Bun</th><th>Inspector</th><th>Programat / realizat</th><th>Contact la fața locului</th><th>Status</th><th>Fișă</th>{mayAssign && <th />}</tr></thead>
                  <tbody>
                    {assets.map((a) => {
                      const fromApp = !!a.inspection_id && !a.inspection_from_glide;
                      const active = fromApp && (a.inspection_status === "to_schedule" || a.inspection_status === "scheduled");
                      const cancelled = a.inspection_status === "cancelled";
                      const none = !!a.no_inspection && !active && a.inspection_status !== "done";
                      const [ins, insCls] = none ? ["Fără inspecție", ""] : cancelled || !a.inspection_status ? ["Nealocată", "pillWarn"] : INSPECTION_STATUS[a.inspection_status] ?? [a.inspection_status, ""];
                      // Glide history counts as done only when it was done; a new task can always replace an unfinished one.
                      const canGive = !active && a.inspection_status !== "done";
                      const contact = cancelled ? null : [a.contact_kind ? CONTACT[a.contact_kind] : null, a.contact_name, a.contact_phone].filter(Boolean).join(" · ");
                      return (
                        <tr key={a.id}>
                          <td>
                            {cap(a.type) || "Bun"} {a.is_main ? <span className="muted">(principal)</span> : null}
                            {!cancelled && !none && a.inspection_status !== "done" && (
                              <span className="block" style={{ display: "flex", gap: 6, marginTop: 4 }}>
                                {(["cf", "rlv"] as const).map((t) => <span key={t} className={`docTag ${docState(a.id)[t] ? "ok" : "miss"}`}>{docState(a.id)[t] ? "✓" : "!"} {t === "cf" ? "CF" : "RLV"}</span>)}
                              </span>
                            )}
                            {fromApp && a.instructions && !cancelled && <span className="muted block">Instrucțiuni: {a.instructions}</span>}
                          </td>
                          <td>
                            {!cancelled && a.inspector ? a.inspector : none ? "—" : <span className="muted">nealocat</span>}
                            {fromApp && !cancelled && a.assigned_by_name && <span className="muted block">alocată de {a.assigned_by_name}{a.assigned_at ? `, ${fmtDate(a.assigned_at)}` : ""}</span>}
                          </td>
                          <td className="mono">
                            {!cancelled && (a.done_at || a.scheduled_at) ? fmtDate(a.done_at ?? a.scheduled_at, true) : "—"}
                            {active && a.due_on && <span className="muted block">termen {fmtDate(a.due_on)}</span>}
                          </td>
                          <td>{contact || "—"}</td>
                          <td>
                            <span className={`pill ${insCls}`}><i />{ins}</span>
                            {none && <span className="muted block">{a.no_inspection}</span>}
                            {cancelled && !none && <span className="muted block">inspecția a fost anulată</span>}
                            {fromApp && a.sheet_status === "draft" && active && <span className="muted block">fișă în lucru</span>}
                          </td>
                          <td>{a.sheet_photo || a.sheet_person ? <a className="link" href={`#fisa-${a.id}`}>Vezi fișa</a> : "—"}</td>
                          {mayAssign && (
                            <td className="r">
                              {(canGive || active) && (
                                <span className="actions" style={{ justifyContent: "flex-end" }}>
                                  <AssignInspection report={r.id} me={user.id} people={inspectors} initial={{
                                    asset: a.id, label: `${cap(a.type) || "Bun"}${a.full_address ? ` · ${a.full_address}` : ""}`, inspection: active ? a.inspection_id : null,
                                    inspector: active ? a.inspector_id : null, sheet_type: (active && a.sheet_type) || guessSheetType(a.category, a.type),
                                    due_on: active ? a.due_on : null, ...contactOf(a), instructions: active ? a.instructions : null, scheduled: a.inspection_status === "scheduled",
                                    docs: docState(a.id),
                                  }} />
                                  {none && <NeedsInspection report={r.id} asset={a.id} />}
                                  {active && <CancelInspection report={r.id} inspection={a.inspection_id!} who={a.inspector ?? "inspector"} />}
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {assets.filter((a) => a.sheet_photo || a.sheet_person || a.sheet_description || a.sheet_location).map((a) => {
            const photos = [fileSrc(a.sheet_photo), fileSrc(a.image_url)].filter((x, i, l): x is string => !!x && l.indexOf(x) === i);
            const sig = fileSrc(a.sheet_signature);
            return (
              <section key={a.id} id={`fisa-${a.id}`} className="card">
                <h2>Fișa de inspecție <span className="muted">· {cap(a.type) || "bun"}{a.done_at ? ` · efectuată ${fmtDate(a.done_at, true)}` : ""}{a.inspector ? ` · ${a.inspector}` : ""}</span></h2>
                <div className="grid3 tight">
                  <div>
                    <div className="section">Constatări</div>
                    {a.sheet_description || a.description ? <p className="prose">{a.sheet_description ?? a.description}</p> : <p className="hint">Fișa nu are descriere.</p>}
                    <dl className="kv">
                      {a.year_built && <Row k="An construcție">{a.year_built}</Row>}
                      {a.usable_area && <Row k="Suprafață utilă">{a.usable_area.toLocaleString("ro-RO")} mp</Row>}
                    </dl>
                  </div>
                  <div>
                    <div className="section">Galerie ({photos.length})</div>
                    {photos.length === 0 ? <p className="hint">Nicio fotografie.</p> : (
                      <div className="gallery">
                        {photos.map((p) => <a key={p} href={p} target="_blank" rel="noopener"><SafeImg src={p} fallback={<span className="noImg">fotografie indisponibilă</span>} /></a>)}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="section">Prezență și semnătură</div>
                    <dl className="kv">
                      <Row k="Persoană prezentă">{a.sheet_person}</Row>
                      <Row k="Localizare GPS">{a.sheet_location ? <a className="link" href={`https://www.google.com/maps?q=${encodeURIComponent(a.sheet_location)}`} target="_blank" rel="noopener">{a.sheet_location}</a> : null}</Row>
                    </dl>
                    {sig ? <SafeImg className="signature" src={sig} alt="Semnătură" fallback={<div className="sigEmpty mono">semnătură indisponibilă</div>} /> : <div className="sigEmpty mono">fără semnătură captată</div>}
                  </div>
                </div>
              </section>
            );
          })}
        </>
      )}

      {tab === "documente" && (
        <>
        <section className="card">
          <h2>Pentru inspecție <span className="muted">· extras CF și releveu</span></h2>
          <p className="hint">Inspectorul le vede în aplicația de inspecții, la inspecția bunului și în fișă. Un document încărcat aici fără bun ales e valabil pentru toate bunurile raportului.</p>
          {assets.length === 0 ? <p className="hint">Raportul nu are bunuri.</p> : (
            <div className="docsGrid">
              {assets.map((a) => (
                <div key={a.id} className="docsAsset">
                  <b>{assetLabel(a)}</b>
                  {(["cf", "rlv"] as const).map((t) => {
                    const list = inspDocs[a.id]?.[t] ?? [];
                    return (
                      <span key={t} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <span className={`docTag ${list.length ? "ok" : "miss"}`} title={list.map((d) => d.name).join(", ")}>{list.length ? "✓" : "lipsă"} {t === "cf" ? "Extras CF" : "Releveu"}{list.length > 1 ? ` (${list.length})` : ""}</span>
                        <UploadButton id={r.id} docType={t} asset={assets.length > 1 ? a.id : undefined} label={list.length ? "+ încă unul" : "Încarcă"} className="linkBtn" accept=".pdf,.jpg,.jpeg,.png,.heic,.webp" />
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </section>
        <div className="cols">
          <section className="card flush">
            <div className="cardHead"><h2>Documente sursă</h2><UploadButton id={r.id} label="+ Încarcă" /></div>
            {sources.length + orderDocs.length + glideFiles.length === 0 ? <p className="hint pad">Niciun document încă.</p> : (
              <ul className="fileList">
                {sources.map((d) => d.status === "missing" ? (
                  <li key={d.id} className="miss">
                    <span className="ext">LIPSĂ</span>
                    <span className="who"><b>{d.filename}</b><small>solicitat {fmtDate(d.requested_at)} · blochează predarea</small></span>
                    <UploadButton id={r.id} doc={d.id} label="Încarcă" className="linkBtn" />
                    <DeleteDoc id={r.id} doc={d.id} name={d.filename} />
                  </li>
                ) : (
                  <li key={d.id}>
                    <span className="ext">{ext(d.filename)}</span>
                    <span className="who"><b>{d.filename}</b><small>încărcat {fmtDate(d.created_at)}{d.size_bytes ? ` · ${fmtSize(d.size_bytes)}` : ""}{d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ""}</small></span>
                    <DocTypeSelect id={r.id} doc={d.id} assets={assets.length > 1 ? assets.map((x, n) => ({ id: x.id, label: `${cap(x.type) || "Bun"}${assets.filter((y) => y.type === x.type).length > 1 ? ` ${n + 1}` : ""}` })) : null}
                      value={(() => { const t = d.doc_type ?? guessDocType(d.filename); return t === "cf" || t === "rlv" ? `${t}:${d.asset_id ?? ""}` : "other"; })()} />
                    <a className="link" href={`/api/crm/reports/${r.id}/documents/${d.id}`} target="_blank" rel="noopener">Descarcă</a>
                    <DeleteDoc id={r.id} doc={d.id} name={d.filename} />
                  </li>
                ))}
                {orderDocs.map((d) => (
                  <li key={d.id}>
                    <span className="ext">{ext(d.filename)}</span>
                    <span className="who"><b>{d.filename}</b><small>din comanda {order} · {fmtDate(d.created_at)} · {fmtSize(d.size_bytes)}</small></span>
                    <a className="link" href={`/api/crm/orders/${r.order_id}/documents/${d.id}`} target="_blank" rel="noopener">Descarcă</a>
                  </li>
                ))}
                {glideFiles.map((f) => (
                  <li key={f.path}>
                    <span className="ext">{ext(f.path)}</span>
                    <span className="who"><b>{f.name}</b><small>în Glide · {f.path.split("/").pop()} · nemutat încă</small></span>
                  </li>
                ))}
              </ul>
            )}
            <div className="pad"><MissingDoc id={r.id} /></div>
          </section>
          <section className="card">
            <h2>Livrare raport</h2>
            {final ? (
              <ul className="fileList boxed">
                <li>
                  <span className="ext">PDF</span>
                  <span className="who"><b>{final.filename}</b><small>{fmtSize(final.size_bytes ?? 0)}{final.uploaded_by_name ? ` · ${final.uploaded_by_name}` : ""}</small></span>
                  <a className="link" href={`/api/crm/reports/${r.id}/documents/${final.id}`} target="_blank" rel="noopener">Deschide</a>
                  <UploadButton id={r.id} kind="final" label="Înlocuiește" className="linkBtn" />
                </li>
              </ul>
            ) : <FinalDrop id={r.id} />}
            <dl className="kv">
              <Row k="Data încărcării">{final ? fmtDate(final.created_at, true) : r.uploaded_on ? fmtDate(r.uploaded_on) : null}</Row>
              <Row k="Transmis către">{recipients.length ? recipients.map((x) => x.name).join(" · ") : null}</Row>
              <Row k="Facturare">{r.statement_number ? `în borderoul B-${r.statement_number}` : <span className="muted">neinclus în borderou</span>}</Row>
              <Row k="Predat">{r.delivered_at ? `${fmtDate(r.delivered_at, true)}${r.delivered_by_name ? ` · ${r.delivered_by_name}` : ""}` : null}</Row>
            </dl>
            {missing.length > 0 && <div className="note">{missing.length === 1 ? "Lipsește un document" : `Lipsesc ${missing.length} documente`} din lista de documente sursă.</div>}
            {r.client_notified_at && <p className="hint">Clientul a fost anunțat pe email la {fmtDate(r.client_notified_at, true)} și descarcă raportul din portal.</p>}
            {!r.delivered_at && <DeliverButton id={r.id} ready={!!final} number={r.number} suggested={suggested} notifyTo={notifyTo} />}
          </section>
        </div>
        </>
      )}
    </CrmShell>
  );
}
