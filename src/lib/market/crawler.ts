// Server-only: the nightly crawler of the market listings (Piață → Anunțuri de piață).
//
// One run = a queue of jobs in D1 (market_jobs): a results page ("list") or a listing's page ("detail"), each one an
// Apify run. The cron calls `tick` every 5 minutes: it collects the Apify runs that finished, processes them (new pages,
// listings), starts new ones (at most MARKET_CONCURRENCY in parallel) and stops after ~4 minutes, so nothing waits
// hours inside the Worker. When the queue is empty the run is closed: listings missing from complete searches are
// counted (inactive after 3 runs, a setting) and duplicates across sites are grouped.
//
// A listing whose card (price, area, title) did not change since the last run is not downloaded again.
import { now, uuid } from "../db";
import { abortRun, datasetItem, runStatus, startFetch, type FetchItem } from "./apify";
import { dueSlot, getMarketSettings, type MarketSettings } from "./settings";
import { SITES, type Card, type Detail } from "./sites";
import { contactOf } from "./contact";
import { cleanMd, hex, norm, sha1, uniq } from "./util";
import { esc, layout, sendEmail } from "../email";

type Search = { id: string; name: string; source: string; url: string; category: string | null; type: string | null; deal: string; enabled: number; max_pages: number;
  every_days: number; max_details: number; last_run_at: string | null };
type Job = { id: string; run_id: string; kind: "list" | "detail"; search_id: string; listing_id: string | null; url: string; page: number | null; card_fp: string | null;
  status: string; apify_run_id: string | null; dataset_id: string | null; attempts: number };
type Listing = Record<string, unknown> & { id: string; source: string; ext_id: string; url: string; status: string; fp_card: string | null; fp_detail: string | null; last_seen_at: string };

const MAX_PHOTOS = 40;
const MAX_ATTEMPTS = 3;           // photos (the tries of a page are a setting)

const cardFp = (c: Card) => sha1(c.price ?? null, c.currency ?? null, c.usable_area ?? null, norm(c.title));
const mainArea = (r: { usable_area?: unknown; built_area?: unknown; land_area?: unknown }) =>
  (r.usable_area as number | null) || (r.built_area as number | null) || (r.land_area as number | null) || null;

async function bump(db: D1Database, runId: string, k: string, n = 1) {
  if (!n) return;
  await db.prepare(`UPDATE market_runs SET stats = json_set(stats, '$.' || ?1, COALESCE(json_extract(stats, '$.' || ?1), 0) + ?2) WHERE id = ?3`).bind(k, n, runId).run();
}

// ---------------------------------------------------------------- start

/** A search is due in a scheduled run: its frequency in days has passed since its last run (0 = on demand only). */
const due = (s: Search, at = Date.now()) => s.every_days > 0 && (!s.last_run_at || at - Date.parse(s.last_run_at) >= s.every_days * 864e5 - 3 * 36e5);

/** The scheduled start (called by the cron every 5 minutes): when an hour set in Setări has just passed, on a chosen day,
 * a run starts with the searches that are due. One start per hour set (the slot is claimed in `settings`). */
