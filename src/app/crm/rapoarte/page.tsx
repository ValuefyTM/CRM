import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { cap, lei, listReports, PAGE_SIZE, REPORT_STATUS, reportFacets } from "@/lib/reports";
import { CrmShell } from "@/components/CrmShell";

export const metadata: Metadata = { title: "Rapoarte | CRM VALUEFY" };
export const dynamic = "force-dynamic";

type SP = { q?: string; status?: string; year?: string; bank?: string; issuer?: string; page?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { db, user, base } = await staffPage();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [data, facets] = await Promise.all([listReports(db, { ...sp, page }), reportFacets(db)]);
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const link = (change: Partial<SP>) => {
    const next = { ...sp, page: undefined, ...change };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
    return `${base}/rapoarte${qs ? `?${qs}` : ""}`;
  };
  const chip = (key: keyof SP, value: string | undefined, label: string, n?: number) => (
    <a key={`${key}-${value ?? "all"}`} href={link({ [key]: sp[key] === value ? undefined : value })} aria-current={(sp[key] ?? undefined) === value ? "true" : undefined} className="chipLink">
      {label}{n != null && <small>{n.toLocaleString("ro-RO")}</small>}
    </a>
  );

  return (
    <CrmShell user={user} base={base} active="reports" title="Rapoarte" subtitle={`${data.total.toLocaleString("ro-RO")} rapoarte${sp.q || sp.status || sp.year || sp.bank || sp.issuer ? " pentru filtrele alese" : ""}`}>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <div className="kpi" style={{ ["--dot" as string]: "var(--info)" }}><span><i />Rapoarte</span><b>{data.total.toLocaleString("ro-RO")}</b></div>
        <a className="kpi" href={link({ status: "done" })} style={{ ["--dot" as string]: "var(--ok)" }}><span><i />Finalizate</span><b>{data.done.toLocaleString("ro-RO")}</b></a>
        <a className="kpi" href={link({ status: "in_progress" })} style={{ ["--dot" as string]: "var(--acc)" }}><span><i />În lucru / draft</span><b>{data.open.toLocaleString("ro-RO")}</b></a>
        <a className="kpi" href={link({ status: "suspended" })} style={{ ["--dot" as string]: "var(--err)" }}><span><i />Suspendate</span><b>{data.suspended.toLocaleString("ro-RO")}</b></a>
        <div className="kpi" style={{ ["--dot" as string]: "var(--acc-ink)" }}><span><i />Onorarii (finalizate)</span><b style={{ fontSize: 24 }}>{lei(Math.round(data.fees))}</b></div>
      </div>

      <section className="card">
        <form className="toolbar" action={`${base}/rapoarte`}>
          {Object.entries(sp).filter(([k, v]) => v && k !== "q" && k !== "page").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input className="search" name="q" defaultValue={sp.q} placeholder="Caută după client, nr. raport, adresă, nr. CF, telefon…" aria-label="Caută" />
          <button type="submit" className="btn btnNavy">Caută</button>
          {(sp.q || sp.status || sp.year || sp.bank || sp.issuer) && <a href={`${base}/rapoarte`} className="btn btnGhost">Resetează</a>}
        </form>
        <div className="filters" aria-label="An">{chip("year", undefined, "Toți anii")}{facets.years.map((y) => chip("year", String(y.y), String(y.y), y.n))}</div>
        <div className="filters" aria-label="Status">{chip("status", undefined, "Toate statusurile")}{Object.entries(REPORT_STATUS).map(([k, [l]]) => chip("status", k, l))}</div>
        <div className="filters" aria-label="Bancă">{chip("bank", undefined, "Toate băncile")}{facets.banks.map((b) => chip("bank", b.code, b.code, b.n))}</div>
        {facets.issuers.length > 1 && <div className="filters" aria-label="Emitent">{chip("issuer", undefined, "Toți emitenții")}{facets.issuers.map((i) => chip("issuer", i.id, i.name, i.n))}</div>}

        {data.rows.length === 0 ? (
          <div className="empty">{data.total === 0 && !sp.q ? "Nu există încă rapoarte. Proprietarul le poate aduce din Glide, din meniul Import Glide." : "Niciun raport pentru filtrele alese."}</div>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Raport</th><th>Client</th><th>Proprietate</th><th>Bancă</th><th>Evaluator</th><th style={{ textAlign: "right" }}>Valoare</th><th style={{ textAlign: "right" }}>Onorariu</th><th>Status</th></tr></thead>
              <tbody>
                {data.rows.map((r) => {
                  const [label, cls] = REPORT_STATUS[r.status] ?? [r.status, ""];
                  const [type, address] = (r.asset ?? "|").split("|");
                  return (
                    <tr key={r.id}>
                      <td><a className="ref rowLink" href={`${base}/rapoarte/${r.id}`}>{r.number ?? "—"}</a><div className="muted">{fmtDate(r.report_date)}</div></td>
                      <td><a className="rowLink" href={`${base}/rapoarte/${r.id}`}>{r.client_name ?? "—"}</a><div className="muted">{r.report_type}</div></td>
                      <td>{cap(type) || "—"}<div className="muted">{address}</div></td>
                      <td>{r.bank_code ?? "—"}</td>
                      <td>{r.evaluator ?? "—"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{lei(r.result_value)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{lei(r.fee)}</td>
                      <td><span className={`pill ${cls}`}><i />{label}</span></td>
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
