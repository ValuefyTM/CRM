import { niceName } from "@/lib/labels";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fmtDate, initials, staffPage } from "@/lib/guard";
import {
  cap, getReport, lei, propertyHistory, REPORT_STATUS, reportAssets, reportDocuments, reportLog, reportOrderDocuments, reportTeam, ROLE_LABEL, teamCandidates,
} from "@/lib/reports";
import { fileSrc } from "@/lib/files";
import { fmtSize } from "@/lib/orders";
import { orderCode, SOURCE_LABEL } from "@/lib/order-labels";
import { SPECIALIZATIONS } from "@/lib/labels";
import { CrmShell } from "@/components/CrmShell";
import { ReportList } from "@/components/ReportList";
import { AllocateAll, AssignInspection, CancelInspection, DeleteInspection, MarkInspectionDone, NeedsInspection, UvaloAction, type AllocRow } from "./InspectionActions";
import { AssetBoard } from "./AssetBoard";
import { InspSheet } from "./InspSheet";
import { inspectionSheetDoc } from "@/lib/insp-sheet-doc";
import { getFirm } from "@/lib/settings";
import { ReportDocs, type DocItem } from "./ReportDocs";
import { ReferralEdit } from "@/components/ReferralPick";
import { FramingEdit, type Party } from "./FramingEdit";
import { PURPOSES } from "@/lib/order-labels";
import { VALUE_TYPES } from "@/lib/contract-terms";
import { CONTRACT_PURPOSES, REPORT_KINDS } from "@/lib/contracts";
import { NoteParentEdit } from "@/components/NoteParentPick";
import { isNote, notesOf } from "@/lib/notes";
import type { AccessDoc } from "@/components/DocAccess";
import { AssetEditor, RemoveAsset } from "./AssetEditor";
import { assetProfile, emptyAsset, FIELD_LABELS, type AssetForm, type ProfileField } from "@/lib/asset-labels";
import { canAssign, inspectorChoices } from "@/lib/insp-assign";
import { RevisionAsk } from "../RevisionAsk";
import { SimilarReports } from "./SimilarReports";
import { LegalCheck } from "./LegalCheck";
import { docReadings, latestChecks, legalEnabled } from "@/lib/legal-check";
import { similarReports } from "@/lib/similar-reports";
import { sheetFits, STD, templateList } from "@/lib/insp-templates-db";
import { docsByAsset } from "@/lib/insp-docs";
import { guessDocKind } from "@/lib/doc-kinds";
import { Avatar, PersonLine } from "@/components/Avatar";
import { Messages } from "@/components/Messages";
import { messagesOf } from "@/lib/messages";
import { AddMember, CollectedToggle, DeliverButton, ReportNumberEdit, FinalDrop, MissingDoc, NotesEditor, RemoveMember, SafeImg, StageActions, StatusButton, UploadButton, VerifyActions } from "./ReportActions";
import { dueOf, STAGE_LABEL, stageOf } from "@/lib/dossier";
import { hasValues, nextReportNumber, noticeTarget } from "@/lib/delivery";
import { inspVisible, typeOfOrderDoc, typeOfReportDoc } from "@/lib/insp-docs";
import { isOwnIssuer } from "@/lib/report-numbers";
import { draftForReport, invoicesFor } from "@/lib/billing";
import { can, type Perm } from "@/lib/perms";
import { feeShare } from "@/lib/perms-db";
import { canFrame, reportAccess } from "@/lib/perms-db";
import { IssueInvoice, InvoiceList } from "@/components/Invoices";
import { BilledOutside } from "@/components/BilledOutside";
import { issuerColor } from "@/lib/issuer-color";
import { daysOf, SEGMENTS, segmentsOf } from "@/lib/report-stage";

