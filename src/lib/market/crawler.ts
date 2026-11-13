// Server-only: the nightly crawler of the market listings (Piață → Anunțuri de piață).
//
// One run = a queue of jobs in D1 (market_jobs): a results page ("list") or a listing's page ("detail"), each one an
// Apify run. The cron calls `tick` every 5 minutes: it collects the Apify runs that finished, processes them (new pages,
// listings), starts new ones (at most MARKET_CONCURRENCY in parallel) and stops after ~4 minutes, so nothing waits
// hours inside the Worker. When the queue is empty the run is closed: listings missing from complete searches are
// counted (inactive after 3 runs) and duplicates across sites are grouped.
//
// A listing whose card (price, area, title) did not change since the last run is not downloaded again.
import { now, uuid } from "../db";
import { abortRun, datasetItem, runStatus, startFetch, type FetchItem } from "./apify";
import { getMarketSettings } from "./settings";
import { SITES, type Card, type Detail } from "./sites";
import { cleanMd, hex, norm, sha1, uniq } from "./util";

type Search = { id: string; name: string; source: string; url: string; category: string | null; type: string | null; deal: string; enabled: number; max_pages: number };
type Job = { id: string; run_id: string; kind: "list" | "detail"; search_id: string; listing_id: string | null; url: string; page: number | null; card_fp: string | null;
  status: string; apify_run_id: string | null; dataset_id: string | null; attempts: number };
type Listing = Record<string, unknown> & { id: string; source: string; ext_id: string; url: string; status: string; fp_card: string | null; fp_detail: string | null; last_seen_at: string };

const MISSING_LIMIT = 3;          // runs in a row missing from a complete search → inactive
const MAX_PHOTOS = 40;
const MAX_ATTEMPTS = 3;
const DUP = { meters: 250, area: 0.03, price: 0.05 };

const cardFp = (c: Card) => sha1(c.price ?? null, c.currency ?? null, c.usable_area ?? null, norm(c.title));
const mainArea = (r: { usable_area?: unknown; built_area?: unknown; land_area?: unknown }) =>
  (r.usable_area as number | null) || (r.built_area as number | null) || (r.land_area as number | null) || null;

async function bump(db: D1Database, runId: string, k: string, n = 1) {
  if (!n) return;
  await db.prepare(`UPDATE market_runs SET stats = json_set(stats, '$.' || ?1, COALESCE(json_extract(stats, '$.' || ?1), 0) + ?2) WHERE id = ?3`).bind(k, n, runId).run();
}

// ---------------------------------------------------------------- start

/** Starts a run (the nightly cron, or „Rulează acum”): page 1 of every enabled search, or of the given ones. */
export async function startRun(db: D1Database, trigger: "cron" | "manual", searchIds?: string[]) {
  const running = await db.prepare("SELECT id, started_at FROM market_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1").first<{ id: string; started_at: string }>();
  const { results: searches } = await db.prepare("SELECT * FROM market_searches WHERE enabled = 1").all<Search>();
  const pick = searches.filter((s) => !searchIds?.length || searchIds.includes(s.id));
  if (!pick.length) return { runId: running?.id ?? null, searches: 0 };
  let runId = running?.id;
  if (!runId) {
    runId = uuid();
    await db.prepare("INSERT INTO market_runs (id, trigger, status, started_at, stats) VALUES (?, ?, 'running', ?, '{}')").bind(runId, trigger, now()).run();
  }
  const stmts = [];
  for (const s of pick) {
    const site = SITES[s.source];
    if (!site) continue;
    // a search already queued in this run is not queued twice
    stmts.push(db.prepare(`INSERT INTO market_jobs (id, run_id, kind, search_id, url, page)
      SELECT ?, ?, 'list', ?, ?, 1 WHERE NOT EXISTS (SELECT 1 FROM market_jobs WHERE run_id = ? AND search_id = ? AND kind = 'list')`)
      .bind(uuid(), runId, s.id, site.pageUrl(s.url, 1), runId, s.id));
    stmts.push(db.prepare("UPDATE market_searches SET last_run_at = (SELECT started_at FROM market_runs WHERE id = ?), last_complete = NULL, last_count = 0, last_error = NULL WHERE id = ?").bind(runId, s.id));
  }
  if (stmts.length) await db.batch(stmts);
  return { runId, searches: pick.length };
}

// ---------------------------------------------------------------- tick

