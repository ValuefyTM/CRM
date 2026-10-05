// Server-only: audit history shown on user and partner firm pages.
export const ACTION_LABEL: Record<string, string> = {
  "user.create": "Cont creat", "user.invite": "Invitație trimisă", "user.activate": "Cont activat", "user.update": "Date actualizate",
  "user.disable": "Cont dezactivat", "user.enable": "Cont reactivat", "user.profile": "Profil actualizat de utilizator", "user.bootstrap": "Cont de proprietar creat",
  "order.create": "Comandă trimisă", "order.document": "Document încărcat", "order.view": "Deschisă în CRM", "lead.status": "Status schimbat", "client.create": "Client adăugat", "client.update": "Date actualizate", "client.contact": "Persoană de contact adăugată", "client.contact_remove": "Persoană de contact ștearsă", "client.portal": "Acces în portal activat", "lead.notes": "Notițe actualizate",
  "partner.create": "Firmă creată", "partner.update": "Date firmă actualizate", "partner.suspend": "Firmă suspendată", "partner.activate": "Firmă reactivată",
  // Before the users table (migration 1001).
  "partner_user.create": "Persoană adăugată", "partner_user.invite": "Invitație trimisă", "partner_user.activate": "Cont activat",
  "partner_user.disable": "Acces dezactivat", "partner_user.enable": "Acces reactivat", "partner_user.role": "Rol schimbat", "partner_user.profile": "Profil actualizat",
  "staff.create": "Adăugat în echipă", "staff.role": "Rol schimbat", "staff.disable": "Cont dezactivat", "staff.enable": "Cont reactivat", "staff.bootstrap": "Cont de proprietar creat",
};

export type LogEntry = { at: string; action: string; details: string | null; actor: string; actor_name: string | null };

/** Latest events about the given entities (sign-ins are left out; the last one is shown on the account). */
export async function history(db: D1Database, ids: string[], limit = 30) {
  const { results } = await db
    .prepare(
      `SELECT a.at, a.action, a.details, a.actor, COALESCE(NULLIF(s.name, ''), s.email) AS actor_name
       FROM audit_log a LEFT JOIN users s ON a.actor IN ('user:' || s.id, 'staff:' || s.id)
       WHERE a.entity_id IN (${ids.map(() => "?").join(",")}) AND a.action <> 'session.create' ORDER BY a.at DESC LIMIT ${limit}`,
    )
    .bind(...ids)
    .all<LogEntry>();
  return results;
}