export const metadata: Metadata = { title: "Raport | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { person: "Persoană fizică", company: "Persoană juridică", bank: "Bancă", ifn: "IFN", uat: "Instituție publică", anaf: "ANAF", broker: "Broker" };
const CONTACT: Record<string, string> = { client: "Clientul", owner: "Proprietarul", agent: "Agent imobiliar", other: "Altă persoană" };
const APPROACH: Record<string, string> = { market: "Piață", income: "Venit", cost: "Cost" };
const VAL_TYPE: Record<string, string> = { EPI: "EPI — proprietăți imobiliare", EBM: "EBM — bunuri mobile", EI: "EI — întreprinderi", EIF: "EIF — instrumente financiare" };
const UVALO_STATUS: Record<string, string> = { prog: "de programat în UVALO", plan: "programată în UVALO", lucru: "în lucru pe telefon", gata: "finalizată în UVALO", pred: "finalizată în UVALO", deleted: "scoasă din UVALO" };
const ROLE_NAME: Record<string, string> = { owner: "Proprietar", admin: "Administrator", evaluator: "Evaluator", operator: "Operator", inspector: "Inspector" };
const TABS = [["general", "General"], ["bunuri", "Bunuri & inspecții"], ["documente", "Acte & livrare"], ["mesaje", "Mesaje"]] as const;
// Old links: the inspections are now with the assets, the users of the report in General.
const OLD_TABS: Record<string, string> = { inspectii: "bunuri", utilizatori: "general" };
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

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; alocare?: string; bun?: string; predare?: string }> }) {
  const { db, user, base } = await staffPage();
  const { id } = await params;
  const { tab: asked, alocare, bun, predare } = await searchParams;
  const wanted = asked && OLD_TABS[asked] ? OLD_TABS[asked] : asked;
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
  // worked for Appraisal & Valuation: their order form (Excel) is filled in from here
  // The institutions a report is made for (banks first), to correct its designated user.
  const frame = canFrame(user, acc);
  const parties: Party[] = tab === "general" && frame ? (await db.prepare(`SELECT id, name, kind, logo_url FROM entities
      WHERE kind IN ('bank', 'ifn', 'uat', 'anaf', 'broker', 'other') ORDER BY kind <> 'bank', kind, name`).all<{ id: string; name: string; kind: string; logo_url: string | null }>())
    .results.map((e) => ({ id: e.id, name: niceName(e.name) || e.name, kind: e.kind, logo: fileSrc(e.logo_url) })) : [];
  // valuation notes: the initial report of a note; the notes made on a report
  const note = isNote(r.report_type);
  const [parentRep, notes] = await Promise.all([
    note && r.parent_report_id ? db.prepare("SELECT id, number FROM reports WHERE id = ?").bind(r.parent_report_id).first<{ id: string; number: string | null }>() : Promise.resolve(null),
    note ? Promise.resolve([]) : notesOf(db, id),
  ]);
  const [team, assets, docs, orderDocs, people] = await Promise.all([
    reportTeam(db, id), reportAssets(db, id), reportDocuments(db, id), reportOrderDocuments(db, r.order_id), teamCandidates(db),
  ]);
  // Billing: the invoices of this report, and whether it can be invoiced per order now (framework / collaboration rule).
  const [repInvoices, perOrder, outside] = await Promise.all([invoicesFor(db, { report: id }), can(user, "billing") || can(user, "billing:issue") ? draftForReport(db, id) : Promise.resolve({ error: "" }),
    db.prepare("SELECT billed_outside_at, billed_outside_ref FROM reports WHERE id = ?").bind(id).first<{ billed_outside_at: string | null; billed_outside_ref: string | null }>().catch(() => null)]);
  const main = assets.find((a) => a.is_main) ?? assets[0];
  // reports of the same type of property within 1 km (the general tab shows how many; the list opens on click)
  const similar = tab === "general" && main ? await similarReports(db, user, id, { radius: "1" }).catch(() => null) : null;
  const [mayAssign, inspectors, inspDocs, sheetList] = await Promise.all([canAssign(db, user, id), inspectorChoices(db, user.id), docsByAsset(db, id, assets.map((a) => a.id)), templateList(db)]);
  // The sheets an inspection of an asset can be given with: the firm's sheets meant for its type of asset, and the standard one
  // (UVALO's of the type; the VALUEFY model in the CRM app).
  const sheetsFor = (a: { category: string | null; type: string | null }): [string, string][] =>
    [...sheetList.filter((x) => sheetFits(x, a)).map((x): [string, string] => [x.key, x.name]), [STD, "Fișa standard"]];
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
  const [history, log, suggested, notifyTo] = await Promise.all([
    main ? propertyHistory(db, main.property_id, id) : Promise.resolve([]), reportLog(db, r, assets),
    r.number || !isOwnIssuer(r.issuer_name) ? Promise.resolve("") : nextReportNumber(db), r.delivered_at ? Promise.resolve(null) : noticeTarget(db, r.order_id),
  ]);
  // Working stage and deadline (from the offer: working days counted from the inspection).
  const tasks = assets.filter((a) => a.inspection_status && a.inspection_status !== "cancelled");
  // Assets still waiting for an inspection to be given count too: one asset inspected out of two is not "drafting" yet.
  const waiting = assets.filter((a) => !a.no_inspection && (!a.inspection_status || a.inspection_status === "cancelled")).length;
  const stage = stageOf(r, { total: tasks.length + waiting, done: tasks.filter((a) => a.inspection_status === "done").length, none: assets.filter((a) => a.no_inspection).length });
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
  const sources = docs.filter((d) => d.kind === "source");
  const missing = sources.filter((d) => d.status === "missing");
  const final = docs.find((d) => d.kind === "final" && d.status === "uploaded");
  const missingCount = docs.filter((d) => d.status === "missing").length;
  const glideFiles = assets.flatMap((a) => [
    a.cf_file ? { name: `Extras CF ${a.cf_number ?? ""}`.trim(), path: a.cf_file } : null,
    a.plan_file ? { name: `Releveu ${cap(a.type)}`.trim(), path: a.plan_file } : null,
  ].filter((x): x is { name: string; path: string } => !!x));
  const docCount = sources.length + orderDocs.length + glideFiles.length + (final ? 1 : 0);
  const assetsTotal = assets.reduce((s, a) => s + (a.value ?? 0), 0);
  const assetsEur = assets.reduce((s, a) => s + (a.value_eur ?? 0), 0);
  // The result: in euro (as given at delivery), with the lei equivalent when the BNR rate was known; older reports in lei only.
  const result = (eur: number | null | undefined, ron: number | null | undefined, c = cur) => (eur ? <><span className="mono num">{lei(eur, "€")}</span>{ron ? <small className="muted"> · {lei(ron, c)}</small> : null}</> : ron ? <span className="mono num">{lei(ron, c)}</span> : null);
  const order = r.order_id ? orderCode({ id: r.order_id, seq: r.order_seq, bank_ref: r.order_bank_ref, bank: r.bank_code, source: r.order_source ?? undefined }) : null;
  type Recipient = { id: string; name: string; kind: string | null; role: string; contact: string; link?: boolean; logo?: string | null };
  const recipients: Recipient[] = [];
  if (r.recipient_id) recipients.push({ id: r.recipient_id, name: niceName(r.bank_name) || "—", kind: r.recipient_kind, role: "Finanțator / utilizator desemnat", contact: [r.recipient_email, r.recipient_phone, r.recipient_code && `cod ${r.recipient_code}`].filter(Boolean).join(" · "), logo: fileSrc(r.bank_logo) });
  if (r.client_id) recipients.push({ id: r.client_id, name: niceName(r.client_name) || "—", kind: r.client_kind, role: r.recipient_id ? "Client / proprietar" : "Client / utilizator desemnat", contact: [r.client_phone, r.client_email].filter(Boolean).join(" · "), link: true, logo: fileSrc(r.client_logo) });
  const checks: [state: "ok" | "miss" | "todo", text: string, note?: string][] = [
    main?.no_inspection ? ["ok", "Bun principal fără inspecție", main.no_inspection] : [main?.sheet_photo || main?.inspection_status === "done" ? "ok" : "todo", "Fișă inspecție bun principal atașată"],
    [assets.length > 0 && assets.every((a) => a.value != null) ? "ok" : "todo", "Valori completate pe toate bunurile", assets.length ? `${assets.filter((a) => a.value != null).length} din ${assets.length}` : "niciun bun"],
    ...missing.map((d): ["miss", string, string] => ["miss", `${d.filename} lipsă`, "blochează predarea"]),
    [evaluator ? "ok" : "todo", "Evaluator alocat", evaluator?.name],
    [verifier ? "ok" : "todo", `Verificare finală${verifier ? ` (${verifier.name})` : ""}`, verifier ? undefined : "verificator nealocat"],
    [final ? "ok" : "todo", "PDF semnat încărcat"],
  ];
  const href = (t: Tab) => `${base}/rapoarte/${id}${t === "general" ? "" : `?tab=${t}`}`;
  const counts: Partial<Record<Tab, number>> = { bunuri: assets.length, documente: docCount, mesaje: messages.length };
  const logo = fileSrc(r.issuer_logo), bankLogo = fileSrc(r.bank_logo), clientLogo = fileSrc(r.client_logo);
  const stripe = issuerColor(r.issuer_name, r.issuer_color);
  // The four segments and the days counter, the same as in the list of reports.
  const today = new Date().toISOString().slice(0, 10);
  const nextVisit = tasks.filter((a) => a.inspection_status === "scheduled" && a.scheduled_at).map((a) => a.scheduled_at!).sort()[0] ?? null;
  const stageRow = {
    status: r.status, stage: r.stage, delivered_at: r.delivered_at, verified_at: r.verified_at, report_date: r.report_date,
    insp_total: tasks.length + waiting, insp_done: tasks.filter((a) => a.inspection_status === "done").length, no_insp: assets.filter((a) => a.no_inspection).length,
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
    m.role === "verifier" && m.share_verifier != null ? `${m.share_verifier}%`
    : m.role === "inspector" && m.inspector_fee != null ? (m.inspector_fee_kind === "pct" ? `${m.inspector_fee}%` : lei(m.inspector_fee, "RON")) : null;
  // Short asset names (for the documents): the type, numbered when two assets share it.
  const assetShort = (a: A) => `${cap(a.type) || "Bun"}${assets.filter((y) => y.type === a.type).length > 1 ? ` ${assets.indexOf(a) + 1}` : ""}`;
  const shortOf = (assetId: string | null) => { const a = assets.find((x) => x.id === assetId); return a ? assetShort(a) : null; };
  // The documents the inspector may be given, and the ones chosen for an open inspection (null: the default CF / releveu).
  const accessDocs: AccessDoc[] = sources.filter((x) => x.status === "uploaded").map((x) => ({ id: x.id, name: x.filename, kind: x.doc_type ?? guessDocKind(x.filename), asset_id: x.asset_id, asset_label: shortOf(x.asset_id) }));
  // The documents the inspector of an asset sees: the ticked ones (by default CF and RLV), of the whole report or of the asset.
  const accessOf = (a: A) => sources.filter((x) => x.kind === "source" && x.status === "uploaded" && (!x.asset_id || x.asset_id === a.id)
    && inspVisible(x.insp_visible, typeOfReportDoc(x.doc_type, x.filename))).map((x) => x.id);
  // What a card shows: the details this type of asset has (an apartment its rooms and floor, land its area, a car its plate).
  const facts = (a: A): [string, string][] => {
    const p = assetProfile(a.category, a.type);
    const num = (n: number | null, u: string) => (n ? `${n.toLocaleString("ro-RO")}${u}` : null);
    const val: Partial<Record<ProfileField, string | null>> = {
      usable_area: num(a.usable_area, " mp"), land_area: num(a.land_area, " mp"), rooms: a.rooms ? String(a.rooms) : null, floor: a.floor, height_regime: a.height_regime,
      year_built: a.year_built ? String(a.year_built) : null, vehicle_make: a.vehicle_make, vehicle_model: a.vehicle_model, reg_number: a.reg_number, vin: a.vin,
      mileage: num(a.mileage, " km"), cf_number: a.cf_number, cad_building: a.cad_building !== a.cf_number ? a.cad_building : null, cad_land: a.cad_land,
    };
    return p.fields.filter((k) => k !== "construction" && val[k]).map((k) => [(p.labels[k] ?? FIELD_LABELS[k]).replace(/ \((mp|km)\)$/, ""), val[k]!]);
  };
  const inspPill = (a: A): [string, string] => {
    const st = inspState(a);
    return st === "none" ? ["Fără inspecție", ""] : st === "done" ? ["Inspecție realizată", "pillOk"] : st === "open" ? [a.inspection_status === "scheduled" ? "Inspecție programată" : "Inspecție de programat", "pillInfo"] : ["Inspecție nealocată", "pillWarn"];
  };
  const fresh = messages.length > 0 && !messages[messages.length - 1].mine;
  // When the inspector's documents were last sent (the update button, or the allocation with its documents), and by whom.
  const inspSent = await db.prepare(`SELECT l.at, COALESCE(NULLIF(u.name, ''), u.email) AS who FROM audit_log l LEFT JOIN users u ON 'user:' || u.id = l.actor
      WHERE l.entity = 'report' AND l.entity_id = ? AND l.action IN ('report.document_insp', 'report.inspection_assign') ORDER BY l.at DESC LIMIT 1`).bind(r.id)
    .first<{ at: string; who: string | null }>().catch(() => null);
  const docItems: DocItem[] = [
    // the final report first, in red, among the report's own documents (not on an asset)
    ...(final ? [{ id: final.id, name: final.filename, kind: "final", asset_id: null, status: "uploaded", origin: "report", href: `/api/crm/reports/${r.id}/documents/${final.id}`,
      size: final.size_bytes, at: final.created_at, by: final.uploaded_by_name, final: true } satisfies DocItem] : []),
    ...sources.map((x): DocItem => ({ id: x.id, name: x.filename, kind: x.doc_type ?? guessDocKind(x.filename), asset_id: x.asset_id, status: x.status === "missing" ? "missing" : "uploaded", origin: "report",
      href: x.status === "missing" ? null : `/api/crm/reports/${r.id}/documents/${x.id}`, size: x.size_bytes, at: x.status === "missing" ? x.requested_at : x.created_at, by: x.uploaded_by_name,
      insp: x.kind === "source" && x.status !== "missing" ? inspVisible(x.insp_visible, typeOfReportDoc(x.doc_type, x.filename)) : undefined })),
    ...orderDocs.map((x): DocItem => ({ id: x.id, name: x.filename, kind: guessDocKind(x.filename), asset_id: null, status: "uploaded", origin: "order", href: `/api/crm/orders/${r.order_id}/documents/${x.id}`, size: x.size_bytes, at: x.created_at, by: null,
      insp: inspVisible(x.insp_visible, typeOfOrderDoc(x.kind, x.filename)) })),
    ...assets.flatMap((a) => [
      a.cf_file ? { name: `Extras CF ${a.cf_number ?? ""}`.trim(), path: a.cf_file, kind: "cf" } : null,
      a.plan_file ? { name: `Releveu ${cap(a.type)}`.trim(), path: a.plan_file, kind: "rlv" } : null,
    ].filter((x): x is { name: string; path: string; kind: string } => !!x).map((f): DocItem => ({ id: f.path, name: f.name, kind: f.kind, asset_id: a.id, status: "uploaded", origin: "glide", href: null, size: null, at: null, by: null, insp: true }))),
  ];
  // what the legal check read from the documents (name of the act, number, date, issuer), and its newest results
  const [readings, legal] = tab === "documente"
    ? await Promise.all([docReadings(db, docItems.filter((d) => d.origin !== "glide").map((d) => `${d.origin === "order" ? "o" : "r"}:${d.id}`)), latestChecks(db, r.id)])
    : [{}, []] as [Awaited<ReturnType<typeof docReadings>>, Awaited<ReturnType<typeof latestChecks>>];
  for (const d of docItems) { const x = readings[`${d.origin === "order" ? "o" : "r"}:${d.id}`]; if (x) d.read = x; }
  const sheets = assets.filter((a) => a.sheet_type && (a.sheet_photo || a.sheet_person || a.inspection_status === "done"));
  // The list of assets: its title with the inspection button (allocate while some asset has none, else reallocate the open
  // ones), and "Adaugă bun" at its end.
  const freeAssets = assets.filter((a) => inspState(a) === "free").length;
  const openAssets = assets.filter((a) => inspState(a) === "open").length;
  const allocRows = assets.map((a): AllocRow => ({
    asset: a.id, label: `${cap(a.type) || "Bun"}${a.is_main && assets.length > 1 ? " (principal)" : ""}`, address: a.full_address ?? a.city, state: inspState(a),
    inspector: a.inspector_id, none: a.no_inspection, sheet_type: sheetsFor(a)[0][0], docs: docState(a.id), ...contactOf(a),
  }));
  const boardHead = (
    <div className="abListHead">
      <h2>Bunuri evaluate <span className="muted">· {assets.length} {assets.length === 1 ? "bun" : "bunuri"}{assetsEur || r.result_eur || assetsTotal || r.result_value ? <> · total {result(assetsEur || r.result_eur, assetsTotal || r.result_value)}</> : null}</span></h2>
      {mayAssign && freeAssets > 0 && <AllocateAll report={r.id} me={user.id} people={inspectors} docs={accessDocs} rows={allocRows} autoOpen={alocare === "1"} />}
      {mayAssign && freeAssets === 0 && openAssets > 0 && <AllocateAll realloc report={r.id} me={user.id} people={inspectors} docs={accessDocs} rows={allocRows} autoOpen={false} />}
    </div>
  );
  const addAsset = c.assets ? (
    <AssetEditor report={r.id} label="+ Adaugă bun" className="addAsset abAdd" client={{ name: r.client_name, phone: r.client_phone }}
      initial={{ ...emptyAsset({ county: main?.county, city: main?.city }), is_main: assets.length === 0, contact_name: r.client_name ?? "", contact_phone: r.client_phone ?? "" }} />
  ) : null;
  // The inspection sheets of the inspected assets, opened over the page as in UVALO (all their photos).
  const withSheet = assets.filter((a) => a.inspection_status === "done" && (a.sheet_photo || a.sheet_person || a.sheet_description || a.sheet_location));
  const sheetDocs = Object.fromEntries(await Promise.all(withSheet.map(async (a) => [a.id, await inspectionSheetDoc(db, r.id, a.id).catch(() => null)] as const)));
  const ownIssuer = isOwnIssuer(r.issuer_name);
  const sheetFirm = { name: r.issuer_name ?? "VALUEFY", logo, corp: ownIssuer ? (await getFirm(db)).anevar || null : null };
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
              <h2 className="rNumber">{r.number ? `Nr. ${r.number}` : "Fără număr"}
                {/* A collaborating firm's report: its number is typed (VALUEFY's series is automatic, not edited). */}
                {!ownIssuer && c.edit && <ReportNumberEdit id={r.id} number={r.number} firm={r.issuer_name ?? "firma colaboratoare"} />}</h2>
              <span className={`pill ${cls}`}><i />{label}{finished && r.report_date ? ` · ${fmtDate(r.report_date)}` : ""}</span>
              {r.status !== "cancelled" && <span className={`pill ${stage === "delivered" ? "pillOk" : "pillWarn"}`}><i />{STAGE_LABEL[stage]}</span>}
              {missingCount > 0 && r.status !== "cancelled" && <a className="pill pillErr dMissing" href={href("documente")} title={docs.filter((x) => x.status === "missing").map((x) => x.filename).join(", ")}><i />{missingCount === 1 ? "Lipsește 1 document" : `Lipsesc ${missingCount} documente`}</a>}
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
            <a className={`dMsgBtn${fresh ? " fresh" : ""}`} href={href("mesaje")} aria-current={tab === "mesaje" ? "page" : undefined}
              title={messages.length ? `${messages.length} ${messages.length === 1 ? "mesaj" : "mesaje"} în echipă${fresh ? " · ultimul de la " + messages[messages.length - 1].author : ""}` : "Mesajele echipei"}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6.2A8 8 0 1 1 21 12z" /></svg>
              Mesaje{messages.length > 0 && <b>{messages.length}</b>}
            </a>
            {/* drafting mode: the texts for the bank's application, chapter by chapter */}
            {assets.length > 0 && r.status !== "cancelled" && <a className="btn btnGhost btnSm dDraft" href={`${base}/rapoarte/${r.id}/redactare`}>Redactare raport</a>}
            {c.docs && <a className="btn btnGold btnSm" href={final && c.deliver && !r.delivered_at ? `${href("documente")}&predare=1` : href("documente")}>{final ? "Livrare raport" : "Încarcă raportul final"}</a>}
            {/* "Finalizat" goes through the delivery (date, values per asset, euro, approach), never straight to the status. */}
            {c.status && <StatusButton id={r.id} status={r.status} reason={r.suspend_reason} locked={acc.locked}
              finish={r.delivered_at ? null : !c.deliver ? "Raportul îl finalizează evaluatorul principal, din „Predă raportul”." : final ? `${href("documente")}&predare=1` : "Încarcă întâi raportul final (PDF semnat) în Documente; apoi îl predai cu valorile."} />}
            {c.status && !acc.locked && !r.glide_id && r.status !== "cancelled" && <StageActions id={r.id} stage={stage} hasVerifier={!!verifier} />}
          </div>
        </div>
        {r.status !== "cancelled" && (
          <div className="dStage" aria-label="Etapa raportului">
            {SEGMENTS.map((t, i) => (
              <div key={t} className={`dSeg ${seg[i]}`}><i /><b>{t}</b><small>{segNote[i] || "—"}</small></div>
            ))}
            <div className={`dDays${d.late ? " late" : d.delivered ? " done" : ""}`} title={`Zile lucrătoare de la comandă · termen ${d.term} zile`}>
              <b>{d.days}</b><small>{d.late ? `din ${d.term} zile · +${d.over}` : `din ${d.term} zile`}</small>
              {d.delivered && r.report_date && <small className="dDaysDate">raport din {fmtDate(r.report_date)}</small>}
            </div>
          </div>
        )}
        {c.verify && stage === "review" && <div className="dVerify"><span>Raportul așteaptă verificarea.</span><VerifyActions id={r.id} verified={r.verified_at ? fmtDate(r.verified_at, true) : null} /></div>}
      </section>
      {acc.locked && <div className="note dLocked"><b>Raport finalizat · blocat.</b> Actele, bunurile, inspecțiile, echipa și mesajele nu se mai modifică. Pentru modificări, redeschide-l din „Schimbă status” (cu motivul).</div>}
      {(r.status === "suspended" || r.status === "cancelled") && r.suspend_reason && <div className="note"><b>{r.status === "suspended" ? "Suspendat" : "Anulat"}:</b> {r.suspend_reason}</div>}

      <nav className="pillTabs dTabs" aria-label="Secțiuni raport">
        {TABS.map(([k, l]) => (
          <a key={k} href={href(k)} aria-current={tab === k ? "page" : undefined}>{l}{counts[k] ? <small>{counts[k]}</small> : null}</a>
        ))}
      </nav>

      <div className={`dBody${tab === "documente" ? " solo" : ""}`}>
      <div className="dMain">
      {tab === "general" && (
        <>
          <div className="dGrid2">
            <section className="card">
              <div className="cardHead"><h2>Încadrare evaluare</h2>{frame && (
                <FramingEdit id={r.id} parties={parties} purposes={[...new Set([...CONTRACT_PURPOSES, ...PURPOSES])]} valueTypes={VALUE_TYPES.map(([, l]) => l)}
                  reportTypes={[...new Set([...REPORT_KINDS, "Notă de evaluare"])]}
                  client={r.client_id ? { id: r.client_id, name: niceName(r.client_name) || "client", kind: r.client_kind, logo: fileSrc(r.client_logo) } : null}
                  recipient={r.recipient_id && r.recipient_id !== r.client_id ? { id: r.recipient_id, name: niceName(r.bank_name) || "utilizator", kind: r.recipient_kind, logo: fileSrc(r.bank_logo) } : null}
                  initial={{ purpose: r.purpose ?? "", value_type: r.value_type ?? "", report_type: r.report_type ?? "", valuation_types: r.valuation_types ?? "",
                    valuation_date: r.valuation_date?.slice(0, 10) ?? "", currency: r.currency === "EUR" ? "EUR" : "RON", bank_branch: r.bank_branch ?? "" }} />
              )}</div>
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
                <Row k="Recomandată de"><ReferralEdit report={r.id} base={base} canEdit={c.edit} canAdd={can(user, "users.A")}
                  value={r.referral_id ? { id: r.referral_id, name: r.referral_name ?? "colaborator" } : null} /></Row>
                {note && <Row k="Raport inițial"><NoteParentEdit note={r.id} client={r.client_id} parent={parentRep ?? null} canEdit={c.edit} base={base} /></Row>}
                <Row k="Emitent">{r.issuer_name}</Row>
              </dl>
            </section>
            {notes.length > 0 && (
              <section className="card">
                <div className="cardHead"><h2>Note de evaluare</h2><span className="muted">{notes.length} {notes.length === 1 ? "notă" : "note"} pe acest raport</span></div>
                <ul className="rpNotes">
                  {notes.map((n) => {
                    const [nl, nc] = REPORT_STATUS[n.status] ?? [n.status, ""];
                    return (
                      <li key={n.id}>
                        <a className="link" href={`${base}/rapoarte/${n.id}`}>{n.number ? `Notă nr. ${n.number}` : n.label ?? "Notă de evaluare"}</a>
                        <span className="muted">{fmtDate(n.date)}{fees && n.fee ? ` · ${lei(n.fee, "RON")}` : ""}</span>
                        <span className={`pill ${nc}`}><i />{nl}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <section className="card">
              <div className="cardHead"><h2>Bunul principal</h2>{main && <a className="link" href={href("bunuri")}>bunuri & inspecții →</a>}</div>
              {!main ? <p className="hint">Raportul nu are bunuri înregistrate.</p> : (
                <>
                  <a className="dAsset dAssetLink" href={`${base}/rapoarte/${r.id}/bun/${main.id}`}>
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
                  </a>
                  <dl className="kv">
                    <Row k="Valoare rezultat">{result(r.result_eur || assetsEur, r.result_value || assetsTotal)}</Row>
                    <Row k="Abordare">{main.approach ? APPROACH[main.approach] : null}</Row>
                    {assets.length > 1 && <Row k="Alte bunuri"><a className="link" href={href("bunuri")}>{assets.length - 1} {assets.length === 2 ? "bun" : "bunuri"} →</a></Row>}
                  </dl>
                  {similar?.located && <SimilarReports report={r.id} base={base} count={similar.rows.length} bank={similar.subject?.bank ?? null} />}
                </>
              )}
            </section>
          </div>
          <section className="card flush">
            <div className="cardHead"><h2>Utilizatori / destinatari ai raportului</h2></div>
            {recipients.length === 0 ? <p className="hint pad">Raportul nu are client sau utilizator desemnat.</p> : (
              <div className="tableWrap">
                <table className="table">
                  <thead><tr><th>Entitate</th><th>Tip</th><th>Rol utilizator</th><th>Contact</th></tr></thead>
                  <tbody>
                    {recipients.map((x) => (
                      <tr key={x.id + x.role}>
                        <td><span className="rcWho">{x.logo ? <SafeImg src={x.logo} className="rcLogo" fallback={<i className="rcLogo">{initials(x.name, "c")}</i>} /> : <i className="rcLogo">{initials(x.name, "c")}</i>}
                          {x.link && can(user, "clients") ? <a className="rowLink" href={`${base}/clienti/${x.id}`}>{x.name}</a> : <b>{x.name}</b>}</span></td>
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
          {fees && (repInvoices.length > 0 || !("error" in perOrder) || outside?.billed_outside_at) && (
            <section className="card">
              <div className="cardHead"><h2>Facturi</h2>{!("error" in perOrder) && can(user, "billing:issue") && <span className="actions"><IssueInvoice report={r.id} label="Emite factura" /><BilledOutside report={r.id} /></span>}</div>
              {outside?.billed_outside_at && <p className="hint" style={{ margin: 0 }}>Facturat direct din Oblio{outside.billed_outside_ref ? `: ${outside.billed_outside_ref}` : ""}, la {fmtDate(outside.billed_outside_at)}.</p>}
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
          {assets.length === 0 ? <section className="card abList">{boardHead}<p className="hint">Raportul nu are bunuri înregistrate.</p>{addAsset}</section> : (
            <AssetBoard initial={bun} head={boardHead} foot={addAsset} items={assets.map((a, n) => {
              const [pt, pc] = inspPill(a);
              const fromApp = !!a.inspection_id && !a.inspection_from_glide;
              const active = isActive(a);
              const cancelled = a.inspection_status === "cancelled";
              const none = !!a.no_inspection && !active && a.inspection_status !== "done";
              const canGive = !active && a.inspection_status !== "done";
              const ct = contactOf(a);
              const contact = [ct.contact_kind ? CONTACT[ct.contact_kind] : null, ct.contact_name, ct.contact_phone].filter(Boolean).join(" · ");
              const person = !cancelled && a.inspector ? inspectors.find((x) => x.id === a.inspector_id) : null;
              const refs = accessOf(a);
              const seen = refs ? refs.filter((x) => accessDocs.some((y) => y.id === x)).length : (inspDocs[a.id]?.cf.length ?? 0) + (inspDocs[a.id]?.rlv.length ?? 0);
              const f = facts(a);
              const label = `${cap(a.type) || "Bun"}${a.full_address ? ` · ${a.full_address}` : ""}`;
              const photos = [fileSrc(a.sheet_photo), fileSrc(a.image_url)].filter((x, i, l): x is string => !!x && l.indexOf(x) === i);
              // The sheet shows once the inspection is done and something was filled in.
              const hasSheet = a.inspection_status === "done" && !!(a.sheet_photo || a.sheet_person || a.sheet_description || a.sheet_location);
              const thumb = a.inspection_status === "done" ? photos[0] ?? null : null;
              return {
                id: a.id,
                href: `${base}/rapoarte/${r.id}/bun/${a.id}`,
                card: (
                  <div className={`abRow${thumb ? " hasPh" : ""}`}>
                    <span className="abThumb">{thumb ? <SafeImg src={thumb} alt="" fallback={<span className="abNo">{n + 1}</span>} /> : <span className="abNo">{n + 1}</span>}</span>
                    <div className="abMain">
                      <div className="abTitle">
                        <b>{cap(a.type) || "Bun"}{a.construction === "under_construction" ? " · în construcție" : ""}</b>
                        {a.is_main ? <span className="tag">Principal</span> : null}
                        <small>{cap(a.category) || ""}</small>
                      </div>
                      <p className="abAddr">{a.full_address ?? a.city ?? <span className="muted">fără adresă</span>}</p>
                      {f.length > 0 && <dl className="abFacts">{f.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={/CF|cad|VIN|înmatriculare/i.test(k) ? "mono" : ""}>{v}</dd></div>)}</dl>}
                    </div>
                    <div className="abSide">
                      <span className="abVal">{a.value_eur ? <b className="mono num">{lei(a.value_eur, "€")}</b> : a.value != null ? <b className="mono num">{lei(a.value, cur)}</b> : <small className="muted">fără valoare</small>}{a.value_eur && a.value ? <small> · {lei(a.value, cur)}</small> : null}{a.approach && <small> · {APPROACH[a.approach]}</small>}</span>
                      {c.assets && (
                        <span className="abActs">
                          <AssetEditor report={r.id} label="Modifică" shared={a.other_reports} client={{ name: r.client_name, phone: r.client_phone }} initial={assetForm(a)} />
                          {assets.length > 1 && a.inspection_status !== "done" && !a.sheet_status && <RemoveAsset report={r.id} asset={a.id} name={cap(a.type) || "bunul"} />}
                        </span>
                      )}
                    </div>
                  </div>
                ),
                panel: (
                  <>
                    <div className="abInspHead">
                      <span className={`pill ${pc}`}><i />{pt}</span>
                      {person || (!cancelled && a.inspector) ? <PersonLine id={a.inspector_id ?? a.inspector!} name={a.inspector!} presence={person?.presence} photo={person?.photo} size={24} />
                        : <small className="muted">{none ? "nu are nevoie de inspecție" : "niciun inspector"}</small>}
                    </div>
                    <dl className="abInspKv">
                      {none && <div><dt>Motiv</dt><dd>{a.no_inspection}</dd></div>}
                      {!cancelled && a.inspection_status === "done" && <div><dt>Realizată</dt><dd>{a.done_at ? fmtDate(a.done_at, a.done_at.length > 10) : "—"}</dd></div>}
                      {active && <div><dt>Programată</dt><dd>{a.scheduled_at ? fmtDate(a.scheduled_at, true) : <span className="muted">încă nu</span>}{a.due_on ? <span className="muted"> · termen {fmtDate(a.due_on)}</span> : null}</dd></div>}
                      {!none && contact && <div><dt>Contact</dt><dd title={contact}>{contact}</dd></div>}
                      {cancelled && !none && <div><dt>Stare</dt><dd>anulată</dd></div>}
                      {a.uvalo_error && !cancelled && <div><dt>UVALO</dt><dd className="errTxt" title={a.uvalo_error}>{a.uvalo_error}</dd></div>}
                    </dl>
                    {hasSheet && (
                      <div className="abSheetRow">
                        {thumb ? <SafeImg src={thumb} alt="" className="abSheetPh" fallback={<span className="abSheetPh" />} /> : <span className="abSheetPh" />}
                        <span className="abSheetTxt"><b>Fișa de inspecție</b><small>{a.done_at ? fmtDate(a.done_at) : "completată"}</small></span>
                        <InspSheet doc={sheetDocs[a.id] ?? null} src={`/api/crm/reports/${r.id}/sheet/${a.id}`} firm={sheetFirm} pdf={`${base}/rapoarte/${r.id}/fisa/${a.id}`} />
                      </div>
                    )}
                    {a.sheet_status === "revision" && a.revision_note && (
                      <div className="bvRev"><b>Completări cerute{a.revision_at ? ` · ${fmtDate(a.revision_at, true)}` : ""}</b><span>{a.revision_note}</span><small>Fișa e la inspector, în aplicație. Când o trimite din nou, primești notificare.</small></div>
                    )}
                    {a.sheet_status === "submitted" && a.revision_done && a.revision_note && (
                      <div className="bvRev done"><b>Completări trimise {fmtDate(a.revision_done, true)}</b><span>{a.revision_note}</span></div>
                    )}
                    {mayAssign && fromApp && a.inspection_status === "done" && a.inspection_id && a.sheet_status === "submitted" && !a.uvalo_id && (
                      <RevisionAsk report={r.id} inspection={a.inspection_id} inspector={a.inspector} />
                    )}
                    {((fromApp && !cancelled && (a.assigned_by_name || a.instructions)) || active || ((a.uvalo_id) && !cancelled)) && (
                      <details className="abMore">
                        <summary>Detalii</summary>
                        <dl className="abInspKv">
                          {fromApp && !cancelled && a.assigned_by_name && <div><dt>Alocată de</dt><dd>{a.assigned_by_name}{a.assigned_at ? `, ${fmtDate(a.assigned_at)}` : ""}</dd></div>}
                          {active && <div><dt>Acte la inspector</dt><dd>{seen ? `${seen} ${seen === 1 ? "act" : "acte"}` : <span className="muted">niciun act</span>}</dd></div>}
                          {fromApp && a.sheet_status === "draft" && active && <div><dt>Fișă</dt><dd>în lucru</dd></div>}
                          {a.uvalo_id && !cancelled && <div><dt>UVALO</dt><dd>{a.uvalo_code ? <span className="mono">{a.uvalo_code} · </span> : null}{UVALO_STATUS[a.uvalo_status ?? ""] ?? "trimisă"}</dd></div>}
                          {fromApp && a.instructions && !cancelled && <div className="wide"><dt>Instrucțiuni</dt><dd>{a.instructions}</dd></div>}
                        </dl>
                      </details>
                    )}
                    {mayAssign && active && a.uvalo_error && <UvaloAction report={r.id} inspection={a.inspection_id!} action="push" />}
                    {/* finished in UVALO but not here (the webhook missed it), or photos missing / still to copy: brought in by hand */}
                    {mayAssign && a.uvalo_id && !cancelled && a.uvalo_status !== "deleted" && <UvaloAction report={r.id} inspection={a.inspection_id!} action="import" done={a.inspection_status === "done"} />}
                    {mayAssign && (
                      <div className="abPanelActs">
                        {(canGive || active) && (
                          <AssignInspection report={r.id} me={user.id} people={inspectors} docs={accessDocs} sheets={sheetsFor(a)} access={active ? refs : null} initial={{
                            asset: a.id, label, inspection: active ? a.inspection_id : null,
                            inspector: active ? a.inspector_id : null, sheet_type: (active && (a.sheet_template || a.sheet_type)) || sheetsFor(a)[0][0],
                            due_on: active ? a.due_on : null, ...ct, instructions: active ? a.instructions : null, scheduled: a.inspection_status === "scheduled",
                            docs: docState(a.id),
                          }} />
                        )}
                        {a.inspection_status === "done" && (
                          <AssignInspection reinspect report={r.id} me={user.id} people={inspectors} docs={accessDocs} sheets={sheetsFor(a)} access={null} initial={{
                            asset: a.id, label, inspection: null, inspector: a.inspector_id, sheet_type: a.sheet_template || sheetsFor(a)[0][0],
                            due_on: null, ...ct, instructions: null, scheduled: false, docs: docState(a.id),
                          }} />
                        )}
                        {a.inspection_status !== "done" && !none && <MarkInspectionDone report={r.id} asset={a.id} label={label} />}
                        {none && <NeedsInspection report={r.id} asset={a.id} />}
                        {active && <CancelInspection report={r.id} inspection={a.inspection_id!} who={a.inspector ?? "inspector"} />}
                        {a.inspection_id && !cancelled && <DeleteInspection report={r.id} inspection={a.inspection_id} label={label} done={a.inspection_status === "done"} uvalo={!!a.uvalo_id} />}
                      </div>
                    )}
                  </>
                ),
              };
            })} />
          )}
          <ReportList reports={history} base={base} title="Alte evaluări ale aceleiași proprietăți" />
        </>
      )}

      {tab === "documente" && (
        <ReportDocs tools={assets.some((a) => a.category !== "BUN MOBIL") ? <LegalCheck report={r.id} canRun={c.docs} enabled={legalEnabled()} checks={legal}
            assets={assets.filter((a) => a.category !== "BUN MOBIL").map((a) => ({ id: a.id, label: assetShort(a), hasDocs: docItems.some((d) => !d.final && d.status === "uploaded" && d.origin !== "glide" && (!d.asset_id || d.asset_id === a.id)) }))} /> : null}
          inspOpen={assets.some(isActive)} inspSent={inspSent} report={r.id} assets={assets.map((a) => ({ id: a.id, label: assetShort(a), sub: a.full_address ?? a.city }))} items={docItems} edit={c.docs} remove={c.docsDelete}
          missing={c.docs ? <><span className="muted">Lipsește un act de la client?</span><MissingDoc id={r.id} /></> : null}
          deliver={
            <section className="card dDeliver">
              <div className="cardHead"><h2><span className="dDelTag">Livrabile</span></h2>{r.delivered_at && <span className="pill pillOk"><i />Predat {fmtDate(r.delivered_at)}</span>}</div>
              {final ? (
                <ul className="fileList boxed">
                  <li>
                    <span className="ext">PDF</span>
                    <span className="who"><b>{final.filename}</b><small>raport final · {fmtDate(final.created_at)}</small></span>
                    <a className="link" href={`/api/crm/reports/${r.id}/documents/${final.id}`} target="_blank" rel="noopener">Deschide</a>
                  </li>
                </ul>
              ) : c.docs ? <FinalDrop id={r.id} /> : <p className="hint">Raportul final nu a fost încărcat încă.</p>}
              {final && c.docs && <UploadButton id={r.id} kind="final" label="Înlocuiește raportul final" className="linkBtn" />}
              {sheets.length > 0 && (
                <ul className="dDelSheets">
                  {sheets.map((a) => <li key={a.id}><a className="link" href={`${base}/rapoarte/${r.id}/fisa/${a.id}`}>Fișa de inspecție · {assetShort(a)}</a><small>PDF</small></li>)}
                </ul>
              )}
              <details className="dDelCheck">
                <summary>Verificare înainte de predare <b>{checks.filter(([st]) => st === "ok").length}/{checks.length}</b></summary>
                <ul className="checklist">
                  {checks.map(([st, t, n], i) => (
                    <li key={i} className={st}><i aria-hidden>{st === "ok" ? "✓" : st === "miss" ? "!" : "○"}</i><span>{t}{n && <small>{n}</small>}</span></li>
                  ))}
                </ul>
              </details>
              <dl className="kv dDelKv">
                <Row k="Transmis către">{recipients.length ? recipients.map((x) => x.name).join(" · ") : null}</Row>
                <Row k="Borderou">{r.statement_number ? `B-${r.statement_number}` : <span className="muted">neinclus</span>}</Row>
                {r.delivered_at && <Row k="Predat">{fmtDate(r.delivered_at, true)}{r.delivered_by_name ? ` · ${r.delivered_by_name}` : ""}</Row>}
                {r.delivered_at && (r.result_eur || r.result_value) ? <Row k="Rezultat evaluare">{result(r.result_eur, r.result_value)}{r.result_eur && r.result_value && r.eur_rate ? <small className="muted"> · curs BNR {r.eur_rate.toLocaleString("ro-RO", { maximumFractionDigits: 4 })} la {fmtDate(r.report_date)}</small> : null}</Row> : null}
              </dl>
              {r.client_notified_at && <p className="hint">Clientul a fost anunțat pe email la {fmtDate(r.client_notified_at, true)}.</p>}
              {c.deliver && !r.delivered_at && <DeliverButton id={r.id} ready={!!final} number={r.number} suggested={suggested} notifyTo={notifyTo} values={hasValues(r.report_type)} auto={ownIssuer} autoOpen={predare === "1"}
                assets={assets.map((a) => ({ id: a.id, label: assetShort(a), sub: a.full_address ?? a.city, value: a.value_eur, approach: a.approach }))} />}
            </section>
          } />
      )}

      {tab === "mesaje" && (
        <Messages full entity="report" id={r.id} rows={messages} readOnly={c.messages ? null : acc.locked ? "Raportul este finalizat: conversația e închisă. Redeschide raportul ca să poți scrie." : "Nu poți scrie în conversația acestui raport."} title="Chat echipă" hint="Discuția echipei pe acest raport: evaluator, verificator, inspector, operatori. Clientul nu vede mesajele." />
      )}
      </div>
      {tab !== "documente" && <aside className="dSide">
        <section className="card">
          <div className="cardHead"><h2>Echipa</h2>{c.members && <AddMember id={r.id} people={people.map((x) => ({ ...x, sub: ROLE_NAME[x.role] ?? x.role, duties: x.duties }))} />}</div>
          {team.length === 0 ? <p className="hint">Nimeni alocat încă.</p> : (
            <ul className="dTeam">
              {/* One line per person: someone who is both evaluator and inspector shows once, with both roles. */}
              {team.filter((m, i) => team.findIndex((x) => x.id === m.id) === i).map((m) => {
                const mine = team.filter((x) => x.id === m.id);
                const roles = mine.map((x) => ({ role: x.role, label: (ROLE_LABEL[x.role] ?? x.role).toLowerCase() }));
                const pct = mine.map(memberShare).filter(Boolean).join(" + ");
                const about = [m.anevar_no && `legitimație ${m.anevar_no}`, specs(m.specializations), mine.some((x) => x.role === "inspector") && m.coverage && `zone: ${m.coverage}`, m.engagement === "contractor" && "colaborator extern"].filter(Boolean).join(" · ");
                return (
                  <li key={m.id} title={about || undefined}>
                    <Avatar id={m.id} name={m.name || m.email} size={32} presence={m.presence} photo={m.photo} title={`${m.name || m.email} · ${m.seen}`} />
                    <span className="who">{link("users", `/utilizatori/${m.id}`, "rowLink", m.name || m.email)}<small>{roles.map((x) => x.label).join(" și ")} · {m.seen}</small></span>
                    {pct && (fees || m.id === user.id) && <b className="mono">{pct}</b>}
                    {c.members && <RemoveMember id={r.id} user={m.id} roles={roles} name={m.name || m.email} />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        {tab !== "mesaje" && <Messages entity="report" id={r.id} rows={messages} title="Mesaje echipă" limit={3} more={href("mesaje")} readOnly={c.messages ? null : acc.locked ? "Raport finalizat: conversația e închisă." : "Nu poți scrie în conversația acestui raport."} />}
        {tab === "general" && <section className="card">
          <h2>Date cheie</h2>
          <dl className="kv dKv">
            <Row k="Comandă">{r.ordered_at ? fmtDate(r.ordered_at) : r.received_on ? fmtDate(r.received_on) : fmtDate(r.created_at)}</Row>
            <Row k="Inspecție">{inspectedOn ? fmtDate(inspectedOn) : nextVisit ? <>programată {fmtDate(nextVisit, true)}</> : null}</Row>
            <Row k="Termen predare">{due ? <span className={late ? "errTxt" : ""}>{dueText(due)}{late ? " · depășit" : ""}</span> : <span className={d.late && !d.delivered ? "errTxt" : ""}>{d.term} zile de la comandă</span>}</Row>
            <Row k="Data raport">{r.report_date ? fmtDate(r.report_date) : <span className="muted">în așteptare</span>}</Row>
            {r.delivered_at && <Row k="Predat">{fmtDate(r.delivered_at)}{r.delivered_by_name ? ` · ${r.delivered_by_name}` : ""}</Row>}
            {fees && <Row k="Onorariu">{r.fee != null ? <span className="mono num">{lei(r.fee, "RON")}</span> : null}</Row>}
            {fees && r.collab_fee != null && <Row k="Tarif colaborator"><span className="mono num">{lei(r.collab_fee, "RON")}</span></Row>}
            {fees && <Row k="Încasat">{c.status || can(user, "reports.E") ? <CollectedToggle id={r.id} collected={!!r.collected} at={r.collected_at} /> : r.collected ? "da" : <span className="muted">nu încă</span>}</Row>}
            {!fees && myShare && <Row k="Cota ta">{myShare}</Row>}
            <Row k="Borderou">{r.statement_number ? `B-${r.statement_number}` : <span className="muted">neinclus</span>}</Row>
          </dl>
        </section>}
      </aside>}
      </div>
    </CrmShell>
  );
}
