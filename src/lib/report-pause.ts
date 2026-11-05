// Server-only: a suspended report is on pause. Its time stops (the days counter and the term leave out the working
// days it stayed suspended), its team hears of it on their phones (push) when it is suspended — with the reason — and
// when it is resumed.
import { now } from "./db";
import { addWorkdays, dueOf } from "./dossier";
import { workdaysBetween } from "./report-stage";
import { pushToUser } from "./push";
import { appUrl } from "./site";

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });

/** The pause after a change of status: begins at a suspension, ends (counted) when it leaves it. Returns the days ended. */
export async function setPause(db: D1Database, id: string, from: string, to: string) {
  if (to === "suspended" && from !== "suspended") {
    await db.prepare("UPDATE reports SET suspended_at = ? WHERE id = ?").bind(now(), id).run();
    return 0;
  }
  if (from !== "suspended" || to === "suspended") return 0;
  const r = await db.prepare(`SELECT suspended_at, due_on, term_days, (SELECT MIN(substr(i.done_at, 1, 10)) FROM inspections i WHERE i.report_id = reports.id AND i.status = 'done') AS inspected
      FROM reports WHERE id = ?`).bind(id).first<{ suspended_at: string | null; due_on: string | null; term_days: number | null; inspected: string | null }>();
  const days = r?.suspended_at ? workdaysBetween(r.suspended_at, today()) : 0;
  // the delivery deadline moves by the pause (the alerts of late reports go by it)
  const due = r ? dueOf(r, r.inspected) : null;
  await db.prepare("UPDATE reports SET suspended_at = NULL, paused_days = COALESCE(paused_days, 0) + ?, due_on = ? WHERE id = ?")
    .bind(days, due && days > 0 ? addWorkdays(due, days) : r?.due_on ?? null, id).run();
  return days;
}

/** Push to the report's team (not who did it): suspended, with the reason, or resumed. */
export async function pushTeam(db: D1Database, id: string, actor: { id: string; name: string; email: string }, reason: string | null, link?: string, info?: string) {
  const r = await db.prepare("SELECT number, label FROM reports WHERE id = ?").bind(id).first<{ number: string | null; label: string | null }>();
  const { results } = await db.prepare("SELECT DISTINCT m.user_id FROM report_members m JOIN users u ON u.id = m.user_id WHERE m.report_id = ? AND u.status = 'active' AND m.user_id <> ?")
    .bind(id, actor.id).all<{ user_id: string }>();
  if (!results.length) return 0;
  const name = r?.number ? `Raportul nr. ${r.number}` : r?.label ? `Raportul ${r.label}` : "Raportul";
  const who = actor.name || actor.email;
  const href = link ?? await appUrl("crm", `/rapoarte/${id}`).catch(() => `${process.env.CRM_URL || "https://crm.valuefy.ro"}/rapoarte/${id}`);
  let n = 0;
  for (const m of results)
    n += await pushToUser(db, m.user_id, "crm", info
      ? { id: `info-${id}-${Date.now()}`, title: `${name}: informații primite`, body: info.slice(0, 160), href }
      : reason !== null
      ? { id: `susp-${id}-${Date.now()}`, title: `⏸ ${name} a fost suspendat`, body: `${who}: ${reason.slice(0, 160)}`, href }
      : { id: `resume-${id}-${Date.now()}`, title: `▶ ${name} a fost reluat`, body: `${who} l-a repus în lucru; timpul curge din nou.`, href }).catch(() => 0);
  return n;
}