/** One pass of the cron (≈4 minutes at most): collect finished Apify runs, process them, start new ones. */
export async function tick(db: D1Database, bucket: R2Bucket | null, budgetMs = 240_000) {
  const t0 = Date.now();
  const left = () => budgetMs - (Date.now() - t0);
  let processed = 0, started = 0;
  const active = await db.prepare("SELECT id FROM market_runs WHERE status = 'running' LIMIT 1").first<{ id: string }>();
  if (!active) return { processed, started, idle: true, photos: budgetMs > 60_000 ? await retryPhotos(db, bucket, 20_000) : 0 };
  const { concurrency } = await getMarketSettings(db);

  while (left() > Math.min(20_000, budgetMs / 3)) {
    // 1. collect what finished
    const { results: running } = await db.prepare("SELECT * FROM market_jobs WHERE status = 'running' ORDER BY updated_at LIMIT 20").all<Job>();
    let collected = 0;
    for (const j of running) {
      if (left() < Math.min(15_000, budgetMs / 4)) break;
      let st: string;
      try { st = await runStatus(j.apify_run_id!); } catch { continue; }
      if (st === "READY" || st === "RUNNING") continue;
      // claim it (two overlapping ticks never process the same job)
      const claim = await db.prepare("UPDATE market_jobs SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'running'").bind(now(), j.id).run();
      if (!claim.meta.changes) continue;
      collected++;
      try {
        const item = st === "SUCCEEDED" ? await datasetItem(j.dataset_id!) : null;
        const code = item?.fetch?.httpStatusCode ?? 0;
        if (!item || (code >= 400 && !(j.kind === "detail" && (code === 404 || code === 410)))) throw new Error(item ? `HTTP ${code}` : `Apify ${st}`);
        if (j.kind === "list") await processList(db, j, item); else await processDetail(db, bucket, j, item);
        await db.prepare("UPDATE market_jobs SET status = 'done', error = NULL, updated_at = ? WHERE id = ?").bind(now(), j.id).run();
        processed++;
      } catch (e) {
        await failJob(db, j, e);
      }
    }
    // 2. start new runs, up to the parallel limit
    const busy = (await db.prepare("SELECT COUNT(*) AS n FROM market_jobs WHERE status IN ('running', 'processing')").first<{ n: number }>())?.n ?? 0;
    const free = concurrency - busy;
    if (free > 0) {
      // the results pages first (they decide what else to download), then the listings, alternating the sites
      const { results: pending } = await db.prepare(`SELECT j.* FROM market_jobs j WHERE j.status = 'pending'
        ORDER BY j.kind = 'list' DESC, j.attempts, (SELECT COUNT(*) FROM market_jobs k WHERE k.run_id = j.run_id AND k.search_id = j.search_id AND k.kind = j.kind AND k.rowid < j.rowid), j.rowid LIMIT ?`).bind(free).all<Job>();
      for (const j of pending) {
        const search = await db.prepare("SELECT source FROM market_searches WHERE id = ?").bind(j.search_id).first<{ source: string }>();
        const site = search && SITES[search.source];
        if (!site) { await db.prepare("UPDATE market_jobs SET status = 'error', error = 'căutare ștearsă' WHERE id = ?").bind(j.id).run(); continue; }
        try {
          const r = await startFetch(j.url, j.kind === "list" ? site.listFormats : site.detailFormats);
          await db.prepare("UPDATE market_jobs SET status = 'running', apify_run_id = ?, dataset_id = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?")
            .bind(r.runId, r.datasetId, now(), j.id).run();
          started++;
          await bump(db, j.run_id, "rulari_apify");
        } catch (e) {
          console.warn("market: start", j.url, String(e));
          break; // usually the account's limit of parallel runs: try on the next pass
        }
      }
    }
    // 3. nothing left: close the run
    const open = await db.prepare("SELECT COUNT(*) AS n FROM market_jobs WHERE run_id = ? AND status IN ('pending', 'running', 'processing')").bind(active.id).first<{ n: number }>();
    if (!open?.n) { await finishRun(db, bucket, active.id); break; }
    // wait a little for the runs in progress (Apify answers as soon as one finishes)
    if (!collected) {
      const oldest = await db.prepare("SELECT apify_run_id FROM market_jobs WHERE status = 'running' ORDER BY updated_at LIMIT 1").first<{ apify_run_id: string }>();
      const wait = Math.min(30, Math.floor((left() - Math.min(15_000, budgetMs / 4)) / 1000));
      if (oldest && wait > 0) await runStatus(oldest.apify_run_id, wait).catch(() => null);
      else if (wait <= 0) break;
      else await new Promise((r) => setTimeout(r, 3000));
    }
  }
  // processing jobs left by a pass that was cut off go back to the queue
  await db.prepare("UPDATE market_jobs SET status = 'running' WHERE status = 'processing' AND updated_at < ?").bind(new Date(Date.now() - 10 * 60_000).toISOString()).run();
  return { processed, started, idle: false };
}

