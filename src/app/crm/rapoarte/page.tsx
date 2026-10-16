import { niceName } from "@/lib/labels";
import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { cap, DUE_FILTERS, listReports, PAGE_SIZE, REPORT_SORTS, REPORT_STATUS, REPORT_TABS, reportFacets, reportTabCounts, ROLE_LABEL, rowMembers, STAGE_FILTERS } from "@/lib/reports";
import { Avatar } from "@/components/Avatar";
import { fileSrc } from "@/lib/files";
import { SafeImg } from "./[id]/ReportActions";
import { issuerColor } from "@/lib/issuer-color";
import { daysOf, SEGMENTS, segmentsOf } from "@/lib/report-stage";
import { StageHelp } from "./StageHelp";

const SEG_LABEL = { done: "făcut", now: "în lucru", late: "întârziat", todo: "urmează" } as const;
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
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
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
            <table className="table repTable">
              <thead><tr>
                <th>Raport</th><th>Client · utilizator</th><th>Proprietate</th><th>Scop · tip valoare</th><th>Echipa</th>
                <th className="stageTh" data-label="Etapă">Etapă <StageHelp /></th>
                <th>Status</th><th style={{ textAlign: "right" }}>Zile</th>
              </tr></thead>
              <tbody>
                {data.rows.map((r) => {
                  const [label, cls] = REPORT_STATUS[r.status] ?? [r.status, ""];
                  const [type, address] = (r.asset ?? "|").split("|");
                  const own = /valuefy/i.test(r.issuer_name ?? "");
                  const logo = fileSrc(r.issuer_logo);
                  const short = (r.issuer_short ?? r.issuer_name ?? "?").slice(0, 2).toUpperCase();
                  const kind = !r.report_type || /^raport de evaluare$/i.test(r.report_type) ? "Raport" : r.report_type;
                  const team = rowMembers(r);
                  const { seg, caption } = segmentsOf(r, today);
                  const d = daysOf(r, today);
                  return (
                    <ClickRow key={r.id} href={`${base}/rapoarte/${r.id}`}>
                      <td style={{ borderLeft: `4px solid ${issuerColor(r.issuer_name, r.issuer_color)}` }}>
                        <a className="repCell rowLink" href={`${base}/rapoarte/${r.id}`} title={r.issuer_name ?? undefined}>
                          {logo ? <SafeImg src={logo} className="repLogo" fallback={<i className="repLogo" aria-hidden>{short}</i>} /> : <i className={`repLogo${own ? " own" : ""}`} aria-hidden>{short}</i>}
                          <span className="repText">
                            <small className={`repKind${kind === "Raport" ? "" : " note"}`}>{kind}</small>
                            {r.number ? <b className="mono">{r.number}</b> : <b className="muted">fără număr</b>}
                          </span>
                        </a>
                      </td>
                      <td><div className="two"><b>{niceName(r.client_name) || "—"}</b><small>{niceName(r.bank_name) || "fără utilizator desemnat"}</small></div></td>
                      <td style={{ minWidth: 160 }}><div className="two"><b>{cap(type) || "—"}</b><small>{address}</small></div></td>
                      <td><div className="two"><b>{r.purpose || "—"}</b><small>{r.value_type || ""}</small></div></td>
                      <td>
                        {team.length === 0 ? <span className="muted">—</span> : (
                          <span className="pStack" aria-label={team.map((m) => `${m.name} (${ROLE_LABEL[m.role] ?? m.role})`).join(", ")}>
                            {team.slice(0, 5).map((m) => <Avatar key={m.id + m.role} id={m.id} name={m.name} size={26} photo={m.photo} title={`${m.name} · ${(ROLE_LABEL[m.role] ?? m.role).toLowerCase()}`} />)}
                            {team.length > 5 && <i className="pMore">+{team.length - 5}</i>}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="two">
                          <span className="steps" aria-label={seg.map((x, k) => `${SEGMENTS[k]}: ${SEG_LABEL[x]}`).join(", ")}>{seg.map((x, k) => <i key={k} className={x} />)}</span>
                          <small>{caption}</small>
                        </div>
                      </td>
                      <td><span className={`pill ${cls}`}><i />{label}</span></td>
                      <td style={{ textAlign: "right" }}>
                        <span className={`days${d.delivered ? " done" : d.late ? " late" : ""}`}>
                          <b>{d.days}</b>
                          <small>{d.delivered ? (d.late ? `predat cu +${d.over} ${d.over === 1 ? "zi" : "zile"}` : "predat în termen") : `din ${d.term} zile${d.late ? ` · +${d.over}` : ""}`}</small>
                        </span>
                      </td>
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
