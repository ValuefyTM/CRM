import { niceName } from "@/lib/labels";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
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
import { docsByAsset } from "@/lib/insp-docs";
import { DOC_KIND_KEYS, guessDocKind } from "@/lib/doc-kinds";
import { Avatar, PersonLine } from "@/components/Avatar";
import { Messages } from "@/components/Messages";
import { messagesOf } from "@/lib/messages";
import { AddMember, CollectedToggle, DeleteDoc, DocTypeSelect, DeliverButton, FinalDrop, MissingDoc, NotesEditor, RemoveMember, SafeImg, StageActions, StatusButton, UploadButton, VerifyActions } from "./ReportActions";
import { dueOf, STAGE_LABEL, stageOf } from "@/lib/dossier";
import { nextReportNumber, noticeTarget } from "@/lib/delivery";
import { draftForReport, invoicesFor } from "@/lib/billing";
import { can, type Perm } from "@/lib/perms";
import { feeShare } from "@/lib/perms-db";
import { reportAccess } from "@/lib/perms-db";
import { IssueInvoice, InvoiceList } from "@/components/Invoices";
import { issuerColor } from "@/lib/issuer-color";
import { daysOf, SEGMENTS, segmentsOf } from "@/lib/report-stage";

export const metadata: Metadata = { title: "Raport | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { person: "Persoană fizică", company: "Persoană juridică", bank: "Bancă", ifn: "IFN", uat: "Instituție publică", anaf: "ANAF", broker: "Broker" };
const CONTACT: Record<string, string> = { client: "Clientul", owner: "Proprietarul", agent: "Agent imobiliar", other: "Altă persoană" };
const APPROACH: Record<string, string> = { market: "Piață", income: "Venit", cost: "Cost" };
const VAL_TYPE: Record<string, string> = { EPI: "EPI — proprietăți imobiliare", EBM: "EBM — bunuri mobile", EI: "EI — întreprinderi", EIF: "EIF — instrumente financiare" };
const ROLE_NAME: Record<string, string> = { owner: "Proprietar", admin: "Administrator", evaluator: "Evaluator", operator: "Operator", inspector: "Inspector" };
const TABS = [["general", "General"], ["bunuri", "Bunuri"], ["inspectii", "Inspecții"], ["documente", "Documente & livrare"], ["utilizatori", "Utilizatori"]] as const;
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
const short = (iso: string | null | undefined) => (iso ? new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("ro-RO", { day: "numeric", month: "short", timeZone: "Europe/Bucharest" }).replace(".", "") : "");
const firstName = (n: string | null | undefined) => { const p = (n ?? "").trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0] ?? ""; };
const specs = (s: string | null) => (s ? s.split(",").filter((k) => SPECIALIZATIONS.some(([v]) => v === k)).join(", ") : "");

