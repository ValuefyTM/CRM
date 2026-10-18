// The dashboard of a team member without the firm's dashboard (Permisiuni): their reports and inspections only.
import { fmtDate } from "@/lib/guard";
import { getDb } from "@/lib/db";
import { cap, listReports } from "@/lib/reports";
import { ReportTable } from "../rapoarte/ReportTable";
import { OVER_TERM_SQL } from "@/lib/reports";
import { mySql } from "@/lib/perms-db";
import { BillingTasksCard } from "@/components/BillingTasksCard";
import { can } from "@/lib/perms";
import type { User } from "@/lib/users";

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });

/** The line under the greeting (both dashboards): reports in work, how many past the standard term, inspections left. */
export function HelloLine({ base, open, late, visits }: { base: string; open: number; late: number; visits: number }) {
  return (
    <p className="dbHelloLine">
      Ai <a href={`${base}/rapoarte?status=deschise`}><b>{open}</b> {open === 1 ? "raport" : "rapoarte"} în lucru</a>
      {late > 0
        ? <>, dintre care <a href={`${base}/rapoarte?termen=peste`} className="hot"><b>{late}</b> peste termen</a></>
        : open > 0 ? ", toate în termen" : ""}
      {visits > 0
        ? <>, și <a href={`${base}/agenda-inspectii`}><b>{visits}</b> {visits === 1 ? "inspecție" : "inspecții"} de făcut</a>.</>
        : ". Nicio inspecție de făcut."}
    </p>
  );
}

