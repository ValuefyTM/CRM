// The dashboard of a team member without the firm's dashboard (Permisiuni): their reports and inspections only.
import { fmtDate } from "@/lib/guard";
import { cap, inspectionState, lei, listReports, REPORT_STATUS } from "@/lib/reports";
import { DUE_SQL } from "@/lib/reports";
import { MY_REPORTS_SQL } from "@/lib/perms-db";
import { can } from "@/lib/perms";
import { niceName } from "@/lib/labels";
import type { User } from "@/lib/users";
import { ClickRow } from "@/components/ClickRow";

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });

export async function MyHome({ db, user, base, denied }: { db: D1Database; user: User; base: string; denied: boolean }) {
  const t = today();
  const [open, counts, visits] = await Promise.all([
    listReports(db, { status: "deschise", mine: user.id }),
    db.prepare(`SELECT SUM(r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL) AS open,
        SUM(r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL AND (${DUE_SQL}) < ?) AS late,
        SUM(r.status = 'done' AND substr(COALESCE(r.report_date, r.delivered_at), 1, 7) = substr(?, 1, 7)) AS done_month
      FROM reports r WHERE ${MY_REPORTS_SQL}`).bind(t, t, user.id).first<{ open: number | null; late: number | null; done_month: number | null }>(),
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
          <span className="eyebrow">Tabloul meu</span>
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
      <div className="cols">
        <section className="card">
          <div className="cardHead"><h2>Rapoartele mele în lucru</h2><a className="link" href={`${base}/rapoarte`}>Toate →</a></div>
          {open.rows.length === 0 ? <p className="hint">Niciun raport deschis.</p> : (
            <div className="tableWrap">
              <table className="table">
                <thead><tr><th>Raport</th><th>Client</th><th>Proprietate</th><th>Inspecție</th><th>Status</th><th style={{ textAlign: "right" }}>Valoare</th></tr></thead>
                <tbody>
                  {open.rows.slice(0, 12).map((r) => {
                    const [label, cls] = REPORT_STATUS[r.status] ?? [r.status, ""];
                    const [type, address] = (r.asset ?? "|").split("|");
                    const [insp, inspCls] = inspectionState(r);
                    return (
                      <ClickRow key={r.id} href={`${base}/rapoarte/${r.id}`}>
                        <td><a className="ref rowLink" href={`${base}/rapoarte/${r.id}`}>{r.number ?? "fără număr"}</a><div className="muted">{fmtDate(r.report_date)}</div></td>
                        <td>{niceName(r.client_name) || "—"}<div className="muted">{r.bank_code ?? ""}</div></td>
                        <td>{cap(type) || "—"}<div className="muted">{address}</div></td>
                        <td>{inspCls ? <span className={`pill ${inspCls}`}><i />{insp}</span> : <span className="muted">{insp}</span>}</td>
                        <td><span className={`pill ${cls}`}><i />{label}</span></td>
                        <td style={{ textAlign: "right" }}>{lei(r.result_value)}</td>
                      </ClickRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card">
          <div className="cardHead"><h2>Inspecțiile mele</h2><a className="link" href={`${base}/agenda-inspectii`}>Agenda →</a></div>
          {visits.results.length === 0 ? <p className="hint">Nicio inspecție de făcut.</p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {visits.results.map((v) => (
                <li key={v.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                  <b>{v.scheduled_at ? fmtDate(v.scheduled_at, true) : "De programat"}</b> · {cap(v.type) || "Proprietate"}
                  <div className="muted">{v.address}{v.report_id && <> · <a className="link" href={`${base}/rapoarte/${v.report_id}?tab=inspectii`}>raport {v.number ?? ""}</a></>}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