async function failJob(db: D1Database, j: Job, e: unknown) {
  const msg = String(e instanceof Error ? e.message : e).slice(0, 300);
  const final = j.attempts >= MAX_ATTEMPTS;
  await db.prepare("UPDATE market_jobs SET status = ?, error = ?, apify_run_id = NULL, dataset_id = NULL, updated_at = ? WHERE id = ?")
    .bind(final ? "error" : "pending", msg, now(), j.id).run();
  if (!final) return;
  await bump(db, j.run_id, j.kind === "list" ? "pagini_esuate" : "anunturi_esuate");
  if (j.kind === "list") await db.prepare("UPDATE market_searches SET last_complete = 0, last_error = ? WHERE id = ?").bind(`pagina ${j.page}: ${msg}`, j.search_id).run();
  else if (j.listing_id) await db.prepare("UPDATE market_listings SET error = ? WHERE id = ?").bind(msg, j.listing_id).run();
}

// ---------------------------------------------------------------- results page

async function processList(db: D1Database, j: Job, item: FetchItem) {
  const search = await db.prepare("SELECT * FROM market_searches WHERE id = ?").bind(j.search_id).first<Search>();
  const run = await db.prepare("SELECT started_at FROM market_runs WHERE id = ?").bind(j.run_id).first<{ started_at: string }>();
  if (!search || !run) return;
  const site = SITES[search.source];
  const cards = site.parseList(item).filter((c, i, a) => c.extId && a.findIndex((x) => x.extId === c.extId) === i);
  await bump(db, j.run_id, "pagini");
  // listings already seen in this run (an earlier page) do not count: past the last page, sites repeat the last one
  const fresh: Card[] = [];
  const known = new Map<string, Listing>();
  for (let i = 0; i < cards.length; i += 50) {
    const part = cards.slice(i, i + 50);
    const { results } = await db.prepare(`SELECT * FROM market_listings WHERE source = ? AND ext_id IN (${part.map(() => "?").join(",")})`)
      .bind(search.source, ...part.map((c) => c.extId)).all<Listing>();
    results.forEach((r) => known.set(r.ext_id, r));
  }
  for (const c of cards) {
    const k = known.get(c.extId);
    if (!(k && k.last_seen_at === run.started_at && k.search_id === search.id)) fresh.push(c);
  }
  if (!fresh.length) {
    await db.prepare("UPDATE market_searches SET last_complete = 1, updated_at = ? WHERE id = ?").bind(now(), search.id).run();
    return;
  }
  const stmts: D1PreparedStatement[] = [];
  let nNew = 0, nSame = 0, nQueued = 0;
  for (const c of fresh) {
    const fp = await cardFp(c);
    const k = known.get(c.extId);
    let id = k?.id;
    if (!k) {
      id = uuid(); nNew++;
      const area = mainArea(c);
      stmts.push(db.prepare(`INSERT INTO market_listings (id, source, ext_id, url, search_id, category, type, deal, title, price, currency, price_sqm,
          usable_area, built_area, land_area, county, city, zone, address, lat, lng, geo_precision, seller_kind, seller_name, description, src_created_at,
          status, first_seen_at, last_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'activ',?,?)`)
        .bind(id, search.source, c.extId, c.url, search.id, search.category, search.type, c.transaction ?? search.deal, c.title ?? null, c.price ?? null,
          c.currency ?? null, c.price && area ? Math.round((c.price / area) * 100) / 100 : null, c.usable_area ?? null, c.built_area ?? null, c.land_area ?? null,
          c.county ?? null, c.city ?? null, c.zone ?? null, c.address ?? null, c.lat ?? null, c.lng ?? null, c.geo_precision ?? null, c.seller_kind ?? null,
          c.seller_name ?? null, c.description ?? null, c.src_created_at ?? null, run.started_at, run.started_at));
      // searchable right away (the listing's page, when downloaded, replaces it with the full text)
      stmts.push(db.prepare("INSERT INTO market_listings_fts (listing_id, title, body) VALUES (?, ?, ?)").bind(id, c.title ?? "", c.description ?? ""));
    } else {
      stmts.push(db.prepare("UPDATE market_listings SET last_seen_at = ?, missing_runs = 0, search_id = ?, url = ?, status = CASE WHEN status = 'inactiv' THEN 'activ' ELSE status END WHERE id = ?")
        .bind(run.started_at, search.id, c.url, k.id));
      if (k.status === "inactiv") {
        stmts.push(db.prepare("INSERT INTO market_listing_history (id, listing_id, at, event, price, currency, title) VALUES (?, ?, ?, 'reaparut', ?, ?, ?)")
          .bind(uuid(), k.id, now(), c.price ?? null, c.currency ?? null, c.title ?? null));
        await bump(db, j.run_id, "reaparute");
      }
    }
    if (!k || k.fp_card !== fp || !k.fp_detail || k.status === "expirat") {
      nQueued++;
      stmts.push(db.prepare(`INSERT INTO market_jobs (id, run_id, kind, search_id, listing_id, url, card_fp)
        SELECT ?, ?, 'detail', ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM market_jobs WHERE run_id = ? AND listing_id = ? AND kind = 'detail')`)
        .bind(uuid(), j.run_id, search.id, id, c.url, fp, j.run_id, id));
    } else nSame++;
  }
  const page = j.page ?? 1;
  if (page < search.max_pages)
    stmts.push(db.prepare("INSERT INTO market_jobs (id, run_id, kind, search_id, url, page) VALUES (?, ?, 'list', ?, ?, ?)").bind(uuid(), j.run_id, search.id, site.pageUrl(search.url, page + 1), page + 1));
  else // stopped at the limit of pages: the missing listings are not counted (the search was not read to the end)
    stmts.push(db.prepare("UPDATE market_searches SET last_complete = 0, last_error = ? WHERE id = ?").bind(`limita de ${search.max_pages} pagini`, search.id));
  stmts.push(db.prepare("UPDATE market_searches SET last_count = COALESCE(last_count, 0) + ?, updated_at = ? WHERE id = ?").bind(fresh.length, now(), search.id));
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  await bump(db, j.run_id, "anunturi_vazute", fresh.length);
  await bump(db, j.run_id, "anunturi_noi", nNew);
  await bump(db, j.run_id, "nemodificate", nSame);
  await bump(db, j.run_id, "de_descarcat", nQueued);
}

