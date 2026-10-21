import { staffApi } from "@/lib/api";
import { scopeFilter } from "@/lib/scope";
import { validCnp } from "@/lib/id-card";

type Row = { id: string; kind: string; name: string; cui: string | null; phone: string | null; email: string | null; city: string | null; cnp: string | null; reports: number };

// "Ștefan-Andrei" → ["stefan", "andrei"]: no diacritics, no case, a hyphen splits
const words = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 1);

/**
 * The client an identity card belongs to: the same CNP first; else the same family name and at least one of the given
 * names, in any order, with or without diacritics or hyphens ("Popescu Ana Maria" = "Ana-Maria Popescu" = "Popescu Ana").
 * A client with another CNP is another person.
 */
export async function GET(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const sp = new URL(req.url).searchParams;
  const cnp = (sp.get("cnp") ?? "").replace(/\D/g, "");
  const name = (sp.get("name") ?? "").trim().slice(0, 160);
  const sur = words(sp.get("surname") || name.split(/\s+/)[0] || "");
  const given = words(name).filter((w) => !sur.includes(w));
  const scope = scopeFilter(a.user, "clients", "e");
  const where = (n: number) => (scope ? ` AND ${scope.sql.replace(/\?/g, (() => { let i = n; return () => `?${i++}`; })())}` : "");
  const cols = "e.id, e.kind, e.name, e.cui, e.phone, e.email, e.city, e.cnp, (SELECT COUNT(*) FROM reports r WHERE r.client_id = e.id) AS reports";

  if (validCnp(cnp)) {
    const hit = await a.db.prepare(`SELECT ${cols} FROM entities e WHERE e.kind = 'person' AND e.cnp = ?1${where(2)} ORDER BY reports DESC LIMIT 1`)
      .bind(cnp, ...(scope?.binds ?? [])).first<Row>();
    if (hit) return Response.json({ client: { ...hit, by: "cnp" } });
  }
  // candidates: the longest family name, by its plainest letters (LIKE does not fold diacritics); the words decide after
  const key = [...sur].sort((x, y) => y.length - x.length)[0] ?? "";
  const probe = (name.normalize("NFC").match(/[A-Za-z]{3,}/g) ?? []).filter((r) => words(r)[0] && key.includes(words(r)[0])).sort((x, y) => y.length - x.length)[0] ?? "";
  if (probe.length < 3) return Response.json({ client: null });
  const { results } = await a.db.prepare(`SELECT ${cols} FROM entities e WHERE e.kind = 'person' AND e.name LIKE ?1${where(2)} LIMIT 300`)
    .bind(`%${probe}%`, ...(scope?.binds ?? [])).all<Row>();
  const scored = results
    .filter((r) => !(validCnp(cnp) && r.cnp && r.cnp !== cnp))
    .map((r) => {
      const w = new Set(words(r.name));
      const same = given.filter((g) => w.has(g)).length;
      return { r, ok: sur.every((s) => w.has(s)) && (same > 0 || !given.length), same, exact: same === given.length && w.size === sur.length + given.length };
    })
    .filter((x) => x.ok)
    .sort((x, y) => Number(y.exact) - Number(x.exact) || y.same - x.same || y.r.reports - x.r.reports);
  const best = scored[0];
  return Response.json({ client: best ? { ...best.r, by: best.exact ? "name" : "similar" } : null, more: Math.max(0, scored.length - 1) });
}
