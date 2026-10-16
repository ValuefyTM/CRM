// Server-only: the bell in the CRM's top bar. No table of its own: the notifications come from what is already
// recorded (team messages, the report journal, inspection tasks, orders), for the last 30 days, without the user's
// own actions. What came after the user last opened the bell is new.
import { can, type WithPerms } from "./perms";
import { orderCode } from "./order-labels";

export type Notice = { id: string; at: string; kind: "message" | "team" | "review" | "verified" | "back" | "inspection" | "order"; title: string; sub: string; href: string };

const DAYS = 30;
const num = (n: string | null) => (n ? `nr. ${n}` : "fără număr");

export async function notificationsFor(db: D1Database, u: WithPerms & { id: string; name: string; email: string }, base: string) {
  const since = new Date(Date.now() - DAYS * 86400000).toISOString();
  const me = await db.prepare("SELECT notif_seen_at FROM users WHERE id = ?").bind(u.id).first<{ notif_seen_at: string | null }>().catch(() => null);
  const seen = me?.notif_seen_at ?? null;
  const rep = (id: string) => `${base}/rapoarte/${id}`;

  const [msgs, log, insp, orders] = await Promise.all([
    // Messages from the others on the reports the user is in the team of.
    db.prepare(`SELECT m.id, m.created_at AS at, r.id AS rid, r.number, COALESCE(NULLIF(au.name, ''), m.author_name, m.author_email, 'Cineva') AS who, substr(m.body, 1, 110) AS body
      FROM messages m JOIN reports r ON r.id = m.entity_id AND m.entity = 'report' LEFT JOIN users au ON au.id = m.author_id
      WHERE m.created_at > ?2 AND (m.author_id IS NULL OR m.author_id <> ?1) AND EXISTS (SELECT 1 FROM report_members rm WHERE rm.report_id = r.id AND rm.user_id = ?1)
      ORDER BY m.created_at DESC LIMIT 20`).bind(u.id, since)
      .all<{ id: string; at: string; rid: string; number: string | null; who: string; body: string }>().then((x) => x.results).catch(() => []),
    // The report journal: put in a team, sent to review (to the verifier), verified or sent back (to the main evaluator).
    db.prepare(`SELECT a.id, a.at, a.action, a.details, r.id AS rid, r.number,
        (SELECT COALESCE(NULLIF(x.name, ''), x.email) FROM users x WHERE a.actor IN ('user:' || x.id, 'staff:' || x.id)) AS who
      FROM audit_log a JOIN reports r ON r.id = a.entity_id
      WHERE a.entity = 'report' AND a.at > ?2 AND a.actor NOT IN ('user:' || ?1, 'staff:' || ?1) AND (
        (a.action = 'report.member' AND a.details LIKE ?3)
        OR (a.action IN ('report.review_back', 'report.verified') AND EXISTS (SELECT 1 FROM report_members rm WHERE rm.report_id = r.id AND rm.user_id = ?1 AND rm.role = 'evaluator'))
        OR (a.action = 'report.stage' AND a.details = 'Verificare' AND EXISTS (SELECT 1 FROM report_members rm WHERE rm.report_id = r.id AND rm.user_id = ?1 AND rm.role = 'verifier')))
      ORDER BY a.at DESC LIMIT 20`).bind(u.id, since, `${(u.name || u.email).replace(/[%_]/g, "")} (%`)
      .all<{ id: number; at: string; action: string; details: string | null; rid: string; number: string | null; who: string | null }>().then((x) => x.results).catch(() => []),
    // Inspections given to the user by someone else.
    db.prepare(`SELECT i.id, i.assigned_at AS at, i.report_id AS rid, r.number, COALESCE(NULLIF(i.address, ''), a.full_address, a.city) AS place,
        (SELECT COALESCE(NULLIF(x.name, ''), x.email) FROM users x WHERE x.id = i.assigned_by) AS who
      FROM inspections i LEFT JOIN reports r ON r.id = i.report_id LEFT JOIN assets a ON a.id = i.asset_id
      WHERE i.inspector_id = ?1 AND i.assigned_at > ?2 AND (i.assigned_by IS NULL OR i.assigned_by <> ?1) AND i.status <> 'cancelled'
      ORDER BY i.assigned_at DESC LIMIT 10`).bind(u.id, since)
      .all<{ id: string; at: string; rid: string | null; number: string | null; place: string | null; who: string | null }>().then((x) => x.results).catch(() => []),
    // New orders nobody opened yet (for those who process orders).
    can(u, "orders")
      ? db.prepare(`SELECT o.id, o.created_at AS at, o.seq, o.bank_ref, o.source, o.bank, o.client_name AS client
          FROM orders o WHERE o.viewed_at IS NULL AND o.created_at > ?1 ORDER BY o.created_at DESC LIMIT 10`).bind(since)
          .all<{ id: string; at: string; seq: number | null; bank_ref: string | null; source: string | null; bank: string | null; client: string | null }>().then((x) => x.results).catch(() => [])
      : Promise.resolve([]),
  ]);

  const items: Notice[] = [
    ...msgs.map((m): Notice => ({ id: `m${m.id}`, at: m.at, kind: "message", title: `${m.who} · raport ${num(m.number)}`, sub: m.body, href: rep(m.rid) })),
    ...log.map((l): Notice => {
      const who = l.who ?? "Cineva";
      if (l.action === "report.member") {
        const role = l.details?.match(/\(([^)]+)\)\s*$/)?.[1] ?? "membru";
        return { id: `a${l.id}`, at: l.at, kind: "team", title: `Ai fost pus ${role} în raportul ${num(l.number)}`, sub: `de ${who}`, href: rep(l.rid) };
      }
      if (l.action === "report.review_back") return { id: `a${l.id}`, at: l.at, kind: "back", title: `Raportul ${num(l.number)} s-a întors de la verificare`, sub: l.details ? `${who}: ${l.details.slice(0, 110)}` : `de la ${who}`, href: rep(l.rid) };
      if (l.action === "report.verified") return { id: `a${l.id}`, at: l.at, kind: "verified", title: `Raportul ${num(l.number)} a fost verificat`, sub: `de ${who}`, href: rep(l.rid) };
      return { id: `a${l.id}`, at: l.at, kind: "review", title: `Raportul ${num(l.number)} așteaptă verificarea ta`, sub: `trimis de ${who}`, href: rep(l.rid) };
    }),
    ...insp.map((i): Notice => ({
      id: `i${i.id}`, at: i.at, kind: "inspection", title: `Inspecție nouă${i.number ? ` · raport ${num(i.number)}` : ""}`,
      sub: [i.place, i.who && `de la ${i.who}`].filter(Boolean).join(" · "), href: i.rid ? `${rep(i.rid)}?tab=inspectii` : `${base}/agenda-inspectii`,
    })),
    ...orders.map((o): Notice => ({
      id: `o${o.id}`, at: o.at, kind: "order", title: `Comandă nouă ${orderCode({ id: o.id, seq: o.seq, bank_ref: o.bank_ref, bank: o.bank, source: o.source ?? undefined })}`,
      sub: [o.client, o.bank].filter(Boolean).join(" · ") || "neprocesată", href: `${base}/comenzi/${o.id}`,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 30);

  return { items, seen, unread: items.filter((n) => !seen || n.at > seen).length };
}

export async function markSeen(db: D1Database, userId: string) {
  await db.prepare("UPDATE users SET notif_seen_at = ? WHERE id = ?").bind(new Date().toISOString(), userId).run();
}
