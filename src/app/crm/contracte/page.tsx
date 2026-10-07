import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { niceName } from "@/lib/labels";
import { cap, lei, REPORT_STATUS } from "@/lib/reports";
import { CONTRACT_KINDS, CONTRACT_PAGE, CONTRACT_STATES, contractStats, listContracts, type ContractFilters as F } from "@/lib/contracts";
import { CrmShell } from "@/components/CrmShell";
import { ContractFilters } from "./ContractFilters";

export const metadata: Metadata = { title: "Contracte | CRM VALUEFY" };
export const dynamic = "force-dynamic";

type SP = Omit<F, "page"> & { page?: string };

export default async function ContractsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { db, user, base } = await staffPage();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [data, s] = await Promise.all([listContracts(db, { ...sp, page }), contractStats(db)]);
  const pages = Math.max(1, Math.ceil(data.total / CONTRACT_PAGE));
  const year = new Date().getFullYear();
  const link = (change: Partial<SP>) => {
    const next = { ...sp, page: undefined, ...change };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
    return `${base}/contracte${qs ? `?${qs}` : ""}`;
  };
  const cards: [string, string, string, string, string?][] = [
    [`Contracte clasice ${year}`, s.year.toLocaleString("ro-RO"), "var(--ink)", link({ tip: "clasic", an: String(year), stare: undefined }), `${s.month} luna aceasta`],
    [`Valoare contracte ${year}`, lei(Math.round(s.value)), "var(--acc-ink)", link({ tip: "clasic", an: String(year) }), "onorarii fără TVA"],
    ["Fără raport", s.empty.toLocaleString("ro-RO"), "var(--err)", link({ tip: "clasic", an: String(year), stare: "fara-raport" }), `din ${year}`],
    ["Contracte cadru", s.framework.toLocaleString("ro-RO"), "var(--info)", link({ tip: "cadru", an: undefined, stare: undefined }), `${s.frameworkMonth} comenzi luna aceasta`],
    ["Următorul număr", s.next, "var(--ok)", `${base}/contracte/nou`, "contract clasic"],
  ];

  return (
    <CrmShell user={user} base={base} active="contracts" title="Contracte"
      subtitle="Contracte clasice (lucrări directe, portal, site) și contracte cadru cu băncile"
      actions={<><a href={`${base}/contracte/nou?tip=cadru`} className="btn btnGhost btnSm">+ Contract cadru</a><a href={`${base}/contracte/nou`} className="btn btnGold btnSm">+ Contract nou</a></>}>
      <div className="dbKpis ibKpis">
        {cards.map(([l, n, c, h, foot]) => (
          <a key={l} className="dbKpi" href={h}>
            <span className="dbKpiLabel"><i style={{ background: c }} />{l}</span>
            <b className={l.startsWith("Valoare") ? "ctKpiMoney" : undefined}>{n}</b>
            {foot && <small className="ctKpiFoot">{foot}</small>}
          </a>
        ))}
      </div>

      <section className="card">
        <ContractFilters base={base} total={data.total} current={{ q: sp.q, tip: sp.tip, an: sp.an, stare: sp.stare }}
          kinds={CONTRACT_KINDS.filter(([k]) => k)} years={s.years.map((y) => [y.k, y.k, y.n])} states={CONTRACT_STATES.filter(([k]) => k)} />
        {data.rows.length === 0 ? <div className="empty">Niciun contract pentru filtrele alese.</div> : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Contract</th><th>Client</th><th>Obiect</th><th style={{ textAlign: "right" }}>Onorariu</th><th>Rapoarte</th><th>Ultimul raport</th></tr></thead>
              <tbody>
                {data.rows.map((k) => {
                  const href = `${base}/contracte/${k.id}`;
                  const [rl, rc] = k.report_status ? REPORT_STATUS[k.report_status] ?? [k.report_status, ""] : ["", ""];
                  return (
                    <tr key={k.id}>
                      <td>
                        <a className="ref rowLink" href={href}>{k.number ? `Nr. ${k.number}` : "fără număr"}</a>
                        <div className="muted"><span className={`ctKind ${k.kind}`}>{k.kind === "framework" ? "Cadru" : "Clasic"}</span> {fmtDate(k.signed_on)}</div>
                      </td>
                      <td>{k.client_id ? <a className="rowLink" href={`${base}/clienti/${k.client_id}`}>{niceName(k.client) || "—"}</a> : "—"}<div className="muted">{k.client_kind === "company" ? "Persoană juridică" : k.client_kind === "person" ? "Persoană fizică" : k.client_kind === "bank" ? "Bancă" : ""}</div></td>
                      <td>{k.purpose ?? "—"}<div className="muted">{[k.report_type, k.valuation_types].filter(Boolean).join(" · ")}</div></td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{k.fee ? lei(k.fee) : <span className="muted">{k.kind === "framework" ? "grilă" : "—"}</span>}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {k.reports === 0 ? <span className="pill pillWarn"><i />Fără raport</span> : (
                          <span className="ctCounts"><b>{k.reports.toLocaleString("ro-RO")}</b>{k.open > 0 && <span className="pill pillWarn"><i />{k.open} în lucru</span>}
                            {k.kind === "framework" && <span className="muted">{k.month} luna aceasta</span>}</span>
                        )}
                      </td>
                      <td>
                        {k.report_id ? <><a className="rowLink" href={`${base}/rapoarte/${k.report_id}`}>{k.report_number ? `Raport ${k.report_number}` : cap(k.report_label ?? "") || "Raport"}</a>
                          <div><span className={`pill ${rc}`}><i />{rl}</span></div></> : <span className="muted">—</span>}
                      </td>
                    </tr>
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
