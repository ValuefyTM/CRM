// Server-only: the phone checks of comparables (market listings), kept per report.
export type Verification = { done: boolean; day: string | null; person: string | null; outcome: "confirmate" | "suplimentare" | "diferite" | "tranzactionat"; note: string | null; updated_at?: string };
export const OUTCOMES = ["confirmate", "suplimentare", "diferite", "tranzactionat"] as const;

export async function verificationsOf(db: D1Database, reportId: string) {
  const { results } = await db.prepare("SELECT listing_id, done, day, person, outcome, note, updated_at FROM market_verifications WHERE report_id = ?").bind(reportId)
    .all<{ listing_id: string; done: number; day: string | null; person: string | null; outcome: Verification["outcome"]; note: string | null; updated_at: string }>();
  return Object.fromEntries(results.map((r) => [r.listing_id, { done: !!r.done, day: r.day, person: r.person, outcome: r.outcome, note: r.note, updated_at: r.updated_at }])) as Record<string, Verification>;
}

export async function saveVerification(db: D1Database, reportId: string, listingId: string, v: Partial<Verification>, userId: string) {
  const outcome = OUTCOMES.includes(v.outcome as Verification["outcome"]) ? v.outcome : "confirmate";
  const day = typeof v.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.day) ? v.day : null;
  await db.prepare(`INSERT INTO market_verifications (report_id, listing_id, done, day, person, outcome, note, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(report_id, listing_id) DO UPDATE SET done = excluded.done, day = excluded.day, person = excluded.person, outcome = excluded.outcome, note = excluded.note,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .bind(reportId, listingId, v.done ? 1 : 0, day, (v.person ?? "").toString().slice(0, 200) || null, outcome, (v.note ?? "").toString().slice(0, 4000) || null, userId, new Date().toISOString()).run();
}
