// Server-only: audit history shown on user and partner firm pages.
export const ACTION_LABEL: Record<string, string> = {
  "user.create": "Cont creat", "user.invite": "Invitație trimisă", "user.activate": "Cont activat", "user.update": "Date actualizate",
  "user.disable": "Cont dezactivat", "user.enable": "Cont reactivat", "user.accreditations": "Agreeri pe contracte cadru modificate", "user.profile": "Profil actualizat de utilizator", "user.bootstrap": "Cont de proprietar creat",
  "order.create": "Comandă trimisă", "order.delete": "Comandă ștearsă", "user.delete": "Cont șters", "order.document": "Document încărcat", "order.view": "Deschisă în CRM", "lead.status": "Status schimbat", "client.create": "Client adăugat", "client.update": "Date actualizate", "client.contact": "Persoană de contact adăugată", "client.contact_remove": "Persoană de contact ștearsă", "client.portal": "Acces în portal activat", "lead.notes": "Notițe actualizate", "offer.create": "Ofertă creată", "offer.sent": "Ofertă trimisă clientului", "offer.viewed": "Oferta deschisă de client", "offer.accepted": "Ofertă acceptată și semnată", "offer.declined": "Ofertă refuzată", "contract.create": "Contract creat", "contract.edit": "Contract modificat", "contract.fee_grid": "Grila de tarife modificată", "report.fee": "Onorariu modificat","contract.terms": "Termeni de referință modificați", "contract.sign_sent": "Contract trimis la semnat", "contract.viewed": "Contract deschis de client", "contract.signed": "Contract semnat de client", "settings.firm": "Date firmă modificate", "settings.billing": "Setări facturare modificate", "settings.billing_rule": "Regulă de facturare modificată", "settings.billing_test": "Test facturare Oblio", "invoice.issue": "Factură emisă", "invoice.outside": "Facturat direct din Oblio", "proforma.issue": "Proformă emisă", "invoice.paid": "Factură încasată", "invoice.cancel": "Document anulat", "settings.image": "Ștampilă / semnătură modificată",
  "quote.create": "Ofertă notată", "quote.update": "Ofertă modificată", "quote.sent": "Ofertă transmisă clientului", "quote.viewed": "Oferta deschisă de client", "quote.accepted": "Ofertă acceptată", "quote.declined": "Ofertă refuzată", "quote.reopen": "Ofertă redeschisă", "quote.convert": "Ofertă convertită în lucrare", "quote.delete": "Ofertă ștearsă",
  "partner.create": "Firmă creată", "partner.update": "Date firmă actualizate", "partner.suspend": "Firmă suspendată", "partner.activate": "Firmă reactivată",
  // Before the users table (migration 1001).
  "partner_user.create": "Persoană adăugată", "partner_user.invite": "Invitație trimisă", "partner_user.activate": "Cont activat",
  "partner_user.disable": "Acces dezactivat", "partner_user.enable": "Acces reactivat", "partner_user.role": "Rol schimbat", "partner_user.profile": "Profil actualizat",
  "statement.open": "Borderou deschis", "statement.validate": "Borderou validat (liniile înghețate)", "statement.issue": "Borderou emis", "statement.reopen": "Borderou redeschis", "statement.delete": "Borderou șters",
  "statement.notes": "Observații modificate", "statement.line_add": "Linie adăugată", "statement.line_remove": "Linie scoasă", "statement.line_change": "Sumă modificată", "statement.line_restore": "Linie pusă la loc", "statement.line_delete": "Linie manuală ștearsă",
  "fixed_cost.create": "Cheltuială fixă adăugată", "fixed_cost.update": "Cheltuială fixă modificată", "fixed_cost.delete": "Cheltuială fixă ștearsă", "statement_rule.create": "Regulă de borderou creată", "statement_rule.update": "Regulă de borderou modificată", "statement_rule.delete": "Regulă de borderou ștearsă",
  "order.cancel": "Comandă anulată", "order.reopen": "Comandă redeschisă", "quote.cancelled": "Ofertă anulată", "quote.reopened": "Ofertă redeschisă", "report.framing": "Încadrare modificată",
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
