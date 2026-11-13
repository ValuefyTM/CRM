import { err, json, staffApi } from "@/lib/api";
import { audit } from "@/lib/auth";
import { now, uuid } from "@/lib/db";
import { SITES } from "@/lib/market/sites";

/** Adds or changes a search (a results page of a site). `{ id?, name, source, url, category, type, transaction, enabled, max_pages }`. */
export async function POST(req: Request) {
  const a = await staffApi("market:searches", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const str = (k: string, max = 300) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, max) : "");
  const name = str("name", 120), url = str("url", 1000), source = str("source");
  if (!name) return err("Dă un nume căutării.");
  if (!SITES[source]) return err("Site necunoscut.");
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return err("Adresa paginii de rezultate nu este validă."); }
  if (host !== source) return err(`Adresa trebuie să fie de pe ${source}.`);
  const transaction = str("transaction") === "inchiriere" ? "inchiriere" : "vanzare";
  const maxPages = Math.min(50, Math.max(1, Math.round(Number(b.max_pages) || 20)));
  const vals = [name, source, url, str("category", 40) || null, str("type", 80) || null, transaction, b.enabled === false ? 0 : 1, maxPages];
  const id = str("id", 80);
  if (id) {
    const r = await a.db.prepare("UPDATE market_searches SET name = ?, source = ?, url = ?, category = ?, type = ?, deal = ?, enabled = ?, max_pages = ?, updated_at = ? WHERE id = ?")
      .bind(...vals, now(), id).run();
    if (!r.meta.changes) return err("Căutarea nu există.", 404);
  } else {
    await a.db.prepare("INSERT INTO market_searches (id, name, source, url, category, type, deal, enabled, max_pages) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(uuid(), ...vals).run();
  }
  await audit(a.db, `user:${a.user.id}`, id ? "market.search.edit" : "market.search.add", "market_searches", id || name, url);
  return Response.json({ ok: true });
}

/** Deletes a search (`?id=`). Its listings stay. */
export async function DELETE(req: Request) {
  const a = await staffApi("market:searches", true);
  if ("res" in a) return a.res;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  await a.db.batch([
    a.db.prepare("DELETE FROM market_searches WHERE id = ?").bind(id),
    a.db.prepare("DELETE FROM market_jobs WHERE search_id = ? AND status IN ('pending', 'error')").bind(id),
  ]);
  await audit(a.db, `user:${a.user.id}`, "market.search.delete", "market_searches", id);
  return Response.json({ ok: true });
}
