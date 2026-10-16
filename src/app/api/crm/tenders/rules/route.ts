import { err, json, staffApi } from "@/lib/api";
import { audit } from "@/lib/auth";
import { saveRules, type TenderRules } from "@/lib/tenders";

const words = (v: unknown, max = 40) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\n]/) : [])
  .map((x) => String(x).trim()).filter(Boolean).slice(0, max);

/** The criteria of the SEAP alerts (owner / admins). */
export async function PUT(req: Request) {
  const a = await staffApi("admin", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const emails = words(b.emails, 10).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  const r: TenderRules = {
    enabled: b.enabled !== false, cpv: words(b.cpv).map((c) => c.replace(/\D/g, "")).filter(Boolean), keywords: words(b.keywords),
    counties: words(b.counties, 42), minValue: Number(b.minValue) > 0 ? Number(b.minValue) : null, direct: b.direct === true, emails,
  };
  if (!r.cpv.length && !r.keywords.length) return err("Pune cel puțin un cod CPV sau un cuvânt cheie.");
  await saveRules(a.db, r, a.user.id);
  await audit(a.db, `user:${a.user.id}`, "tenders.rules", "tenders", "rules", `${r.cpv.length} CPV, ${r.keywords.length} cuvinte, ${r.counties.length} județe`);
  return Response.json({ ok: true, rules: r });
}
