import { niceName } from "@/lib/labels";
import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { cap, DUE_FILTERS, inspectionState, lei, listReports, PAGE_SIZE, REPORT_SORTS, REPORT_STATUS, REPORT_TABS, reportFacets, reportTabCounts, ROLE_LABEL, rowMembers, STAGE_FILTERS } from "@/lib/reports";
import { Avatar } from "@/components/Avatar";
import { fileSrc } from "@/lib/files";
import { SafeImg } from "./[id]/ReportActions";
import { STAGE_LABEL } from "@/lib/dossier";
import { ReportFilters } from "./ReportFilters";
import { CrmShell } from "@/components/CrmShell";
import { ClickRow } from "@/components/ClickRow";
import { can } from "@/lib/perms";
import { mySql } from "@/lib/perms-db";

export const metadata: Metadata = { title: "Rapoarte | CRM VALUEFY" };
export const dynamic = "force-dynamic";

type SP = { q?: string; status?: string; year?: string; bank?: string; issuer?: string; evaluator?: string; sort?: string; page?: string; etapa?: string; termen?: string; ale?: string; "fara-acces"?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { db, user, base } = await staffPage("reports");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  // Without "reports.all": only the reports of the user's team work. With it, "Ale mele" narrows the list the same way.
  const all = can(user, "reports.all");
  const mine = !all || sp.ale === "1" ? { id: user.id, sql: mySql(user) } : undefined;
  const f = { ...sp, page, mine };
  const [data, facets, counts] = await Promise.all([listReports(db, f), reportFacets(db, mine), reportTabCounts(db, f)]);
  const tab = sp.status === "draft" ? "in_progress" : sp.status ?? "";
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const link = (change: Partial<SP>) => {
    const next = { ...sp, page: undefined, ...change };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
    return `${base}/rapoarte${qs ? `?${qs}` : ""}`;
  };


  return (
    <CrmShell user={user} base={base} active="reports" title={mine ? "Rapoartele mele" : "Rapoarte"}
      subtitle={mine ? "Rapoartele la care ești în echipă (cele finalizate: ca evaluator principal sau verificator)" : "Toate rapoartele: VALUEFY și firmele partenere"}
      actions={all ? <a className={`btn btnSm ${mine ? "btnGold" : "btnGhost"}`} href={link({ ale: mine ? undefined : "1" })}>{mine ? "Toate rapoartele" : "Rapoartele mele"}</a> : undefined}>
      {sp["fara-acces"] && <div className="note">Nu ai acces la acel raport: rapoartele finalizate le văd evaluatorul principal și verificatorul.</div>}
      <section className="card">
        <ReportFilters
          base={base} total={data.total} current={{ q: sp.q, status: sp.status, year: sp.year, bank: sp.bank, issuer: sp.issuer, evaluator: sp.evaluator, sort: sp.sort }}
          years={facets.years.map((y) => [String(y.y), String(y.y), y.n])}
          banks={facets.banks.map((b) => [b.code, b.code, b.n])}
          issuers={facets.issuers.map((i) => [i.id, i.name, i.n])}
          evaluators={facets.evaluators.map((e) => [e.id, e.name, e.n])}
          sorts={Object.entries(REPORT_SORTS).map(([k, [l]]) => [k, l])}
          tab={tab} tabs={REPORT_TABS.map(([k, label]) => [k, label, counts[k] ?? 0, link({ status: k || undefined })])}
        />
        {(STAGE_FILTERS[sp.etapa ?? ""] || DUE_FILTERS[sp.termen ?? ""] || sp.status === "deschise") && (
          <div className="activeFilters">
            <span>Din tabloul de bord:</span>
            {STAGE_FILTERS[sp.etapa ?? ""] && <a className="chipX" href={link({ etapa: undefined })}>Etapa: {STAGE_LABEL[STAGE_FILTERS[sp.etapa!]]} <b aria-hidden>×</b></a>}
            {sp.status === "deschise" && <a className="chipX" href={link({ status: undefined })}>Rapoarte deschise <b aria-hidden>×</b></a>}
            {DUE_FILTERS[sp.termen ?? ""] && <a className="chipX" href={link({ termen: undefined })}>{DUE_FILTERS[sp.termen!]} <b aria-hidden>×</b></a>}
          </div>
        )}
        {data.rows.length === 0 ? (
          <div className="empty">{data.total === 0 && !sp.q ? "Nu există încă rapoarte. Proprietarul le poate aduce din Glide, din meniul Import Glide." : "Niciun raport pentru filtrele alese."}</div>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Raport</th><th>Client · utilizator</th><th>Proprietate</th><th>Echipa</th><th>Inspecție</th><th>Status raport</th><th style={{ textAlign: "right" }}>Valoare</th></tr></thead>
              <tbody>
                {data.rows.map((r) => {
                  const [label, cls] = REPORT_STATUS[r.status] ?? [r.status, ""];
                  const [type, address] = (r.asset ?? "|").split("|");
                  const [insp, inspCls, inspDate] = inspectionState(r);
                  const own = /valuefy/i.test(r.issuer_name ?? "");
                  const logo = fileSrc(r.issuer_logo);
                  const short = (r.issuer_short ?? r.issuer_name ?? "?").slice(0, 2).toUpperCase();
                  // "Raport de evaluare" → "Raport"; the notes keep their name.
                  const kind = !r.report_type || /^raport de evaluare$/i.test(r.report_type) ? "Raport" : r.report_type;
                  const team = rowMembers(r);
                  const lead = team.find((m) => m.role === "evaluator");
                  return (
                    <ClickRow key={r.id} href={`${base}/rapoarte/${r.id}`}>
                      <td>
                        <a className="repCell rowLink" href={`${base}/rapoarte/${r.id}`} title={r.issuer_name ?? undefined}>
                          {logo ? <SafeImg src={logo} className="repLogo" fallback={<i className="repLogo" aria-hidden>{short}</i>} /> : <i className="repLogo" aria-hidden>{short}</i>}
                          <span className="repText">
                            <b>{kind}{r.number ? <> <span className="ref">{r.number}</span></> : <small className="muted"> fără număr</small>}</b>
                            <small className={own ? "muted" : "warn"}>{r.issuer_name ? niceName(r.issuer_short ?? r.issuer_name) : "emitent necunoscut"}</small>
                          </span>
                        </a>
                      </td>
                      <td><a className="rowLink" href={`${base}/rapoarte/${r.id}`}>{niceName(r.client_name) || "—"}</a><div className="muted">{niceName(r.bank_name) || "fără utilizator desemnat"}</div></td>
                      <td style={{ minWidth: 170 }}>{cap(type) || "—"}<div className="muted">{address}</div></td>
                      <td>
                        {team.length === 0 ? <span className="muted">—</span> : (
                          <span className="pStack" aria-label={team.map((m) => `${m.name} (${ROLE_LABEL[m.role] ?? m.role})`).join(", ")}>
                            {team.slice(0, 5).map((m) => <Avatar key={m.id + m.role} id={m.id} name={m.name} size={26} photo={m.photo} title={`${m.name} · ${(ROLE_LABEL[m.role] ?? m.role).toLowerCase()}`} />)}
                            {team.length > 5 && <i className="pMore">+{team.length - 5}</i>}
                          </span>
                        )}
                        {lead && <div className="muted">{lead.name.split(" ").slice(0, 2).join(" ")}</div>}
                      </td>
                      <td>{inspCls ? <span className={`pill ${inspCls}`}><i />{insp}</span> : <span className="muted">{insp}</span>}{inspDate && <div className="muted">{fmtDate(inspDate, insp === "Programată")}</div>}</td>
                      <td><span className={`pill ${cls}`}><i />{label}</span>{r.status === "done" && r.report_date && <div className="muted">{fmtDate(r.report_date)}</div>}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{lei(r.result_value)}</td>
                    </ClickRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <span className="muted">Pagina {page} din {pages}</span>
            <span className="actions">
              {page > 1 && <a className="btn btnGhost btnSm" href={link({ page: String(page - 1) })}>← Înapoi</a>}
              {page < pages && <a className="btn btnGhost btnSm" href={link({ page: String(page + 1) })}>Înainte →</a>}
            </span>
          </div>
        )}
      </section>
    </CrmShell>
  );
}