// ---------------------------------------------------------------- listing page

async function gzipJson(v: unknown) {
  const s = new Blob([JSON.stringify(v)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(s).arrayBuffer();
}

async function processDetail(db: D1Database, bucket: R2Bucket | null, j: Job, item: FetchItem) {
  const row = j.listing_id ? await db.prepare("SELECT * FROM market_listings WHERE id = ?").bind(j.listing_id).first<Listing>() : null;
  if (!row) return;
  const site = SITES[row.source];
  const at = now();
  // the whole page as Apify returned it (HTML, markdown, metadata), compressed
  const key = `surse/${row.source}/${row.ext_id}/${at.replace(/[:.]/g, "-")}.json.gz`;
  if (bucket) await bucket.put(key, await gzipJson(item), { httpMetadata: { contentType: "application/gzip" }, customMetadata: { url: row.url } });
  const code = item.fetch?.httpStatusCode ?? 200;
  const loaded = (item.fetch?.loadedUrl ?? "").split("?")[0].replace(/\/$/, "");
  let d: Detail = code === 404 || code === 410 ? { expired: true } : site.parseDetail(item, { url: row.url, extId: row.ext_id });
  // Storia sends an expired listing to a results page
  if (!d.expired && row.source === "storia.ro" && loaded && loaded !== row.url.split("?")[0].replace(/\/$/, "")) d = { expired: true };
  if (d.expired) {
    await db.batch([
      db.prepare("UPDATE market_listings SET status = 'expirat', fetched_at = ?, source_key = ?, fp_card = ?, error = NULL WHERE id = ?").bind(at, bucket ? key : null, j.card_fp, row.id),
      db.prepare("INSERT INTO market_listing_history (id, listing_id, at, event, price, currency, title, source_key) VALUES (?, ?, ?, 'expirat', ?, ?, ?, ?)")
        .bind(uuid(), row.id, at, row.price ?? null, row.currency ?? null, row.title ?? null, bucket ? key : null),
    ]);
    await bump(db, j.run_id, "expirate");
    return;
  }
  // the listing's page completes and corrects the card
  const m: Record<string, unknown> = { ...row };
  for (const [k, v] of Object.entries(d)) if (v != null && v !== "" && k !== "features" && k !== "photos") m[k] = v;
  const photos = uniq((d.photos?.length ? d.photos : []).filter(Boolean)).slice(0, MAX_PHOTOS);
  const area = mainArea(m);
  const fp = await sha1(m.price ?? null, m.currency ?? null, m.usable_area ?? null, m.built_area ?? null, m.land_area ?? null, norm(m.title as string),
    norm(m.description as string), m.lat ?? null, m.lng ?? null, [...photos].sort());
  const first = !row.fp_detail, changed = first || row.fp_detail !== fp;
  const md = cleanMd(item.markdown);
  const stmts: D1PreparedStatement[] = [
    db.prepare(`UPDATE market_listings SET title = ?, price = ?, currency = ?, price_sqm = ?, usable_area = ?, built_area = ?, land_area = ?, county = ?, city = ?, zone = ?,
        address = ?, lat = ?, lng = ?, geo_precision = ?, seller_kind = ?, seller_name = ?, description = ?, content_md = ?, features = ?, src_created_at = ?,
        src_updated_at = ?, deal = COALESCE(?, deal), fp_card = ?, fp_detail = ?, source_key = ?, status = 'activ', fetched_at = ?, error = NULL
        ${changed ? ", changed_at = ?" : ""} WHERE id = ?`)
      .bind(m.title ?? null, m.price ?? null, m.currency ?? null, m.price && area ? Math.round(((m.price as number) / area) * 100) / 100 : null,
        m.usable_area ?? null, m.built_area ?? null, m.land_area ?? null, m.county ?? null, m.city ?? null, m.zone ?? null, m.address ?? null,
        m.lat ?? null, m.lng ?? null, m.geo_precision ?? null, m.seller_kind ?? null, m.seller_name ?? null, m.description ?? null, md,
        JSON.stringify(d.features ?? {}), m.src_created_at ?? null, m.src_updated_at ?? null, d.transaction ?? null, j.card_fp, fp, bucket ? key : null, at,
        ...(changed ? [at] : []), row.id),
    db.prepare("DELETE FROM market_listings_fts WHERE listing_id = ?").bind(row.id),
    db.prepare("INSERT INTO market_listings_fts (listing_id, title, body) VALUES (?, ?, ?)").bind(row.id, (m.title as string) ?? "", `${m.description ?? ""}\n\n${md}`),
  ];
  if (changed) stmts.push(db.prepare("INSERT INTO market_listing_history (id, listing_id, at, event, price, currency, area, title, source_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(uuid(), row.id, at, first ? "nou" : "modificat", m.price ?? null, m.currency ?? null, area, m.title ?? null, bucket ? key : null));
  photos.forEach((u, i) => stmts.push(db.prepare("INSERT OR IGNORE INTO market_listing_photos (id, listing_id, position, url) VALUES (?, ?, ?, ?)").bind(uuid(), row.id, i, u)));
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  await bump(db, j.run_id, first ? "descarcate_noi" : changed ? "modificate" : "neschimbate");
  if (bucket) await downloadPhotos(db, bucket, row.id, row.source, row.ext_id);
}

// ---------------------------------------------------------------- photos (R2)

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };

async function downloadPhotos(db: D1Database, bucket: R2Bucket, listingId: string, source: string, extId: string) {
  const { results } = await db.prepare("SELECT id, position, url FROM market_listing_photos WHERE listing_id = ? AND r2_key IS NULL AND attempts < ? ORDER BY position")
    .bind(listingId, MAX_ATTEMPTS).all<{ id: string; position: number; url: string }>();
  for (let i = 0; i < results.length; i += 6) {
    await Promise.all(results.slice(i, i + 6).map(async (p) => {
      try {
        const r = await fetch(p.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; VALUEFY-CRM/1.0)" }, signal: AbortSignal.timeout(20_000) });
        const type = (r.headers.get("content-type") ?? "").split(";")[0].trim();
        if (!r.ok || !type.startsWith("image/")) throw new Error(`HTTP ${r.status} ${type}`);
        const buf = await r.arrayBuffer();
        const h = hex(await crypto.subtle.digest("SHA-1", buf));
        const key = `imagini/${source}/${extId}/${String(p.position).padStart(3, "0")}-${h.slice(0, 10)}.${EXT[type] ?? "jpg"}`;
        await bucket.put(key, buf, { httpMetadata: { contentType: type, cacheControl: "private, max-age=31536000, immutable" }, customMetadata: { url: p.url } });
        await db.prepare("UPDATE market_listing_photos SET r2_key = ?, sha1 = ?, bytes = ?, attempts = attempts + 1, error = NULL WHERE id = ?").bind(key, h, buf.byteLength, p.id).run();
      } catch (e) {
        await db.prepare("UPDATE market_listing_photos SET attempts = attempts + 1, error = ? WHERE id = ?").bind(String(e).slice(0, 200), p.id).run();
      }
    }));
  }
  await db.prepare(`UPDATE market_listings SET photo_count = (SELECT COUNT(*) FROM market_listing_photos WHERE listing_id = ?1 AND r2_key IS NOT NULL),
    cover_key = (SELECT r2_key FROM market_listing_photos WHERE listing_id = ?1 AND r2_key IS NOT NULL ORDER BY position LIMIT 1) WHERE id = ?1`).bind(listingId).run();
}

/** Photos that failed earlier (network): retried a few times, between runs. */
async function retryPhotos(db: D1Database, bucket: R2Bucket | null, budgetMs: number) {
  if (!bucket) return 0;
  const t0 = Date.now();
  const { results } = await db.prepare(`SELECT DISTINCT p.listing_id, l.source, l.ext_id FROM market_listing_photos p JOIN market_listings l ON l.id = p.listing_id
    WHERE p.r2_key IS NULL AND p.attempts BETWEEN 1 AND ? AND l.status = 'activ' LIMIT 10`).bind(MAX_ATTEMPTS - 1).all<{ listing_id: string; source: string; ext_id: string }>();
  for (const r of results) {
    if (Date.now() - t0 > budgetMs) break;
    await downloadPhotos(db, bucket, r.listing_id, r.source, r.ext_id);
  }
  return results.length;
}

// ---------------------------------------------------------------- cancel / progress

/** Stops the run in progress (control panel): the queue is emptied, the Apify runs in progress are aborted. Nothing is
 * marked as missing (the searches were not read to the end); what was already downloaded stays. */
export async function cancelRun(db: D1Database, userName: string) {
  const run = await db.prepare("SELECT id, started_at FROM market_runs WHERE status = 'running' LIMIT 1").first<{ id: string; started_at: string }>();
  if (!run) return null;
  const { results: live } = await db.prepare("SELECT apify_run_id FROM market_jobs WHERE run_id = ? AND status = 'running' AND apify_run_id IS NOT NULL").bind(run.id).all<{ apify_run_id: string }>();
  await Promise.all(live.map((j) => abortRun(j.apify_run_id)));
  await db.batch([
    db.prepare("UPDATE market_jobs SET status = 'error', error = 'oprită', updated_at = ? WHERE run_id = ? AND status IN ('pending', 'running', 'processing')").bind(now(), run.id),
    db.prepare("UPDATE market_searches SET last_complete = 0, last_error = COALESCE(last_error, 'rulare oprită') WHERE last_run_at = ? AND COALESCE(last_complete, 0) = 0").bind(run.started_at),
    db.prepare("UPDATE market_runs SET status = 'stopped', finished_at = ?, stats = json_set(stats, '$.oprita_de', ?) WHERE id = ?").bind(now(), userName, run.id),
  ]);
  await dedupe(db);
  return run.id;
}

export type RunProgress = {
  run: { id: string; trigger: string; status: string; started_at: string; finished_at: string | null; stats: Record<string, number | string> } | null;
  searches: { id: string; name: string; source: string; pages_done: number; pages_open: number; pages_err: number; det_done: number; det_open: number; det_err: number; listings: number; complete: number | null; error: string | null }[];
  totals: { pages_done: number; pages_open: number; det_done: number; det_open: number; det_err: number; running: number };
  recent: { at: string; title: string | null; source: string; listing_id: string | null; kind: string; status: string; error: string | null }[];
  eta_min: number | null;
};

/** What the control panel shows: the current (or last) run, per search, the latest jobs, an estimate of the time left. */
export async function runProgress(db: D1Database): Promise<RunProgress> {
  const run = await db.prepare("SELECT id, trigger, status, started_at, finished_at, stats FROM market_runs ORDER BY status = 'running' DESC, started_at DESC LIMIT 1")
    .first<{ id: string; trigger: string; status: string; started_at: string; finished_at: string | null; stats: string }>();
  if (!run) return { run: null, searches: [], totals: { pages_done: 0, pages_open: 0, det_done: 0, det_open: 0, det_err: 0, running: 0 }, recent: [], eta_min: null };
  const OPEN = "('pending', 'running', 'processing')";
  const [per, recent] = await Promise.all([
    db.prepare(`SELECT s.id, s.name, s.source, s.last_count AS listings, s.last_complete AS complete, s.last_error AS error,
        COALESCE(SUM(j.kind = 'list' AND j.status = 'done'), 0) AS pages_done, COALESCE(SUM(j.kind = 'list' AND j.status IN ${OPEN}), 0) AS pages_open,
        COALESCE(SUM(j.kind = 'list' AND j.status = 'error' AND COALESCE(j.error, '') <> 'oprită'), 0) AS pages_err, COALESCE(SUM(j.kind = 'detail' AND j.status = 'done'), 0) AS det_done,
        COALESCE(SUM(j.kind = 'detail' AND j.status IN ${OPEN}), 0) AS det_open, COALESCE(SUM(j.kind = 'detail' AND j.status = 'error' AND COALESCE(j.error, '') <> 'oprită'), 0) AS det_err,
        COALESCE(SUM(j.status = 'running'), 0) AS running
      FROM market_searches s JOIN market_jobs j ON j.search_id = s.id AND j.run_id = ? GROUP BY s.id ORDER BY s.name, s.source`).bind(run.id)
      .all<RunProgress["searches"][number] & { running: number }>(),
    db.prepare(`SELECT j.updated_at AS at, l.title, s.source, j.listing_id, j.kind, j.status, j.error FROM market_jobs j
        JOIN market_searches s ON s.id = j.search_id LEFT JOIN market_listings l ON l.id = j.listing_id
      WHERE j.run_id = ? AND j.status IN ('done', 'error', 'running') AND COALESCE(j.error, '') <> 'oprită' ORDER BY j.updated_at DESC LIMIT 15`).bind(run.id).all<RunProgress["recent"][number]>(),
  ]);
  const sum = (k: "pages_done" | "pages_open" | "det_done" | "det_open" | "det_err" | "running") => per.results.reduce((t, x) => t + Number(x[k] ?? 0), 0);
  const totals = { pages_done: sum("pages_done"), pages_open: sum("pages_open"), det_done: sum("det_done"), det_open: sum("det_open"), det_err: sum("det_err"), running: sum("running") };
  // the pace so far: jobs finished per minute since the start
  const mins = (Date.now() - Date.parse(run.started_at)) / 60_000;
  const done = totals.pages_done + totals.det_done + totals.det_err;
  const open = totals.pages_open + totals.det_open;
  const eta_min = run.status === "running" && done >= 3 && mins > 0.5 ? Math.ceil(open / (done / mins)) : null;
  let stats: Record<string, number | string> = {};
  try { stats = JSON.parse(run.stats); } catch { /* empty */ }
  return { run: { ...run, stats }, searches: per.results, totals, recent: recent.results, eta_min };
}

// ---------------------------------------------------------------- end of a run

async function finishRun(db: D1Database, bucket: R2Bucket | null, runId: string) {
  const run = await db.prepare("SELECT started_at FROM market_runs WHERE id = ?").bind(runId).first<{ started_at: string }>();
  if (!run) return;
  // only the searches read to the last page: a listing missing from them is counted (inactive after 3 runs)
  const { results: complete } = await db.prepare("SELECT id FROM market_searches WHERE last_run_at = ? AND last_complete = 1").bind(run.started_at).all<{ id: string }>();
  let gone = 0;
  for (const s of complete) {
    await db.prepare("UPDATE market_listings SET missing_runs = missing_runs + 1 WHERE search_id = ? AND status = 'activ' AND last_seen_at < ?").bind(s.id, run.started_at).run();
    const { results: out } = await db.prepare("SELECT id, price, currency, title FROM market_listings WHERE search_id = ? AND status = 'activ' AND missing_runs >= ?")
      .bind(s.id, MISSING_LIMIT).all<{ id: string; price: number | null; currency: string | null; title: string | null }>();
    const stmts = out.flatMap((r) => [
      db.prepare("UPDATE market_listings SET status = 'inactiv' WHERE id = ?").bind(r.id),
      db.prepare("INSERT INTO market_listing_history (id, listing_id, at, event, price, currency, title) VALUES (?, ?, ?, 'disparut', ?, ?, ?)").bind(uuid(), r.id, now(), r.price, r.currency, r.title),
    ]);
    for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
    gone += out.length;
  }
  await bump(db, runId, "devenite_inactive", gone);
  const groups = await dedupe(db);
  await db.prepare("UPDATE market_runs SET status = 'done', finished_at = ?, stats = json_set(stats, '$.grupuri_duplicate', ?) WHERE id = ?").bind(now(), groups, runId).run();
  // the finished jobs are no longer needed (the errors stay one more run, for the page)
  await db.prepare("DELETE FROM market_jobs WHERE run_id <> ? AND run_id IN (SELECT id FROM market_runs WHERE status IN ('done', 'stopped'))").bind(runId).run();
  await retryPhotos(db, bucket, 20_000);
}

/** Groups the same property listed on several sites (or twice on one): identical photo, or close + same area and price. */
export async function dedupe(db: D1Database) {
  const { results: rows } = await db.prepare(`SELECT id, category, deal AS "transaction", price, currency, lat, lng, city, usable_area, built_area, land_area, dup_group, dup_reason
    FROM market_listings WHERE status = 'activ'`).all<{ id: string; category: string | null; transaction: string | null; price: number | null; currency: string | null;
      lat: number | null; lng: number | null; city: string | null; usable_area: number | null; built_area: number | null; land_area: number | null; dup_group: string | null; dup_reason: string | null }>();
  const parent = new Map(rows.map((r) => [r.id, r.id]));
  const why = new Map<string, string>();
  const find = (x: string): string => { let p = parent.get(x)!; while (p !== parent.get(p)) p = parent.get(p)!; parent.set(x, p); return p; };
  const union = (a: string, b: string, m: string) => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    if (ra < rb) parent.set(rb, ra); else parent.set(ra, rb);
    if (!why.has(a)) why.set(a, m);
    if (!why.has(b)) why.set(b, m);
  };
  // the same image file (a photo shared by more than 4 listings is a logo or placeholder)
  const { results: same } = await db.prepare(`SELECT group_concat(DISTINCT p.listing_id) AS ids FROM market_listing_photos p JOIN market_listings l ON l.id = p.listing_id
    WHERE p.sha1 IS NOT NULL AND l.status = 'activ' GROUP BY p.sha1 HAVING COUNT(DISTINCT p.listing_id) BETWEEN 2 AND 4`).all<{ ids: string }>();
  for (const g of same) { const ids = g.ids.split(","); ids.slice(1).forEach((b) => union(ids[0], b, "imagine identică")); }
  // close, same area and price
  const by = new Map<string, { a: number; r: (typeof rows)[number] }[]>();
  for (const r of rows) {
    const a = mainArea(r);
    if (!a || !r.price) continue;
    const k = `${r.category}|${r.transaction}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push({ a, r });
  }
  for (const list of by.values()) {
    list.sort((x, y) => x.a - y.a);
    for (let i = 0; i < list.length; i++) {
      const { a: a1, r: r1 } = list[i];
      for (let k = i + 1; k < list.length && list[k].a <= a1 * (1 + DUP.area); k++) {
        const r2 = list[k].r;
        if (r1.currency !== r2.currency || Math.abs(r1.price! - r2.price!) > DUP.price * Math.max(r1.price!, r2.price!)) continue;
        if (r1.lat != null && r2.lat != null && r1.lng != null && r2.lng != null) {
          const dy = (r1.lat - r2.lat) * 111_320, dx = (r1.lng - r2.lng) * 111_320 * Math.cos((r1.lat * Math.PI) / 180);
          if (Math.hypot(dx, dy) <= DUP.meters) union(r1.id, r2.id, "locație + suprafață + preț");
        } else if (norm(r1.city) && norm(r1.city) === norm(r2.city) && Math.abs(list[k].a - a1) <= 0.01 * a1) union(r1.id, r2.id, "localitate + suprafață + preț");
      }
    }
  }
  const size = new Map<string, number>();
  for (const id of parent.keys()) size.set(find(id), (size.get(find(id)) ?? 0) + 1);
  const stmts: D1PreparedStatement[] = [];
  for (const r of rows) {
    const root = find(r.id);
    const g = (size.get(root) ?? 1) > 1 ? root : null;
    const m = g ? why.get(r.id) ?? null : null;
    if (r.dup_group !== g || r.dup_reason !== m) stmts.push(db.prepare("UPDATE market_listings SET dup_group = ?, dup_reason = ? WHERE id = ?").bind(g, m, r.id));
  }
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  return [...size.values()].filter((n) => n > 1).length;
}
