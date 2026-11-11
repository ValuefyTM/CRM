import { reportAccess } from "./perms-db";

/** Whether the user may see the asset (through its report). */
export async function assetInScope(db: D1Database, user: Parameters<typeof reportAccess>[1], asset: string) {
  if (!/^[\w-]{1,80}$/.test(asset)) return false;
  const r = await db.prepare("SELECT r.id, r.status, r.delivered_at FROM assets a JOIN reports r ON r.id = a.report_id WHERE a.id = ?").bind(asset)
    .first<{ id: string; status: string; delivered_at: string | null }>();
  return !!r && (await reportAccess(db, user, r)).view;
}