export async function MyHome({ user, base, denied }: { user: User; base: string; denied: boolean }) {
  // The database comes from getDb, not as a prop: a binding cannot be passed between components.
  const db = (await getDb())!;
  const t = today();
  const [open, counts, visits, left] = await Promise.all([
    listReports(db, { status: "deschise", mine: { id: user.id, sql: mySql(user) } }),
    db.prepare(`SELECT SUM(r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL) AS open,
        SUM(r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL AND ${OVER_TERM_SQL}) AS late,
        SUM(r.status = 'done' AND substr(COALESCE(r.report_date, r.delivered_at), 1, 7) = substr(?, 1, 7)) AS done_month
      FROM reports r WHERE ${mySql(user)}`).bind(t, t, user.id).first<{ open: number | null; late: number | null; done_month: number | null }>(),
    // `can_open`: the report of the inspection is one of the user's (a report they only inspect for: no link to it)
    db.prepare(`SELECT i.id, i.status, i.scheduled_at, i.report_id, r.number, p.type, COALESCE(NULLIF(i.address, ''), p.full_address, p.city) AS address,
        ${can(user, "reports.all") ? "1" : `(r.id IS NOT NULL AND ${mySql(user)})`} AS can_open
      FROM inspections i JOIN assets a ON a.id = i.asset_id JOIN crm_properties p ON p.id = a.property_id LEFT JOIN reports r ON r.id = i.report_id
      WHERE i.inspector_id = ? AND i.status IN ('to_schedule', 'scheduled') AND (r.id IS NULL OR (r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL))
      ORDER BY i.scheduled_at IS NULL, i.scheduled_at LIMIT 8`).bind(...(can(user, "reports.all") ? [] : [user.id]), user.id)
      .all<{ id: string; status: string; scheduled_at: string | null; report_id: string | null; number: string | null; type: string | null; address: string | null; can_open: number }>(),
    // All the inspections still to do (the list above shows the next 8).
    db.prepare(`SELECT COUNT(*) AS n FROM inspections i LEFT JOIN reports r ON r.id = i.report_id
      WHERE i.inspector_id = ? AND i.status IN ('to_schedule', 'scheduled') AND (r.id IS NULL OR (r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL))`)
      .bind(user.id).first<{ n: number }>().then((x) => x?.n ?? 0),
  ]);
  const first = user.name ? user.name.split(" ")[0] : "";
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Bucharest" }));
  const hello = hour < 11 ? "Bună dimineața" : hour < 18 ? "Bună ziua" : "Bună seara";
  const late = counts?.late ?? 0;
  const quick: [string, string, string?][] = [
    // Accredited on framework contracts (agreeri), or with the Comenzi module: a new order from here.
    ...(can(user, "orders.A") ? [["Adaugă comandă", `${base}/comenzi/noua`, can(user, "orders.all") ? "bancă sau colaborare" : "pe contractele tale cadru"] as [string, string, string]] : []),
    ["Rapoartele mele", `${base}/rapoarte`, `${counts?.open ?? 0} în lucru`],
    ["Inspecțiile mele", `${base}/agenda-inspectii`, left ? `${left} active` : undefined],
    ...(can(user, "properties") ? [["Comparabile", `${base}/proprietati`, "proprietăți evaluate"] as [string, string, string]] : []),
    ...(can(user, "tenders") ? [["Licitații SEAP", `${base}/licitatii`] as [string, string]] : []),
  ];
  return (
    <>
      {denied && <div className="note">Nu ai acces la pagina aceea. Ce vezi în CRM stabilește administratorul, în Setări → Permisiuni.</div>}
      <section className="dbHello">
        <div className="dbHelloText">
          <h2>{hello}{first ? `, ${first}` : ""}.</h2>
          <HelloLine base={base} open={counts?.open ?? 0} late={late} visits={left} />
        </div>
        <nav className="dbQuick" aria-label="Acțiuni rapide">
          {quick.map(([label, href, sub]) => <a key={label} href={href}><span><b>{label}</b>{sub && <small>{sub}</small>}</span></a>)}
        </nav>
      </section>
      <div className="dbKpis">
        <a className="dbKpi" href={`${base}/rapoarte?status=deschise`}><span className="dbKpiLabel"><i style={{ background: "var(--acc)" }} />Rapoarte în lucru</span><b>{counts?.open ?? 0}</b></a>
        <a className="dbKpi" href={`${base}/rapoarte?termen=peste`}><span className="dbKpiLabel"><i style={{ background: "var(--err)" }} />Peste termen</span><b style={late ? { color: "var(--err)" } : undefined}>{late}</b></a>
        <a className="dbKpi" href={`${base}/rapoarte?status=done`}><span className="dbKpiLabel"><i style={{ background: "var(--ok)" }} />Finalizate luna aceasta</span><b>{counts?.done_month ?? 0}</b></a>
        <a className="dbKpi" href={`${base}/agenda-inspectii`}><span className="dbKpiLabel"><i style={{ background: "var(--ink)" }} />Inspecții de făcut</span><b>{left}</b></a>
      </div>
      {/* "Emite factura" without the Facturare module: the reports to invoice, right here. */}
      {can(user, "billing:issue") && !can(user, "billing") && <BillingTasksCard user={user} base={base} />}
      <div className="cols myCols">
        <section className="card repCard">
          <div className="cardHead repCardHead"><h2>Rapoartele mele în lucru</h2><a className="link" href={`${base}/rapoarte`}>Toate →</a></div>
          {open.rows.length === 0 ? <p className="hint pad">Niciun raport deschis.</p> : <ReportTable rows={open.rows.slice(0, 12)} base={base} today={t} scope={false} />}
        </section>
        <section className="card myVisits">
          <div className="cardHead"><h2>Inspecțiile mele</h2><a className="link" href={`${base}/agenda-inspectii`}>Agenda →</a></div>
          {visits.results.length === 0 ? <p className="hint">Nicio inspecție de făcut.</p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {visits.results.map((v) => (
                <li key={v.id} className="myVisit">
                  <b>{v.scheduled_at ? fmtDate(v.scheduled_at, true) : "De programat"}</b>
                  <span>{cap(v.type) || "Proprietate"}{v.report_id && (v.can_open ? <> · <a className="link" href={`${base}/rapoarte/${v.report_id}?tab=inspectii`}>{v.number ? `raport ${v.number}` : "raport"}</a></> : v.number ? <> · raport {v.number}</> : null)}</span>
                  <small className="muted">{v.address}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
