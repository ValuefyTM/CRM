// Server-only: the numbers of the reports. VALUEFY's reports have one running series, given automatically when the
// report opens (the last number + 1, never reset); reports issued on a collaborating firm carry that firm's number,
// typed with the order and corrected on the report.

/** VALUEFY among the valuation firms (the issuer of its own reports). */
export async function ownIssuerId(db: D1Database) {
  return (await db.prepare("SELECT id FROM entities WHERE kind = 'valuation_firm' AND upper(name) LIKE 'VALUEFY%' LIMIT 1").first<{ id: string }>())?.id ?? null;
}

/** Whether a report is VALUEFY's own (numbered automatically): its issuer, or no issuer at all. */
export const isOwnIssuer = (issuerName: string | null | undefined) => !issuerName || /valuefy/i.test(issuerName);

/**
 * SQL for the next number of VALUEFY's series, bound to its issuer id. Used inside the INSERT / UPDATE itself, so two
 * reports opened at the same moment do not get the same number.
 */
export const NEXT_OWN_NUMBER = `(SELECT CAST(COALESCE(MAX(CAST(x.number AS INTEGER)), 0) + 1 AS TEXT) FROM reports x
  WHERE x.issuer_id = ? AND x.number GLOB '[0-9]*')`;

/** The next VALUEFY number (shown before delivery; the number itself is given by the database). */
export async function nextOwnNumber(db: D1Database) {
  const id = await ownIssuerId(db);
  if (!id) return "";
  return (await db.prepare(`SELECT ${NEXT_OWN_NUMBER} AS n`).bind(id).first<{ n: string }>())?.n ?? "";
}

/** Gives a VALUEFY report without a number the next one of the series (nothing when it has one, or another issuer). */
export async function numberOwnReport(db: D1Database, reportId: string) {
  const id = await ownIssuerId(db);
  if (!id) return null;
  await db.prepare(`UPDATE reports SET number = ${NEXT_OWN_NUMBER} WHERE id = ? AND (number IS NULL OR number = '') AND (issuer_id = ? OR issuer_id IS NULL)`)
    .bind(id, reportId, id).run();
  await db.prepare("UPDATE reports SET issuer_id = ? WHERE id = ? AND issuer_id IS NULL").bind(id, reportId).run();
  return (await db.prepare("SELECT number FROM reports WHERE id = ?").bind(reportId).first<{ number: string | null }>())?.number ?? null;
}

/** A collaborating firm's report number: free text, unique within that firm's reports. */
export async function checkFirmNumber(db: D1Database, reportId: string, issuerId: string | null, number: string) {
  if (!number) return null;
  const dup = await db.prepare("SELECT id FROM reports WHERE number = ? AND issuer_id IS ? AND id <> ? AND status <> 'cancelled' LIMIT 1").bind(number, issuerId, reportId).first();
  return dup ? `Există deja un raport cu nr. ${number} emis pe aceeași firmă.` : null;
}
