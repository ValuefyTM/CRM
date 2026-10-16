// The dashboard of a team member without the firm's dashboard (Permisiuni): their reports and inspections only.
import { fmtDate } from "@/lib/guard";
import { getDb } from "@/lib/db";
import { cap, listReports } from "@/lib/reports";
import { ReportTable } from "../rapoarte/ReportTable";
import { DUE_SQL } from "@/lib/reports";
import { mySql } from "@/lib/perms-db";
import { can } from "@/lib/perms";
import type { User } from "@/lib/users";

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });

export async function MyHome({ user, base, denied }: { user: User; base: string; denied: boolean }) {
  // The database comes from getDb, not as a prop: a binding cannot be passed between components.
  const db = (await getDb())!;
  const t = today();
  const [open, counts, visits] = await Promise.all([
    listReports(db, { status: "deschise", mine: { id: user.id, sql: mySql(user) } }),
    db.prepare(`SELECT SUM(r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL) AS open,
        SUM(r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL AND (${DUE_SQL}) < ?) AS late,
        SUM(r.status = 'done' AND substr(COALESCE(r.report_date, r.delivered_at), 1, 7) = substr(?, 1, 7)) AS done_month
      FROM reports r WHERE ${mySql(user)}`).bind(t, t, user.id).first<{ open: number | null; late: number | null; done_month: number | null }>(),
    db.prepare(`SELECT i.id, i.status, i.scheduled_at, i.report_id, r.number, p.type, COALESCE(NULLIF(i.address, ''), p.full_address, p.city) AS address
      FROM inspections i JOIN assets a ON a.id = i.asset_id JOIN crm_properties p ON p.id = a.property_id LEFT JOIN reports r ON r.id = i.report_id
      WHERE i.inspector_id = ? AND i.status IN ('to_schedule', 'scheduled') AND (r.id IS NULL OR (r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL))
      ORDER BY i.scheduled_at IS NULL, i.scheduled_at LIMIT 8`).bind(user.id)
      .all<{ id: string; status: string; scheduled_at: string | null; report_id: string | null; number: string | null; type: string | null; address: string | null }>(),
  ]);
  const first = user.name ? user.name.split(" ")[0] : "";
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Bucharest" }));
  const hello = hour < 11 ? "Bună dimineața" : hour < 18 ? "Bună ziua" : "Bună seara";
  const late = counts?.late ?? 0;
  const todayVisits = visits.results.filter((v) => v.scheduled_at?.slice(0, 10) === t).length;
  const quick: [string, string, string?][] = [
    ["Rapoartele mele", `${base}/rapoarte`, `${counts?.open ?? 0} deschise`],
    ["Inspecțiile mele", `${base}/agenda-inspectii`, visits.results.length ? `${visits.results.length} active` : undefined],
    ...(can(user, "properties") ? [["Comparabile", `${base}/proprietati`, "proprietăți evaluate"] as [string, string, string]] : []),
    ...(can(user, "tenders") ? [["Licitații SEAP", `${base}/licitatii`] as [string, string]] : []),
  ];
  return (
    <>
      {denied && <div className="note">Nu ai acces la pagina aceea. Ce vezi în CRM stabilește administratorul, în Setări → Permisiuni.</div>}
      <section className="dbHello">
        <div className="dbHelloText">
          <span className="eyebrow">{new Date().toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Bucharest" })}</span>
          <h2>{hello}{first ? `, ${first}` : ""}.</h2>
          <p>
            Ai <a href={`${base}/rapoarte?status=deschise`}><b>{counts?.open ?? 0}</b> rapoarte deschise</a>
            {late > 0 ? <>, dintre care <a href={`${base}/rapoarte?termen=depasit`} className="hot"><b>{late}</b> cu termenul depășit</a></> : ", toate în termen"}
            {todayVisits > 0 ? <>, și <b>{todayVisits}</b> {todayVisits === 1 ? "inspecție programată" : "inspecții programate"} azi.</> : "."}
          </p>
        </div>
        <nav className="dbQuick" aria-label="Acțiuni rapide">
          {quick.map(([label, href, sub]) => <a key={label} href={href}><span><b>{label}</b>{sub && <small>{sub}</small>}</span></a>)}
        </nav>
      </section>
      <div className="dbKpis">
        <a className="dbKpi" href={`${base}/rapoarte?status=deschise`}><span className="dbKpiLabel"><i style={{ background: "var(--acc)" }} />Rapoarte deschise</span><b>{counts?.open ?? 0}</b></a>
        <a className="dbKpi" href={`${base}/rapoarte?termen=depasit`}><span className="dbKpiLabel"><i style={{ background: "var(--err)" }} />Termen depășit</span><b style={late ? { color: "var(--err)" } : undefined}>{late}</b></a>
        <a className="dbKpi" href={`${base}/rapoarte?status=done`}><span className="dbKpiLabel"><i style={{ background: "var(--ok)" }} />Finalizate luna aceasta</span><b>{counts?.done_month ?? 0}</b></a>
        <a className="dbKpi" href={`${base}/agenda-inspectii`}><span className="dbKpiLabel"><i style={{ background: "var(--ink)" }} />Inspecții de făcut</span><b>{visits.results.length}</b></a>
      </div>
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
                  <span>{cap(v.type) || "Proprietate"}{v.report_id && <> · <a className="link" href={`${base}/rapoarte/${v.report_id}?tab=inspectii`}>{v.number ? `raport ${v.number}` : "raport"}</a></>}</span>
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
