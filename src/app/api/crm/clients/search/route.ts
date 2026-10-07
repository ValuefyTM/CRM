import { staffApi } from "@/lib/api";

/** Clients matching a name, CUI, phone or email (the client picker of a new contract). */
export async function GET(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ results: [] });
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const digits = q.replace(/\D/g, "");
  const { results } = await a.db.prepare(`SELECT e.id, e.kind, e.name, e.cui, e.phone, e.email, e.city,
      (SELECT COUNT(*) FROM reports r WHERE r.client_id = e.id) AS reports,
      (SELECT MAX(k.signed_on) FROM contracts k WHERE k.client_id = e.id) AS last_contract
    FROM entities e WHERE e.kind <> 'valuation_firm' AND (e.name LIKE ?1 OR e.cui LIKE ?1 OR e.email LIKE ?1
      OR (length(?2) >= 6 AND replace(replace(replace(e.phone, ' ', ''), '.', ''), '-', '') LIKE '%' || ?2 || '%'))
    ORDER BY e.name LIKE ?3 DESC, reports DESC LIMIT 12`).bind(like, digits, `${q.replace(/[%_]/g, "")}%`)
    .all<{ id: string; kind: string; name: string; cui: string | null; phone: string | null; email: string | null; city: string | null; reports: number; last_contract: string | null }>();
  return Response.json({ results });
}
