import { staffApi } from "@/lib/api";
import { scopeFilter } from "@/lib/scope";
import { validCnp } from "@/lib/id-card";

/** The client an identity card belongs to: the same CNP first, else the same name (a person). */
export async function GET(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const sp = new URL(req.url).searchParams;
  const cnp = (sp.get("cnp") ?? "").replace(/\D/g, "");
  const name = (sp.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
  if (!validCnp(cnp) && name.length < 4) return Response.json({ client: null });
  const scope = scopeFilter(a.user, "clients", "e");
  const sql = `SELECT e.id, e.kind, e.name, e.cui, e.phone, e.email, e.city, e.cnp,
      (SELECT COUNT(*) FROM reports r WHERE r.client_id = e.id) AS reports,
      CASE WHEN ?1 <> '' AND e.cnp = ?1 THEN 'cnp' ELSE 'name' END AS by
    FROM entities e WHERE e.kind = 'person' ${scope ? `AND ${scope.sql.replace(/\?/g, (() => { let n = 3; return () => `?${n++}`; })())}` : ""}
      AND ((?1 <> '' AND e.cnp = ?1) OR (length(?2) >= 4 AND lower(trim(e.name)) = lower(?2)))
    ORDER BY by = 'cnp' DESC, reports DESC LIMIT 3`;
  const binds = [validCnp(cnp) ? cnp : "", name, ...(scope?.binds ?? [])];
  const { results } = await a.db.prepare(sql).bind(...binds)
    .all<{ id: string; kind: string; name: string; cui: string | null; phone: string | null; email: string | null; city: string | null; cnp: string | null; reports: number; by: "cnp" | "name" }>();
  // a name match only counts when the CNPs do not differ
  const hit = results.find((r) => r.by === "cnp" || !r.cnp || !validCnp(cnp)) ?? null;
  return Response.json({ client: hit, more: Math.max(0, results.length - 1) });
}