export async function startScheduled(db: D1Database) {
  const slot = dueSlot(await getMarketSettings(db));
  if (!slot) return null;
  const claim = await db.prepare(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('market_slot', ?, ?, 'cron')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE settings.value <> excluded.value`).bind(slot, now()).run();
  if (!claim.meta.changes) return null;
  return { slot, ...(await startRun(db, "cron")) };
}

/** Starts a run: page 1 of the searches due (the schedule), of every enabled search („Pornește acum”) or of the given ones. */
export async function startRun(db: D1Database, trigger: "cron" | "manual", searchIds?: string[]) {
  const running = await db.prepare("SELECT id, started_at FROM market_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1").first<{ id: string; started_at: string }>();
  // a scheduled start does not pile onto a run still going
  if (running && trigger === "cron") return { runId: running.id, searches: 0, skipped: "o rulare e deja în desfășurare" };
  const { results: searches } = await db.prepare("SELECT * FROM market_searches WHERE enabled = 1").all<Search>();
  const pick = searches.filter((s) => (trigger === "cron" ? due(s) : !searchIds?.length || searchIds.includes(s.id)));
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
  let processed = 0, started = 0, details = 0;
  const active = await db.prepare("SELECT id FROM market_runs WHERE status = 'running' LIMIT 1").first<{ id: string }>();
  if (!active) {
    const long = budgetMs > 60_000;
    return { processed, started, idle: true, photos: long ? await retryPhotos(db, bucket, 20_000) : 0, contacts: long ? await backfillContacts(db, bucket, 25_000).catch(() => 0) : 0 };
  }
  const cfg = await getMarketSettings(db);
  const { concurrency } = cfg;
  // the limits of a run (Setări): past them it stops by itself; what is left is downloaded by the next run
  const lim = await db.prepare("SELECT started_at, COALESCE(json_extract(stats, '$.rulari_apify'), 0) AS apify FROM market_runs WHERE id = ?").bind(active.id).first<{ started_at: string; apify: number }>();
  const over = !lim ? null : cfg.max_apify && lim.apify >= cfg.max_apify ? `limita de ${cfg.max_apify} rulări Apify pe rulare`
    : cfg.max_hours && Date.now() - Date.parse(lim.started_at) > cfg.max_hours * 36e5 ? `limita de ${cfg.max_hours} ore pe rulare` : null;
  if (over) { await stopRun(db, over); return { processed, started, idle: false, stopped: over }; }

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
        if (j.kind === "list") await processList(db, j, item); else { await processDetail(db, bucket, j, item); details++; }
        await db.prepare("UPDATE market_jobs SET status = 'done', error = NULL, updated_at = ? WHERE id = ?").bind(now(), j.id).run();
        processed++;
      } catch (e) {
        await failJob(db, j, e, cfg.max_attempts);
      }
    }
    // the limit of Apify runs reached inside this pass
    if (cfg.max_apify && lim && lim.apify + started >= cfg.max_apify) {
      const why = `limita de ${cfg.max_apify} rulări Apify pe rulare`;
      await stopRun(db, why);
      return { processed, started, idle: false, stopped: why };
    }
    // 2. start new runs, up to the parallel limit
    const busy = (await db.prepare("SELECT COUNT(*) AS n FROM market_jobs WHERE status IN ('running', 'processing')").first<{ n: number }>())?.n ?? 0;
    const free = Math.min(concurrency - busy, cfg.max_apify && lim ? cfg.max_apify - lim.apify - started : Infinity);
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
    if (!open?.n) { await finishRun(db, bucket, active.id, cfg); break; }
    // wait a little for the runs in progress (Apify answers as soon as one finishes)
    if (!collected) {
      const oldest = await db.prepare("SELECT apify_run_id FROM market_jobs WHERE status = 'running' ORDER BY updated_at LIMIT 1").first<{ apify_run_id: string }>();
      const wait = Math.min(30, Math.floor((left() - Math.min(15_000, budgetMs / 4)) / 1000));
      if (oldest && wait > 0) await runStatus(oldest.apify_run_id, wait).catch(() => null);
      else if (wait <= 0) break;
      else await new Promise((r) => setTimeout(r, 3000));
    }
  }
  // the listings downloaded in this pass are matched with the ones of the other sites right away (not only when the run ends)
  if (details) await dedupe(db).catch((e) => console.warn("market: dedupe", String(e)));
  // processing jobs left by a pass that was cut off go back to the queue
  await db.prepare("UPDATE market_jobs SET status = 'running' WHERE status = 'processing' AND updated_at < ?").bind(new Date(Date.now() - 10 * 60_000).toISOString()).run();
  return { processed, started, idle: false };
}

async function failJob(db: D1Database, j: Job, e: unknown, maxAttempts: number) {
  const msg = String(e instanceof Error ? e.message : e).slice(0, 300);
  const final = j.attempts >= maxAttempts;
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
  let nNew = 0, nSame = 0, nQueued = 0, nLater = 0;
  // the search's limit of listings downloaded per run: the rest wait for the next run (their card is not marked as read)
  let room = search.max_details > 0
    ? Math.max(0, search.max_details - ((await db.prepare("SELECT COUNT(*) AS n FROM market_jobs WHERE run_id = ? AND search_id = ? AND kind = 'detail'").bind(j.run_id, search.id).first<{ n: number }>())?.n ?? 0))
    : Infinity;
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
        stmts.push(db.prepare("INSERT INTO market_listing_history (id, listing_id, at, event, price, currency, title, run_id) VALUES (?, ?, ?, 'reaparut', ?, ?, ?, ?)")
          .bind(uuid(), k.id, now(), c.price ?? null, c.currency ?? null, c.title ?? null, j.run_id));
        await bump(db, j.run_id, "reaparute");
      }
    }
    if (!k || k.fp_card !== fp || !k.fp_detail || k.status === "expirat") {
      if (room <= 0) { nLater++; continue; }
      room--; nQueued++;
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
  await bump(db, j.run_id, "amanate", nLater);
}

// ---------------------------------------------------------------- listing page

async function gzipJson(v: unknown) {
  const s = new Blob([JSON.stringify(v)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(s).arrayBuffer();
}

/** What changed between the listing as kept and as read now: old → new for the figures and the title, a flag for the rest. */
function diff(old: Record<string, unknown>, m: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of ["price", "currency", "usable_area", "built_area", "land_area", "title", "address", "zone"])
    if ((old[k] ?? null) !== (m[k] ?? null) && !(typeof old[k] === "string" && norm(old[k] as string) === norm(m[k] as string))) out[k] = [old[k] ?? null, m[k] ?? null];
  // the description before and after are kept (the listing itself only holds the latest)
  if (norm(old.description as string) !== norm(m.description as string)) out.description = [String(old.description ?? "").slice(0, 4000), String(m.description ?? "").slice(0, 4000)];
  if ((old.lat ?? null) !== (m.lat ?? null) || (old.lng ?? null) !== (m.lng ?? null)) out.location = true;
  if (!Object.keys(out).length) out.photos = true; // the fingerprint changed and nothing above did: the images
  return out;
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
      db.prepare("INSERT INTO market_listing_history (id, listing_id, at, event, price, currency, title, source_key, run_id) VALUES (?, ?, ?, 'expirat', ?, ?, ?, ?, ?)")
        .bind(uuid(), row.id, at, row.price ?? null, row.currency ?? null, row.title ?? null, bucket ? key : null, j.run_id),
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
  const contact = contactOf(row.source, item);
  const stmts: D1PreparedStatement[] = [
    db.prepare(`UPDATE market_listings SET title = ?, price = ?, currency = ?, price_sqm = ?, usable_area = ?, built_area = ?, land_area = ?, county = ?, city = ?, zone = ?,
        address = ?, lat = ?, lng = ?, geo_precision = ?, seller_kind = ?, seller_name = ?, description = ?, content_md = ?, features = ?, src_created_at = ?,
        src_updated_at = ?, deal = COALESCE(?, deal), fp_card = ?, fp_detail = ?, source_key = ?, status = 'activ', fetched_at = ?, error = NULL,
        contact_name = COALESCE(?, contact_name), contact_phone = COALESCE(?, contact_phone), contact_email = COALESCE(?, contact_email), contact_at = ?
        ${changed ? ", changed_at = ?" : ""} WHERE id = ?`)
      .bind(m.title ?? null, m.price ?? null, m.currency ?? null, m.price && area ? Math.round(((m.price as number) / area) * 100) / 100 : null,
        m.usable_area ?? null, m.built_area ?? null, m.land_area ?? null, m.county ?? null, m.city ?? null, m.zone ?? null, m.address ?? null,
        m.lat ?? null, m.lng ?? null, m.geo_precision ?? null, m.seller_kind ?? null, m.seller_name ?? null, m.description ?? null, md,
        JSON.stringify(d.features ?? {}), m.src_created_at ?? null, m.src_updated_at ?? null, d.transaction ?? null, j.card_fp, fp, bucket ? key : null, at,
        contact.name, contact.phone, contact.email, at, ...(changed ? [at] : []), row.id),
    db.prepare("DELETE FROM market_listings_fts WHERE listing_id = ?").bind(row.id),
    db.prepare("INSERT INTO market_listings_fts (listing_id, title, body) VALUES (?, ?, ?)").bind(row.id, (m.title as string) ?? "", `${m.description ?? ""}\n\n${md}`),
  ];
  if (changed) stmts.push(db.prepare("INSERT INTO market_listing_history (id, listing_id, at, event, price, currency, area, title, source_key, run_id, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(uuid(), row.id, at, first ? "nou" : "modificat", m.price ?? null, m.currency ?? null, area, m.title ?? null, bucket ? key : null, j.run_id,
      first ? null : JSON.stringify(diff(row, m))));
  photos.forEach((u, i) => stmts.push(db.prepare("INSERT OR IGNORE INTO market_listing_photos (id, listing_id, position, url) VALUES (?, ?, ?, ?)").bind(uuid(), row.id, i, u)));
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  await bump(db, j.run_id, first ? "descarcate_noi" : changed ? "modificate" : "neschimbate");
  if (bucket) await downloadPhotos(db, bucket, row.id, row.source, row.ext_id);
}

// ---------------------------------------------------------------- photos (R2)

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };

/** The image type from the first bytes (some CDNs answer with a generic content type). */
function sniff(b: Uint8Array) {
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "image/avif";
  return null;
}

async function downloadPhotos(db: D1Database, bucket: R2Bucket, listingId: string, source: string, extId: string) {
  const site = `https://${source.startsWith("www.") ? source : `www.${source}`}/`.replace("www.homezz.ro", "homezz.ro");
  const { results } = await db.prepare("SELECT id, position, url FROM market_listing_photos WHERE listing_id = ? AND r2_key IS NULL AND attempts < ? ORDER BY position")
    .bind(listingId, MAX_ATTEMPTS).all<{ id: string; position: number; url: string }>();
  for (let i = 0; i < results.length; i += 6) {
    await Promise.all(results.slice(i, i + 6).map(async (p) => {
      try {
        const r = await fetch(p.url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/jpeg,image/*;q=0.8", Referer: site }, signal: AbortSignal.timeout(20_000) });
        const declared = (r.headers.get("content-type") ?? "").split(";")[0].trim();
        if (!r.ok) throw new Error(`HTTP ${r.status} ${declared}`);
        const buf = await r.arrayBuffer();
        const type = sniff(new Uint8Array(buf, 0, Math.min(16, buf.byteLength))) ?? (declared.startsWith("image/") ? declared : null);
        if (!type || buf.byteLength < 500) throw new Error(`nu e imagine (${declared || "fără tip"}, ${buf.byteLength} B)`);
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

/** The contacts of the listings downloaded before they were kept: read from the archived page (R2), between runs. */
async function backfillContacts(db: D1Database, bucket: R2Bucket | null, budgetMs: number) {
  if (!bucket) return 0;
  const t0 = Date.now();
  const { results } = await db.prepare("SELECT id, source, source_key FROM market_listings WHERE contact_at IS NULL AND source_key IS NOT NULL AND status <> 'expirat' ORDER BY status = 'activ' DESC, fetched_at DESC LIMIT 150")
    .all<{ id: string; source: string; source_key: string }>();
  let n = 0;
  for (const r of results) {
    if (Date.now() - t0 > budgetMs) break;
    let c = { name: null as string | null, phone: null as string | null, email: null as string | null };
    try {
      const o = await bucket.get(r.source_key);
      if (o) c = contactOf(r.source, (await new Response(o.body.pipeThrough(new DecompressionStream("gzip"))).json()) as FetchItem);
    } catch { /* unreadable: marked as looked at */ }
    await db.prepare("UPDATE market_listings SET contact_name = ?, contact_phone = ?, contact_email = ?, contact_at = ? WHERE id = ?").bind(c.name, c.phone, c.email, now(), r.id).run();
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- cancel / progress

/** Stops the run in progress (the control panel, or a limit of the run): the queue is emptied, the Apify runs in progress
 * are aborted. Nothing is marked as missing (the searches were not read to the end); what was already downloaded stays. */
export async function stopRun(db: D1Database, why: string, userName?: string) {
  const run = await db.prepare("SELECT id, started_at FROM market_runs WHERE status = 'running' LIMIT 1").first<{ id: string; started_at: string }>();
  if (!run) return null;
  const { results: live } = await db.prepare("SELECT apify_run_id FROM market_jobs WHERE run_id = ? AND status = 'running' AND apify_run_id IS NOT NULL").bind(run.id).all<{ apify_run_id: string }>();
  await Promise.all(live.map((j) => abortRun(j.apify_run_id)));
  const left = (await db.prepare("SELECT COUNT(*) AS n FROM market_jobs WHERE run_id = ? AND status IN ('pending', 'running', 'processing')").bind(run.id).first<{ n: number }>())?.n ?? 0;
  await db.batch([
    db.prepare("UPDATE market_jobs SET status = 'error', error = 'oprită', updated_at = ? WHERE run_id = ? AND status IN ('pending', 'running', 'processing')").bind(now(), run.id),
    db.prepare("UPDATE market_searches SET last_complete = 0, last_error = COALESCE(last_error, 'rulare oprită') WHERE last_run_at = ? AND COALESCE(last_complete, 0) = 0").bind(run.started_at),
    db.prepare("UPDATE market_runs SET status = 'stopped', finished_at = ?, note = ?, stats = json_set(stats, '$.oprita_de', ?, '$.ramase_in_coada', ?) WHERE id = ?")
      .bind(now(), why, userName ?? "limită", left, run.id),
  ]);
  await snapshotRun(db, run.id);
  await dedupe(db);
  if (!userName) await notifyRun(db, run.id).catch((e) => console.warn("market: notify", String(e)));
  return run.id;
}
export const cancelRun = (db: D1Database, userName: string) => stopRun(db, `oprită de ${userName}`, userName);

export type RunDetail = {
  searches: { id: string; name: string; source: string; pages: number; pages_err: number; det_done: number; det_err: number; left: number; listings: number | null; complete: number | null; error: string | null }[];
  errors: { kind: string; source: string; search: string; page: number | null; url: string; listing_id: string | null; title: string | null; error: string | null; attempts: number }[];
};

/** Keeps what the queue knows about a run (per search, the pages and listings that failed) on the run itself: the jobs
 * are deleted when the next run ends. */
async function snapshotRun(db: D1Database, runId: string) {
  const [per, errs] = await Promise.all([
    db.prepare(`SELECT s.id, s.name, s.source, s.last_count AS listings, s.last_complete AS complete, s.last_error AS error,
        COALESCE(SUM(j.kind = 'list' AND j.status = 'done'), 0) AS pages, COALESCE(SUM(j.kind = 'list' AND j.status = 'error' AND COALESCE(j.error, '') <> 'oprită'), 0) AS pages_err,
        COALESCE(SUM(j.kind = 'detail' AND j.status = 'done'), 0) AS det_done, COALESCE(SUM(j.kind = 'detail' AND j.status = 'error' AND COALESCE(j.error, '') <> 'oprită'), 0) AS det_err,
        COALESCE(SUM(j.error = 'oprită'), 0) AS left
      FROM market_searches s JOIN market_jobs j ON j.search_id = s.id AND j.run_id = ? GROUP BY s.id ORDER BY s.name, s.source`).bind(runId).all<RunDetail["searches"][number]>(),
    db.prepare(`SELECT j.kind, s.source, s.name AS search, j.page, j.url, j.listing_id, l.title, j.error, j.attempts FROM market_jobs j
        JOIN market_searches s ON s.id = j.search_id LEFT JOIN market_listings l ON l.id = j.listing_id
      WHERE j.run_id = ? AND j.status = 'error' AND COALESCE(j.error, '') <> 'oprită' ORDER BY j.kind = 'list' DESC, j.updated_at LIMIT 300`).bind(runId).all<RunDetail["errors"][number]>(),
  ]);
  const detail: RunDetail = { searches: per.results, errors: errs.results };
  await db.prepare("UPDATE market_runs SET detail = ? WHERE id = ?").bind(JSON.stringify(detail), runId).run();
  return detail;
}

/** The e-mail with the summary of a scheduled run (Setări: never / only with errors / always). */
async function notifyRun(db: D1Database, runId: string) {
  const cfg = await getMarketSettings(db);
  if (cfg.notify === "never" || !cfg.notify_to) return;
  const run = await db.prepare("SELECT trigger, status, started_at, finished_at, stats, note, detail FROM market_runs WHERE id = ?").bind(runId)
    .first<{ trigger: string; status: string; started_at: string; finished_at: string | null; stats: string; note: string | null; detail: string | null }>();
  if (!run || run.trigger !== "cron") return;
  let st: Record<string, number> = {}, det: RunDetail = { searches: [], errors: [] };
  try { st = JSON.parse(run.stats); det = run.detail ? JSON.parse(run.detail) : det; } catch { /* empty */ }
  const bad = run.status === "stopped" || det.errors.length > 0 || det.searches.some((x) => x.pages_err > 0);
  if (cfg.notify === "errors" && !bad) return;
  const url = `${(process.env.CRM_URL || "https://crm.valuefy.ro").replace(/\/$/, "")}/setari/piata/rulari/${runId}`;
  const lines = [["Anunțuri noi", st.descarcate_noi ?? st.anunturi_noi ?? 0], ["Modificate", st.modificate ?? 0], ["Expirate", st.expirate ?? 0], ["Dispărute", st.devenite_inactive ?? 0],
    ["Reapărute", st.reaparute ?? 0], ["Pagini / anunțuri eșuate", `${st.pagini_esuate ?? 0} / ${st.anunturi_esuate ?? 0}`], ["Rulări Apify", st.rulari_apify ?? 0]] as [string, string | number][];
  const title = run.status === "stopped" ? `Rularea de piață s-a oprit: ${run.note ?? ""}` : bad ? "Rularea de piață s-a încheiat cu erori" : "Rularea de piață s-a încheiat";
  const body = `<table cellpadding="0" cellspacing="0" style="font-size:14px">${lines.map(([k, v]) => `<tr><td style="padding:3px 18px 3px 0;color:#666">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join("")}</table>`
    + (det.searches.filter((x) => x.error).length ? `<p style="font-size:13px">${det.searches.filter((x) => x.error).map((x) => `${esc(x.name)} (${esc(x.source)}): ${esc(x.error)}`).join("<br>")}</p>` : "");
  const text = `${title}\n${lines.map(([k, v]) => `${k}: ${v}`).join("\n")}\n${url}`;
  const html = layout({ eyebrow: "Analize de piață", title, body, button: { label: "Vezi rularea", url }, foot: "Trimis automat de CRM (Setări › Analize de piață)." });
  for (const to of cfg.notify_to.split(",").map((x) => x.trim()).filter(Boolean)) await sendEmail({ to, subject: title, html, text });
}

export type RunProgress = {
  run: { id: string; trigger: string; status: string; started_at: string; finished_at: string | null; stats: Record<string, number | string> } | null;
  searches: { id: string; name: string; source: string; pages_done: number; pages_open: number; pages_err: number; det_done: number; det_open: number; det_err: number; listings: number; complete: number | null; error: string | null }[];
  totals: { pages_done: number; pages_open: number; det_done: number; det_open: number; det_err: number; running: number };
  recent: { at: string; title: string | null; source: string; listing_id: string | null; kind: string; status: string; error: string | null }[];
  eta_min: number | null;
  photos: { saved: number; pending: number; failed: number; last_error: string | null };
};

/** What the control panel shows: the current (or last) run, per search, the latest jobs, an estimate of the time left. */
export async function runProgress(db: D1Database): Promise<RunProgress> {
  const run = await db.prepare("SELECT id, trigger, status, started_at, finished_at, stats FROM market_runs ORDER BY status = 'running' DESC, started_at DESC LIMIT 1")
    .first<{ id: string; trigger: string; status: string; started_at: string; finished_at: string | null; stats: string }>();
  const ph = await db.prepare(`SELECT COALESCE(SUM(r2_key IS NOT NULL), 0) AS saved, COALESCE(SUM(r2_key IS NULL AND attempts < 3), 0) AS pending,
      COALESCE(SUM(r2_key IS NULL AND attempts >= 3), 0) AS failed,
      (SELECT error FROM market_listing_photos WHERE r2_key IS NULL AND error IS NOT NULL ORDER BY rowid DESC LIMIT 1) AS last_error FROM market_listing_photos`)
    .first<RunProgress["photos"]>() ?? { saved: 0, pending: 0, failed: 0, last_error: null };
  const photos = ph ?? { saved: 0, pending: 0, failed: 0, last_error: null };
  if (!run) return { run: null, searches: [], totals: { pages_done: 0, pages_open: 0, det_done: 0, det_open: 0, det_err: 0, running: 0 }, recent: [], eta_min: null, photos };
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
  return { run: { ...run, stats }, searches: per.results, totals, recent: recent.results, eta_min, photos };
}

// ---------------------------------------------------------------- end of a run

async function finishRun(db: D1Database, bucket: R2Bucket | null, runId: string, cfg: MarketSettings) {
  const run = await db.prepare("SELECT started_at FROM market_runs WHERE id = ?").bind(runId).first<{ started_at: string }>();
  if (!run) return;
  // only the searches read to the last page: a listing missing from them is counted (inactive after 3 runs)
  const { results: complete } = await db.prepare("SELECT id FROM market_searches WHERE last_run_at = ? AND last_complete = 1").bind(run.started_at).all<{ id: string }>();
  let gone = 0;
  for (const s of complete) {
    await db.prepare("UPDATE market_listings SET missing_runs = missing_runs + 1 WHERE search_id = ? AND status = 'activ' AND last_seen_at < ?").bind(s.id, run.started_at).run();
    const { results: out } = await db.prepare("SELECT id, price, currency, title FROM market_listings WHERE search_id = ? AND status = 'activ' AND missing_runs >= ?")
      .bind(s.id, cfg.missing_limit).all<{ id: string; price: number | null; currency: string | null; title: string | null }>();
    const stmts = out.flatMap((r) => [
      db.prepare("UPDATE market_listings SET status = 'inactiv' WHERE id = ?").bind(r.id),
      db.prepare("INSERT INTO market_listing_history (id, listing_id, at, event, price, currency, title, run_id) VALUES (?, ?, ?, 'disparut', ?, ?, ?, ?)").bind(uuid(), r.id, now(), r.price, r.currency, r.title, runId),
    ]);
    for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
    gone += out.length;
  }
  await bump(db, runId, "devenite_inactive", gone);
  const groups = await dedupe(db);
  await db.prepare("UPDATE market_runs SET status = 'done', finished_at = ?, stats = json_set(stats, '$.grupuri_duplicate', ?) WHERE id = ?").bind(now(), groups, runId).run();
  await snapshotRun(db, runId);
  await notifyRun(db, runId).catch((e) => console.warn("market: notify", String(e)));
  // the finished jobs are no longer needed (the errors stay one more run, for the page)
  await db.prepare("DELETE FROM market_jobs WHERE run_id <> ? AND run_id IN (SELECT id FROM market_runs WHERE status IN ('done', 'stopped'))").bind(runId).run();
  await retryPhotos(db, bucket, 20_000);
}

type DupRow = { id: string; source: string; category: string | null; transaction: string | null; price: number | null; currency: string | null; lat: number | null; lng: number | null;
  city: string | null; usable_area: number | null; built_area: number | null; land_area: number | null; dup_group: string | null; dup_reason: string | null;
  seller_name: string | null; d: string | null; geo_precision: string | null; photo_count: number | null; first_seen_at: string };

/** How good a listing is as the face of its group: exact point, photos, area, price; then the oldest. */
const mainScore = (r: DupRow) => (r.lat != null ? (/exact/i.test(r.geo_precision ?? "") ? 4 : 2) : 0) + ((r.photo_count ?? 0) > 0 ? 2 : 0) + (mainArea(r) ? 1 : 0) + (r.price ? 1 : 0);

/**
 * Merges the same property listed on several sites (or twice on one) into a group, by rules (no AI):
 *  1. the same image file;
 *  2. the same description (the agency's text copied across portals), close price;
 *  3. close on the map, same area and price;
 *  4. no point on one of them: same town, same area and price.
 * Each rule can be turned off and has its thresholds in Setări (defaults: 250 m, area ±3%, price ±5%; text: price ±10%; town: area ±1%).
 * Rules 3 and 4 do not apply to two listings of one seller on one site (the similar units of a development).
 * The group takes the id of its best listing (the one shown in lists; the others stay as its sources).
 */
export async function dedupe(db: D1Database) {
  const { results: rows } = await db.prepare(`SELECT id, source, category, deal AS "transaction", price, currency, lat, lng, city, usable_area, built_area, land_area, dup_group, dup_reason,
    seller_name, substr(description, 1, 500) AS d, geo_precision, photo_count, first_seen_at FROM market_listings WHERE status = 'activ'`).all<DupRow>();
  const cfg = await getMarketSettings(db);
  const DUP = { meters: cfg.dup_meters, area: cfg.dup_area / 100, price: cfg.dup_price / 100, textPrice: cfg.dup_text_price / 100, cityArea: cfg.dup_city_area / 100 };
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
  const near = (p1: number, p2: number, tol: number) => Math.abs(p1 - p2) <= tol * Math.max(p1, p2);
  // 1. the same image file (a photo shared by more than 4 listings is a logo or placeholder)
  const { results: same } = await db.prepare(`SELECT group_concat(DISTINCT p.listing_id) AS ids FROM market_listing_photos p JOIN market_listings l ON l.id = p.listing_id
    WHERE p.sha1 IS NOT NULL AND l.status = 'activ' GROUP BY p.sha1 HAVING COUNT(DISTINCT p.listing_id) BETWEEN 2 AND 4`).all<{ ids: string }>();
  if (cfg.dup_image) for (const g of same) { const ids = g.ids.split(",").filter((x) => parent.has(x)); ids.slice(1).forEach((b) => union(ids[0], b, "imagine identică")); }
  // 2. the same description (long enough to mean something; a text shared by more than 6 listings is a template)
  const texts = new Map<string, DupRow[]>();
  for (const r of rows) {
    const t = norm(r.d).replace(/[^a-z0-9 ]/g, "").slice(0, 300);
    if (t.length < 150) continue;
    const k = `${r.category}|${r.transaction}|${t}`;
    if (!texts.has(k)) texts.set(k, []);
    texts.get(k)!.push(r);
  }
  for (const g of texts.values()) {
    if (!cfg.dup_text || g.length < 2 || g.length > 6) continue;
    for (const b of g.slice(1)) if (!g[0].price || !b.price || (g[0].currency === b.currency && near(g[0].price, b.price, DUP.textPrice))) union(g[0].id, b.id, "aceeași descriere");
  }
  // 3 and 4. close (or the same town), same area and price
  const by = new Map<string, { a: number; r: DupRow }[]>();
  for (const r of rows) {
    const a = mainArea(r);
    if (!a || !r.price) continue;
    const k = `${r.category}|${r.transaction}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push({ a, r });
  }
  for (const list of by.values()) {
    if (!cfg.dup_geo && !cfg.dup_city) break;
    list.sort((x, y) => x.a - y.a);
    const reach = Math.max(cfg.dup_geo ? DUP.area : 0, cfg.dup_city ? DUP.cityArea : 0);
    for (let i = 0; i < list.length; i++) {
      const { a: a1, r: r1 } = list[i];
      for (let k = i + 1; k < list.length && list[k].a <= a1 * (1 + reach); k++) {
        const r2 = list[k].r;
        if (r1.currency !== r2.currency || !near(r1.price!, r2.price!, DUP.price)) continue;
        if (r1.source === r2.source && r1.seller_name && r1.seller_name === r2.seller_name) continue;
        if (r1.lat != null && r2.lat != null && r1.lng != null && r2.lng != null) {
          const dy = (r1.lat - r2.lat) * 111_320, dx = (r1.lng - r2.lng) * 111_320 * Math.cos((r1.lat * Math.PI) / 180);
          if (cfg.dup_geo && list[k].a <= a1 * (1 + DUP.area) && Math.hypot(dx, dy) <= DUP.meters) union(r1.id, r2.id, "locație + suprafață + preț");
        } else if (cfg.dup_city && norm(r1.city) && norm(r1.city) === norm(r2.city) && Math.abs(list[k].a - a1) <= DUP.cityArea * a1) union(r1.id, r2.id, "localitate + suprafață + preț");
      }
    }
  }
  // the groups, each named after its best listing
  const groups = new Map<string, DupRow[]>();
  for (const r of rows) { const root = find(r.id); if (!groups.has(root)) groups.set(root, []); groups.get(root)!.push(r); }
  const stmts: D1PreparedStatement[] = [];
  let n = 0;
  for (const g of groups.values()) {
    const main = g.length > 1 ? [...g].sort((x, y) => mainScore(y) - mainScore(x) || x.first_seen_at.localeCompare(y.first_seen_at) || x.id.localeCompare(y.id))[0].id : null;
    if (main) n++;
    for (const r of g) {
      const m = main ? why.get(r.id) ?? null : null;
      if (r.dup_group !== main || r.dup_reason !== m) stmts.push(db.prepare("UPDATE market_listings SET dup_group = ?, dup_reason = ? WHERE id = ?").bind(main, m, r.id));
    }
  }
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  return n;
}