/** Values of an asset for its edit form. */
const assetForm = (a: Awaited<ReturnType<typeof reportAssets>>[number]): AssetForm => ({
  id: a.id, category: a.category ?? "REZIDENTIAL", type: a.type ?? "", construction: a.construction ?? "existing", county: a.county ?? "", city: a.city ?? "",
  full_address: a.full_address ?? "", cf_number: a.cf_number ?? "", cad_building: a.cad_building ?? "", cad_land: a.cad_land ?? "",
  usable_area: a.usable_area != null ? String(a.usable_area) : "", year_built: a.year_built != null ? String(a.year_built) : "", description: a.description ?? "",
  is_main: !!a.is_main, value: a.value != null ? String(a.value) : "", approach: a.approach ?? "", notes: a.notes ?? "",
  contact_kind: a.a_contact_kind ?? "client", contact_name: a.a_contact_name ?? "", contact_phone: a.a_contact_phone ?? "",
  land_area: a.land_area != null ? String(a.land_area) : "", rooms: a.rooms != null ? String(a.rooms) : "", floor: a.floor ?? "", height_regime: a.height_regime ?? "",
  vehicle_make: a.vehicle_make ?? "", vehicle_model: a.vehicle_model ?? "", reg_number: a.reg_number ?? "", vin: a.vin ?? "", mileage: a.mileage != null ? String(a.mileage) : "",
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
  // Team members while it is worked on; once finished, the main evaluator and the verifier ("reports.all": every report).
  const acc = await reportAccess(db, user, r);
  if (!acc.view) redirect(`${base}/rapoarte?fara-acces=1`);
  // What the user may do here: their role(s) in the report team, or the Rapoarte module (Setări → Permisiuni).
  const c = acc.can, fees = acc.fee === "all";
  const link = (perm: Perm, path: string, cls: string, body: React.ReactNode) => (can(user, perm) ? <a className={cls} href={`${base}${path}`}>{body}</a> : <span>{body}</span>);
  const messages = await messagesOf(db, "report", r.id, user.id);
  const [team, assets, docs, orderDocs, people] = await Promise.all([
    reportTeam(db, id), reportAssets(db, id), reportDocuments(db, id), reportOrderDocuments(db, r.order_id), teamCandidates(db),
  ]);
  // Billing: the invoices of this report, and whether it can be invoiced per order now (framework / collaboration rule).
  const [repInvoices, perOrder] = await Promise.all([invoicesFor(db, { report: id }), can(user, "billing") ? draftForReport(db, id) : Promise.resolve({ error: "" })]);
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
  // The deadline may carry an hour ("2026-10-20T14:30", Bucharest time): late once that moment has passed.
  const nowLocal = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Bucharest", hour12: false }).replace(" ", "T").slice(0, 16);
  const late = !!due && stage !== "delivered" && (due.length > 10 ? due < nowLocal : due < nowLocal.slice(0, 10));
  const dueText = (d: string) => (d.length > 10 ? `${fmtDate(d.slice(0, 10))}, ora ${d.slice(11, 16)}` : fmtDate(d));
  const [label, cls] = REPORT_STATUS[r.status] ?? [r.status, ""];
  const cur = r.currency === "EUR" ? "EUR" : "lei";
  const evaluator = team.find((m) => m.role === "evaluator");
  const verifier = team.find((m) => m.role === "verifier");
  // Without all the amounts: only the user's own share (fișa utilizatorului), when their team role shows it.
  const share = !fees && acc.fee === "share" ? await feeShare(db, user.id, acc.roles, r.fee) : null;
  const myShare = share ? share.parts.map((p) => `${p.label}${p.amount != null ? ` · ${lei(p.amount, "RON")}` : ""}`).join(" + ") : null;
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
  if (r.recipient_id) recipients.push({ id: r.recipient_id, name: niceName(r.bank_name) || "—", kind: r.recipient_kind, role: "Finanțator / utilizator desemnat", contact: [r.recipient_email, r.recipient_phone, r.recipient_code && `cod ${r.recipient_code}`].filter(Boolean).join(" · ") });
  if (r.client_id) recipients.push({ id: r.client_id, name: niceName(r.client_name) || "—", kind: r.client_kind, role: r.recipient_id ? "Client / proprietar" : "Client / utilizator desemnat", contact: [r.client_phone, r.client_email].filter(Boolean).join(" · "), link: true });
  const checks: [state: "ok" | "miss" | "todo", text: string, note?: string][] = [
    main?.no_inspection ? ["ok", "Bun principal fără inspecție", main.no_inspection] : [main?.sheet_photo || main?.inspection_status === "done" ? "ok" : "todo", "Fișă inspecție bun principal atașată"],
    [assets.length > 0 && assets.every((a) => a.value != null) ? "ok" : "todo", "Valori completate pe toate bunurile", assets.length ? `${assets.filter((a) => a.value != null).length} din ${assets.length}` : "niciun bun"],
    ...missing.map((d): ["miss", string, string] => ["miss", `${d.filename} lipsă`, "blochează predarea"]),
    [evaluator ? "ok" : "todo", "Evaluator alocat", evaluator?.name],
    [verifier ? "ok" : "todo", `Verificare finală${verifier ? ` (${verifier.name})` : ""}`, verifier ? undefined : "verificator nealocat"],
    [final ? "ok" : "todo", "PDF semnat încărcat"],
  ];
  const href = (t: Tab) => `${base}/rapoarte/${id}${t === "general" ? "" : `?tab=${t}`}`;
  const counts: Partial<Record<Tab, number>> = { bunuri: assets.length, utilizatori: recipients.length, inspectii: inspected.length, documente: docCount };
  const logo = fileSrc(r.issuer_logo), bankLogo = fileSrc(r.bank_logo), clientLogo = fileSrc(r.client_logo);
  const stripe = issuerColor(r.issuer_name, r.issuer_color);
  // The four segments and the days counter, the same as in the list of reports.
  const today = new Date().toISOString().slice(0, 10);
  const nextVisit = tasks.filter((a) => a.inspection_status === "scheduled" && a.scheduled_at).map((a) => a.scheduled_at!).sort()[0] ?? null;
  const stageRow = {
    status: r.status, stage: r.stage, delivered_at: r.delivered_at, verified_at: r.verified_at, report_date: r.report_date,
    insp_total: tasks.length, insp_done: tasks.filter((a) => a.inspection_status === "done").length, no_insp: assets.filter((a) => a.no_inspection).length,
    insp_next: nextVisit, insp_last: inspectedOn, invoiced: repInvoices.length ? 1 : 0,
    ordered_at: r.ordered_at, received_on: r.received_on, created_at: r.created_at, term_days: r.term_days,
  };
  const { seg } = segmentsOf(stageRow, today);
  const d = daysOf(stageRow, today);
  const inspector = team.find((m) => m.role === "inspector");
  const doneBy = tasks.find((a) => a.inspection_status === "done")?.inspector;
  const finished = r.status === "done" || !!r.delivered_at;
  const segNote = [
    stageRow.insp_total && stageRow.insp_done === stageRow.insp_total ? `realizată ${short(inspectedOn)}${doneBy ? ` · ${firstName(doneBy)}` : ""}`
      : nextVisit ? `programată ${short(nextVisit)}${inspector ? ` · ${firstName(inspector.name)}` : ""}`
      : stageRow.no_insp && !stageRow.insp_total ? "fără inspecție" : stageRow.insp_total ? `de programat${inspector ? ` · ${firstName(inspector.name)}` : ""}` : "nealocată",
    stage === "inspection" ? (evaluator ? firstName(evaluator.name) : "evaluator nealocat") : stage === "drafting" ? `în redactare${evaluator ? ` · ${firstName(evaluator.name)}` : ""}` : `redactat${r.report_date ? ` ${short(r.report_date)}` : ""}`,
    r.verified_at ? `verificat ${short(r.verified_at)}` : stage === "review" ? `la verificare${verifier ? ` · ${firstName(verifier.name)}` : ""}` : verifier ? firstName(verifier.name) : "verificator nealocat",
    finished
      ? [r.report_date && `raport ${short(r.report_date)}`, r.delivered_at && `predat ${short(r.delivered_at)}`, repInvoices.length ? "facturat" : "nefacturat"].filter(Boolean).join(" · ")
      : due ? `termen ${short(due)}${due.length > 10 ? `, ${due.slice(11, 16)}` : ""}` : `termen ${d.term} zile de la comandă`,
  ];
  // The client is also the designated user: one chip, "client / utilizator desemnat".
  const clientIsUser = !r.recipient_id || r.recipient_id === r.client_id;
  const memberShare = (m: (typeof team)[number]) =>
    m.role === "evaluator" && m.share_evaluator != null ? `${m.share_evaluator}%`
    : m.role === "verifier" && m.share_verifier != null ? `${m.share_verifier}%`
    : m.role === "inspector" && m.inspector_fee != null ? (m.inspector_fee_kind === "pct" ? `${m.inspector_fee}%` : lei(m.inspector_fee, "RON")) : null;
  const orderChip = order && (
    <><i className="rcLogo">CO</i>Comandă {order}{r.ordered_at && <small>· {short(r.ordered_at)}</small>}</>
  );

  return (
    <CrmShell
      user={user} base={base} active="reports" title={`${r.number ? `Raport nr. ${r.number}` : r.label ?? "Raport"} · Detaliu raport`}
      subtitle={`Operațional / Rapoarte${r.label ? ` · ${r.label}` : ""}`}
      bare
    >
      <section className="rHero dHero" style={{ "--stripe": stripe } as React.CSSProperties}>
        <div className="dHeroTop">
          <div className="rHeroMain">
            <p className="eyebrow"><a className="dBack" href={`${base}/rapoarte`}>← Rapoarte</a>{r.report_type ? cap(r.report_type) : "Raport de evaluare"}{r.valuation_types && <span> · {r.valuation_types.split(",").map((v) => VAL_TYPE[v] ?? v).join(", ")}</span>}</p>
            <div className="rTitle">
              <span className="dLogo">{logo ? <SafeImg src={logo} alt={r.issuer_name ?? ""} fallback={<b>{(r.issuer_short ?? initials(r.issuer_name ?? "VALUEFY", "v")).slice(0, 3)}</b>} /> : <b>{(r.issuer_short ?? initials(r.issuer_name ?? "VALUEFY", "v")).slice(0, 3)}</b>}</span>
              <h2>{r.number ? `Nr. ${r.number}` : "Fără număr"}</h2>
              <span className={`pill ${cls}`}><i />{label}{finished && r.report_date ? ` · ${fmtDate(r.report_date)}` : ""}</span>
              {r.status !== "cancelled" && <span className={`pill ${stage === "delivered" ? "pillOk" : "pillWarn"}`}><i />{STAGE_LABEL[stage]}</span>}
              {!!r.urgent && !finished && <span className="dUrgent" title="Comanda a fost marcată urgentă"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" /></svg>Urgent</span>}
            </div>
            <div className="rChips">
              {r.client_name && (() => {
                const body = <>{clientLogo ? <SafeImg src={clientLogo} className="rcLogo" fallback={<i className="rcLogo">{initials(r.client_name, "c")}</i>} /> : <i className="rcLogo">{initials(r.client_name, "c")}</i>}{niceName(r.client_name)}<small>· {clientIsUser ? "client / utilizator desemnat" : "client"}</small></>;
                return can(user, "clients") ? <a className="rChip" href={`${base}/clienti/${r.client_id}`}>{body}</a> : <span className="rChip">{body}</span>;
              })()}
              {r.bank_name && !clientIsUser && <span className="rChip">{bankLogo ? <SafeImg src={bankLogo} className="rcLogo" fallback={<i className="rcLogo">{(r.bank_code ?? r.bank_name).slice(0, 3).toUpperCase()}</i>} /> : <i className="rcLogo">{(r.bank_code ?? r.bank_name).slice(0, 3).toUpperCase()}</i>}{niceName(r.bank_name)}<small>· utilizator desemnat</small></span>}
              {evaluator && <span className="rChip" title={evaluator.seen}><Avatar id={evaluator.id} name={evaluator.name || evaluator.email} size={24} presence={evaluator.presence} photo={evaluator.photo} />{evaluator.name || evaluator.email}<small>· evaluator principal</small></span>}
              {orderChip && (can(user, "orders") ? <a className="rChip" href={`${base}/comenzi/${r.order_id}`}>{orderChip}</a> : <span className="rChip">{orderChip}</span>)}
            </div>
          </div>
          <div className="dActs">
            {c.docs && <a className="btn btnGold btnSm" href={href("documente")}>{final ? "Livrare raport" : "Încarcă raportul final"}</a>}
            {c.status && <StatusButton id={r.id} status={r.status} reason={r.suspend_reason} />}
            {c.status && !r.glide_id && r.status !== "cancelled" && <StageActions id={r.id} stage={stage} hasVerifier={!!verifier} />}
          </div>
        </div>
        {r.status !== "cancelled" && (
          <div className="dStage" aria-label="Etapa raportului">
            {SEGMENTS.map((t, i) => (
              <div key={t} className={`dSeg ${seg[i]}`}><i /><b>{t}</b><small>{segNote[i] || "—"}</small></div>
            ))}
            <div className={`dDays${d.late ? " late" : d.delivered ? " done" : ""}`} title={`Zile calendaristice de la comandă · termen ${d.term} zile`}>
              <b>{d.days}</b><small>{d.late ? `din ${d.term} zile · +${d.over}` : `din ${d.term} zile`}</small>
            </div>
          </div>
        )}
        {c.verify && stage === "review" && <div className="dVerify"><span>Raportul așteaptă verificarea.</span><VerifyActions id={r.id} verified={r.verified_at ? fmtDate(r.verified_at, true) : null} /></div>}
      </section>
      {r.status === "suspended" && r.suspend_reason && <div className="note"><b>Suspendat:</b> {r.suspend_reason}</div>}

      <nav className="pillTabs dTabs" aria-label="Secțiuni raport">
        {TABS.map(([k, l]) => (
          <a key={k} href={href(k)} aria-current={tab === k ? "page" : undefined}>{l}{counts[k] ? <small>{counts[k]}</small> : null}</a>
        ))}
      </nav>

      <div className="dBody">
      <div className="dMain">
      {tab === "general" && (
        <>
          <div className="dGrid2">
            <section className="card">
              <h2>Încadrare evaluare</h2>
              <dl className="kv">
                <Row k="Scop">{r.purpose ? cap(r.purpose) : null}</Row>
                <Row k="Tip valoare">{r.value_type}</Row>
                <Row k="Tip raport">{r.report_type ? cap(r.report_type) : null}</Row>
                <Row k="Tip evaluare">{r.valuation_types ? r.valuation_types.split(",").join(", ") : null}</Row>
                <Row k="Data evaluării">{r.valuation_date ? fmtDate(r.valuation_date) : null}</Row>
                <Row k="Monedă">{r.currency}</Row>
                <Row k="Contract">{r.contract_number ? link("contracts", `/contracte/${r.contract_id}`, "link", <>{r.contract_kind === "framework" ? "cadru · " : ""}nr. {r.contract_number}</>) : null}</Row>
                <Row k="Tip client">{r.client_kind ? KIND[r.client_kind] ?? r.client_kind : null}</Row>
                {r.bank_branch && <Row k="Agenție bancară">{r.bank_branch}</Row>}
                {r.referral_name && <Row k="Referral">{link("users", `/utilizatori/${r.referral_id}`, "link", r.referral_name)}</Row>}
                <Row k="Emitent">{r.issuer_name}</Row>
              </dl>
            </section>
            <section className="card">
              <div className="cardHead"><h2>Bunul principal</h2>{main && <a className="btn btnGhost btnSm" href={`${base}/proprietati/${main.property_id}/comparabile?raport=${r.id}`}>Comparabile →</a>}</div>
              {!main ? <p className="hint">Raportul nu are bunuri înregistrate.</p> : (
                <>
                  <div className="dAsset">
                    {(() => { const ph = fileSrc(main.sheet_photo) ?? fileSrc(main.image_url); return ph ? <SafeImg src={ph} className="dPh" fallback={<span className="dPh" />} /> : <span className="dPh" />; })()}
                    <span className="who">
                      <b>{cap(main.type) || "Bun"}{main.construction === "under_construction" ? " · în construcție" : ""}</b>
                      <small>{[main.full_address ?? main.city, main.cf_number && `CF ${main.cf_number}`, main.usable_area && `${main.usable_area.toLocaleString("ro-RO")} mp`].filter(Boolean).join(" · ") || "—"}</small>
                    </span>
                    {(() => {
                      const st = inspState(main);
                      const [t, k] = st === "none" ? ["Fără inspecție", ""] : st === "done" ? ["Inspectat", "pillOk"] : st === "open" ? [main.inspection_status === "scheduled" ? "Programat" : "De programat", "pillInfo"] : ["Nealocat", "pillWarn"];
                      return <span className={`pill ${k}`}><i />{t}</span>;
                    })()}
                  </div>
                  <dl className="kv">
                    <Row k="Valoare rezultat">{r.result_value || assetsTotal ? <span className="mono num">{lei(r.result_value || assetsTotal, cur)}</span> : null}</Row>
                    <Row k="Abordare">{main.approach ? APPROACH[main.approach] : null}</Row>
                    {assets.length > 1 && <Row k="Alte bunuri"><a className="link" href={href("bunuri")}>{assets.length - 1} {assets.length === 2 ? "bun" : "bunuri"} →</a></Row>}
                    <Row k="Fișa proprietății"><a className="link" href={`${base}/proprietati/${main.property_id}`}>{main.other_reports > 0 ? `și în alte ${main.other_reports} rapoarte` : "deschide"} →</a></Row>
                  </dl>
                </>
              )}
            </section>
          </div>
          <section className="card flush">
            <div className="cardHead"><h2>Documente</h2><span className="muted">{missing.length ? `${missing.length} lipsă din ${sources.length + orderDocs.length + glideFiles.length}` : `${sources.length + orderDocs.length + glideFiles.length} sursă`}{" · "}<a className="link" href={href("documente")}>toate →</a></span></div>
            <ul className="fileList">
              {[...sources.slice(0, 4)].map((x) => (
                <li key={x.id} className={x.status === "missing" ? "miss" : ""}>
                  <span className="ext">{x.status === "missing" ? "LIPSĂ" : ext(x.filename)}</span>
                  <span className="who"><b>{x.filename}</b><small>{x.status === "missing" ? `cerut ${fmtDate(x.requested_at)}` : `sursă · ${fmtDate(x.created_at)}${x.uploaded_by_name ? ` · ${x.uploaded_by_name}` : ""}`}</small></span>
                  {x.status === "missing" ? <span className="pill pillWarn"><i />Lipsă</span> : <a className="link" href={`/api/crm/reports/${r.id}/documents/${x.id}`} target="_blank" rel="noopener">Descarcă</a>}
                </li>
              ))}
              {orderDocs.slice(0, Math.max(0, 4 - sources.length)).map((x) => (
                <li key={x.id}>
                  <span className="ext">{ext(x.filename)}</span>
                  <span className="who"><b>{x.filename}</b><small>din comandă · {fmtDate(x.created_at)}</small></span>
                  <a className="link" href={`/api/crm/orders/${r.order_id}/documents/${x.id}`} target="_blank" rel="noopener">Descarcă</a>
                </li>
              ))}
              <li className={final ? "" : "miss"}>
                <span className="ext">{final ? "PDF" : "—"}</span>
                <span className="who"><b>{final ? final.filename : "Raport final"}</b><small>{final ? `încărcat ${fmtDate(final.created_at)}` : "se încarcă la predare"}</small></span>
                {final ? <a className="link" href={`/api/crm/reports/${r.id}/documents/${final.id}`} target="_blank" rel="noopener">Deschide</a> : c.docs ? <a className="btn btnGhost btnSm" href={href("documente")}>Încarcă</a> : null}
              </li>
            </ul>
          </section>
          {fees && (repInvoices.length > 0 || !("error" in perOrder)) && (
            <section className="card">
              <div className="cardHead"><h2>Facturi</h2>{!("error" in perOrder) && <IssueInvoice report={r.id} label="Emite factura" />}</div>
              <InvoiceList rows={repInvoices} admin={can(user, "billing")} />
            </section>
          )}
          <section className="card">
            <div className="cardHead"><h2>Jurnal</h2>{log.length > 0 && <span className="muted">{log.length > 8 ? "ultimele 8" : log.length}</span>}</div>
            {log.length === 0 ? <p className="hint">Nicio activitate înregistrată.</p> : (
              <ul className="log rLog">
                {log.slice(0, 8).map((l, i) => <li key={i}><time>{l.at.length > 10 ? fmtDate(l.at, true) : l.at.split("-").reverse().join(".")}</time><span>{l.text}{l.who && <span className="muted"> — {l.who}</span>}</span></li>)}
              </ul>
            )}
            {log.length > 8 && (
              <details className="dMore"><summary>Tot jurnalul ({log.length})</summary>
                <ul className="log rLog">
                  {log.slice(8).map((l, i) => <li key={i}><time>{l.at.length > 10 ? fmtDate(l.at, true) : l.at.split("-").reverse().join(".")}</time><span>{l.text}{l.who && <span className="muted"> — {l.who}</span>}</span></li>)}
                </ul>
              </details>
            )}
          </section>
          <section className="card">
            <h2>Note interne</h2>
            {c.edit ? <NotesEditor id={r.id} notes={r.notes} /> : <p className="hint" style={{ whiteSpace: "pre-wrap" }}>{r.notes || "Fără note."}</p>}
          </section>
          {r.market_analysis && <section className="card"><h2>Analiza de piață</h2><p className="prose">{r.market_analysis}</p></section>}
        </>
      )}

      {tab === "bunuri" && (
        <>
          <section className="card flush">
            <div className="cardHead" style={{ padding: "16px 22px 0" }}>
              <h2>Bunuri evaluate</h2>
              {c.assets && <AssetEditor report={r.id} label="+ Adaugă bun" client={{ name: r.client_name, phone: r.client_phone }}
                initial={{ ...emptyAsset({ county: main?.county, city: main?.city }), is_main: assets.length === 0, contact_name: r.client_name ?? "", contact_phone: r.client_phone ?? "" }} />}
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
                          <span className="block" />
                          <a className="link" style={{ fontSize: 12, marginTop: 2, marginRight: 12 }} href={`${base}/proprietati/${a.property_id}/comparabile?raport=${r.id}`}>Comparabile →</a>
                          <a className="link" style={{ fontSize: 12, marginTop: 2 }} href={`${base}/proprietati/${a.property_id}`}>{a.other_reports > 0 ? `Fișa proprietății · evaluată și în alte ${a.other_reports} rapoarte` : "Fișa proprietății"} →</a>
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
                            {c.assets && <AssetEditor report={r.id} label="Modifică" shared={a.other_reports} client={{ name: r.client_name, phone: r.client_phone }} initial={assetForm(a)} />}
                            {c.assets && assets.length > 1 && a.inspection_status !== "done" && !a.sheet_status && <RemoveAsset report={r.id} asset={a.id} name={cap(a.type) || "bunul"} />}
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
                      <td>{x.link && can(user, "clients") ? <a className="rowLink" href={`${base}/clienti/${x.id}`}>{x.name}</a> : <b>{x.name}</b>}</td>
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
                            {!cancelled && a.inspector ? (() => {
                              const p = inspectors.find((x) => x.id === a.inspector_id);
                              return <PersonLine id={a.inspector_id ?? a.inspector} name={a.inspector} presence={p?.presence} photo={p?.photo} sub={p?.seen} size={30} />;
                            })() : none ? "—" : <span className="muted">nealocat</span>}
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
                <div className="cardHead">
                  <h2>Fișa de inspecție <span className="muted">· {cap(a.type) || "bun"}{a.done_at ? ` · efectuată ${fmtDate(a.done_at, true)}` : ""}{a.inspector ? ` · ${a.inspector}` : ""}</span></h2>
                  {a.sheet_type && <a className="btn btnGhost btnSm" href={`${base}/rapoarte/${r.id}/fisa/${a.id}`}>Fișa pentru raport (PDF)</a>}
                </div>
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
                        {c.docs && <UploadButton id={r.id} docType={t} asset={assets.length > 1 ? a.id : undefined} label={list.length ? "+ încă unul" : "Încarcă"} className="linkBtn" accept=".pdf,.jpg,.jpeg,.png,.heic,.webp" />}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card">
          <h2>Verificare înainte de predare</h2>
          <ul className="checklist">
            {checks.map(([st, t, n], i) => (
              <li key={i} className={st}><i aria-hidden>{st === "ok" ? "✓" : st === "miss" ? "!" : "○"}</i><span>{t}{n && <small>{n}</small>}</span></li>
            ))}
          </ul>
        </section>
        <div className="cols dCols">
          <section className="card flush">
            <div className="cardHead"><h2>Documente sursă</h2>{c.docs && <UploadButton id={r.id} label="+ Încarcă" />}</div>
            {sources.length + orderDocs.length + glideFiles.length === 0 ? <p className="hint pad">Niciun document încă.</p> : (
              <ul className="fileList">
                {sources.map((d) => d.status === "missing" ? (
                  <li key={d.id} className="miss">
                    <span className="ext">LIPSĂ</span>
                    <span className="who"><b>{d.filename}</b><small>solicitat {fmtDate(d.requested_at)} · blochează predarea</small></span>
                    {c.docs && <UploadButton id={r.id} doc={d.id} label="Încarcă" className="linkBtn" />}
                    {c.docsDelete && <DeleteDoc id={r.id} doc={d.id} name={d.filename} />}
                  </li>
                ) : (
                  <li key={d.id}>
                    <span className="ext">{ext(d.filename)}</span>
                    <span className="who"><b>{d.filename}</b><small>încărcat {fmtDate(d.created_at)}{d.size_bytes ? ` · ${fmtSize(d.size_bytes)}` : ""}{d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ""}</small></span>
                    {c.docs && <DocTypeSelect id={r.id} doc={d.id} assets={assets.length > 1 ? assets.map((x, n) => ({ id: x.id, label: `${cap(x.type) || "Bun"}${assets.filter((y) => y.type === x.type).length > 1 ? ` ${n + 1}` : ""}` })) : null}
                      value={(() => { const t = d.doc_type ?? guessDocKind(d.filename); return DOC_KIND_KEYS.includes(t) ? `${t}:${d.asset_id ?? ""}` : "other"; })()} />}
                    <a className="link" href={`/api/crm/reports/${r.id}/documents/${d.id}`} target="_blank" rel="noopener">Descarcă</a>
                    {c.docsDelete && <DeleteDoc id={r.id} doc={d.id} name={d.filename} />}
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
            {c.docs && <div className="pad"><MissingDoc id={r.id} /></div>}
          </section>
          <section className="card">
            <h2>Livrare raport</h2>
            {final ? (
              <ul className="fileList boxed">
                <li>
                  <span className="ext">PDF</span>
                  <span className="who"><b>{final.filename}</b><small>{fmtSize(final.size_bytes ?? 0)}{final.uploaded_by_name ? ` · ${final.uploaded_by_name}` : ""}</small></span>
                  <a className="link" href={`/api/crm/reports/${r.id}/documents/${final.id}`} target="_blank" rel="noopener">Deschide</a>
                  {c.docs && <UploadButton id={r.id} kind="final" label="Înlocuiește" className="linkBtn" />}
                </li>
              </ul>
            ) : c.docs ? <FinalDrop id={r.id} /> : <p className="hint pad">Raportul final nu a fost încărcat încă.</p>}
            <dl className="kv">
              <Row k="Data încărcării">{final ? fmtDate(final.created_at, true) : r.uploaded_on ? fmtDate(r.uploaded_on) : null}</Row>
              <Row k="Transmis către">{recipients.length ? recipients.map((x) => x.name).join(" · ") : null}</Row>
              <Row k="Facturare">{r.statement_number ? `în borderoul B-${r.statement_number}` : <span className="muted">neinclus în borderou</span>}</Row>
              <Row k="Predat">{r.delivered_at ? `${fmtDate(r.delivered_at, true)}${r.delivered_by_name ? ` · ${r.delivered_by_name}` : ""}` : null}</Row>
            </dl>
            {missing.length > 0 && <div className="note">{missing.length === 1 ? "Lipsește un document" : `Lipsesc ${missing.length} documente`} din lista de documente sursă.</div>}
            {r.client_notified_at && <p className="hint">Clientul a fost anunțat pe email la {fmtDate(r.client_notified_at, true)} și descarcă raportul din portal.</p>}
            {c.deliver && !r.delivered_at && <DeliverButton id={r.id} ready={!!final} number={r.number} suggested={suggested} notifyTo={notifyTo} />}
          </section>
        </div>
        </>
      )}
      </div>
      <aside className="dSide">
        <section className="card">
          <div className="cardHead"><h2>Echipa</h2>{c.members && <AddMember id={r.id} people={people.map((x) => ({ ...x, sub: ROLE_NAME[x.role] ?? x.role }))} />}</div>
          {team.length === 0 ? <p className="hint">Nimeni alocat încă.</p> : (
            <ul className="dTeam">
              {team.map((m) => {
                const pct = memberShare(m);
                const about = [m.anevar_no && `legitimație ${m.anevar_no}`, specs(m.specializations), m.role === "inspector" && m.coverage && `zone: ${m.coverage}`, m.engagement === "contractor" && "colaborator extern"].filter(Boolean).join(" · ");
                return (
                  <li key={m.role + m.id} title={about || undefined}>
                    <Avatar id={m.id} name={m.name || m.email} size={32} presence={m.presence} photo={m.photo} title={`${m.name || m.email} · ${m.seen}`} />
                    <span className="who">{link("users", `/utilizatori/${m.id}`, "rowLink", m.name || m.email)}<small>{(ROLE_LABEL[m.role] ?? m.role).toLowerCase()} · {m.seen}</small></span>
                    {pct && (fees || m.id === user.id) && <b className="mono">{pct}</b>}
                    {c.members && <RemoveMember id={r.id} user={m.id} role={m.role} name={m.name || m.email} />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <Messages entity="report" id={r.id} rows={messages} title="Mesaje echipă" hint="Discuția echipei pe acest raport. Clientul nu le vede." />
        <section className="card">
          <h2>Date cheie</h2>
          <dl className="kv dKv">
            <Row k="Comandă">{r.ordered_at ? fmtDate(r.ordered_at) : r.received_on ? fmtDate(r.received_on) : fmtDate(r.created_at)}</Row>
            <Row k="Inspecție">{inspectedOn ? fmtDate(inspectedOn) : nextVisit ? <>programată {fmtDate(nextVisit, true)}</> : null}</Row>
            <Row k="Termen predare">{due ? <span className={late ? "errTxt" : ""}>{dueText(due)}{late ? " · depășit" : ""}</span> : <span className={d.late && !d.delivered ? "errTxt" : ""}>{d.term} zile de la comandă</span>}</Row>
            <Row k="Data raport">{r.report_date ? fmtDate(r.report_date) : <span className="muted">în așteptare</span>}</Row>
            {r.delivered_at && <Row k="Predat">{fmtDate(r.delivered_at)}{r.delivered_by_name ? ` · ${r.delivered_by_name}` : ""}</Row>}
            {fees && <Row k="Onorariu">{r.fee != null ? <span className="mono num">{lei(r.fee, "RON")}</span> : null}</Row>}
            {fees && r.collab_fee != null && <Row k="Tarif colaborator"><span className="mono num">{lei(r.collab_fee, "RON")}</span></Row>}
            {fees && <Row k="Încasat">{c.status ? <CollectedToggle id={r.id} collected={!!r.collected} at={r.collected_at} /> : r.collected ? "da" : <span className="muted">nu încă</span>}</Row>}
            {!fees && myShare && <Row k="Cota ta">{myShare}</Row>}
            <Row k="Borderou">{r.statement_number ? `B-${r.statement_number}` : <span className="muted">neinclus</span>}</Row>
          </dl>
        </section>
      </aside>
      </div>
    </CrmShell>
  );
}
