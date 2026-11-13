-- Anunțuri de piață (comparabile din imobiliare.ro, storia.ro, olx.ro, publi24.ro, homezz.ro), aduse noaptea prin Apify.
-- Sursa completă a fiecărei pagini și imaginile stau în bucketul R2 separat `valuefy-market` (binding MARKET).

-- Ce se caută: o pagină de rezultate de pe un site (copiată din browser, cu filtrele dorite). Paginarea e automată.
CREATE TABLE IF NOT EXISTS market_searches (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  source        TEXT NOT NULL,                       -- imobiliare.ro | storia.ro | olx.ro | publi24.ro | homezz.ro
  url           TEXT NOT NULL,
  category      TEXT,                                -- categoria din CRM: REZIDENTIAL, COMERCIAL, INDUSTRIAL, TEREN…
  type          TEXT,                                -- tipul din CRM (opțional), ex. SPATIU DE DEPOZITARE SI LOGISTICA
  deal          TEXT NOT NULL DEFAULT 'vanzare',     -- tranzacția: vanzare | inchiriere
  enabled       INTEGER NOT NULL DEFAULT 1,
  max_pages     INTEGER NOT NULL DEFAULT 20,
  last_run_at   TEXT,
  last_complete INTEGER,                             -- 1 = toate paginile citite (abia atunci se marchează anunțurile dispărute)
  last_count    INTEGER,
  last_error    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- O rulare (noaptea sau „Rulează acum”); se desfășoară pe mai multe declanșări ale cronului, prin cozile de mai jos.
CREATE TABLE IF NOT EXISTS market_runs (
  id          TEXT PRIMARY KEY,
  trigger     TEXT NOT NULL,                         -- cron | manual
  status      TEXT NOT NULL DEFAULT 'running',       -- running | done
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  stats       TEXT NOT NULL DEFAULT '{}'
);

-- Coada de lucru: o pagină de rezultate (list) sau o pagină de anunț (detail) = o rulare Apify.
CREATE TABLE IF NOT EXISTS market_jobs (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  kind          TEXT NOT NULL,                       -- list | detail
  search_id     TEXT NOT NULL,
  listing_id    TEXT,
  url           TEXT NOT NULL,
  page          INTEGER,
  card_fp       TEXT,                                -- detail: amprenta cardului care a cerut descărcarea (se salvează după succes)
  status        TEXT NOT NULL DEFAULT 'pending',     -- pending | running | done | error
  apify_run_id  TEXT,
  dataset_id    TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_market_jobs_status ON market_jobs(status, kind, created_at);
CREATE INDEX IF NOT EXISTS idx_market_jobs_run ON market_jobs(run_id, kind, search_id);

-- Un anunț (sursa + ID-ul de pe site = cheia unică).
CREATE TABLE IF NOT EXISTS market_listings (
  id              TEXT PRIMARY KEY,
  source          TEXT NOT NULL,
  ext_id          TEXT NOT NULL,                     -- ID-ul anunțului pe site
  url             TEXT NOT NULL,
  search_id       TEXT,                              -- ultima căutare care l-a găsit
  category        TEXT,
  type            TEXT,
  deal            TEXT,                              -- vanzare | inchiriere
  title           TEXT,
  price           REAL,
  currency        TEXT,
  price_sqm       REAL,                              -- preț / suprafața principală
  usable_area     REAL,
  built_area      REAL,
  land_area       REAL,
  county          TEXT,
  city            TEXT,
  zone            TEXT,
  address         TEXT,
  lat             REAL,
  lng             REAL,
  geo_precision   TEXT,                              -- exactă | aproximativă (rază …) | punct pe hartă (precizie nedeclarată)
  seller_kind     TEXT,                              -- agentie | proprietar
  seller_name     TEXT,                              -- numele agenției (nu date de contact)
  description     TEXT,
  content_md      TEXT,                              -- toată pagina, markdown curățat (căutare)
  features        TEXT,                              -- JSON: restul caracteristicilor de pe site
  src_created_at  TEXT,
  src_updated_at  TEXT,
  fp_card         TEXT,                              -- amprenta din pagina de rezultate (preț, suprafață, titlu)
  fp_detail       TEXT,                              -- amprenta paginii de anunț (modificări reale)
  source_key      TEXT,                              -- R2 (MARKET): ultima sursă completă salvată, json.gz
  photo_count     INTEGER NOT NULL DEFAULT 0,
  cover_key       TEXT,                              -- R2 (MARKET): prima imagine
  status          TEXT NOT NULL DEFAULT 'activ',     -- activ | inactiv | expirat
  missing_runs    INTEGER NOT NULL DEFAULT 0,
  dup_group       TEXT,                              -- id-ul anunțului principal al grupului de duplicate
  dup_reason      TEXT,
  first_seen_at   TEXT NOT NULL,
  last_seen_at    TEXT NOT NULL,
  fetched_at      TEXT,
  changed_at      TEXT,
  error           TEXT,
  UNIQUE (source, ext_id)
);
CREATE INDEX IF NOT EXISTS idx_market_listings_cat ON market_listings(category, deal, status);
CREATE INDEX IF NOT EXISTS idx_market_listings_geo ON market_listings(lat, lng);
CREATE INDEX IF NOT EXISTS idx_market_listings_search ON market_listings(search_id, status);
CREATE INDEX IF NOT EXISTS idx_market_listings_dup ON market_listings(dup_group);

-- Istoricul: apariția, modificările (preț!), dispariția și reapariția.
CREATE TABLE IF NOT EXISTS market_listing_history (
  id          TEXT PRIMARY KEY,
  listing_id  TEXT NOT NULL,
  at          TEXT NOT NULL,
  event       TEXT NOT NULL,                         -- nou | modificat | disparut | reaparut | expirat
  price       REAL,
  currency    TEXT,
  area        REAL,
  title       TEXT,
  source_key  TEXT
);
CREATE INDEX IF NOT EXISTS idx_market_history_listing ON market_listing_history(listing_id, at);

-- Imaginile, copiate în R2 (MARKET).
CREATE TABLE IF NOT EXISTS market_listing_photos (
  id          TEXT PRIMARY KEY,
  listing_id  TEXT NOT NULL,
  position    INTEGER NOT NULL,
  url         TEXT NOT NULL,                         -- adresa originală
  r2_key      TEXT,                                  -- NULL până la descărcare
  sha1        TEXT,
  bytes       INTEGER,
  attempts    INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  UNIQUE (listing_id, url)
);
CREATE INDEX IF NOT EXISTS idx_market_photos_pending ON market_listing_photos(r2_key, attempts);
CREATE INDEX IF NOT EXISTS idx_market_photos_sha ON market_listing_photos(sha1);

-- Căutare text în titlu + descriere + tot conținutul paginii (fără diacritice).
CREATE VIRTUAL TABLE IF NOT EXISTS market_listings_fts USING fts5(listing_id UNINDEXED, title, body, tokenize = 'unicode61 remove_diacritics 2');

-- Căutările de pornire: hale de închiriat în județul Timiș și terenuri de vânzare în Timișoara.
INSERT OR IGNORE INTO market_searches (id, name, source, url, category, type, deal) VALUES
  ('hale-inch-tm-imobiliare', 'Hale de închiriat, jud. Timiș', 'imobiliare.ro', 'https://www.imobiliare.ro/inchirieri-spatii-industriale/judetul-timis', 'INDUSTRIAL', NULL, 'inchiriere'),
  ('hale-inch-tm-storia', 'Hale de închiriat, jud. Timiș', 'storia.ro', 'https://www.storia.ro/ro/rezultate/inchiriere/depozite-hale/timis', 'INDUSTRIAL', NULL, 'inchiriere'),
  ('hale-inch-tm-olx', 'Hale de închiriat, jud. Timiș', 'olx.ro', 'https://www.olx.ro/imobiliare/industrial/deinchiriat/timis-judet/', 'INDUSTRIAL', NULL, 'inchiriere'),
  ('hale-inch-tm-publi24', 'Hale de închiriat, jud. Timiș', 'publi24.ro', 'https://www.publi24.ro/anunturi/imobiliare/de-inchiriat/spatii-comerciale/hala-industriala/timis/', 'INDUSTRIAL', NULL, 'inchiriere'),
  ('hale-inch-tm-homezz', 'Hale de închiriat, jud. Timiș', 'homezz.ro', 'https://homezz.ro/inchiriere-spatii-industriale/timis', 'INDUSTRIAL', NULL, 'inchiriere'),
  ('teren-vanz-tm-imobiliare', 'Terenuri de vânzare, Timișoara', 'imobiliare.ro', 'https://www.imobiliare.ro/vanzare-terenuri/timisoara', 'TEREN', NULL, 'vanzare'),
  ('teren-vanz-tm-storia', 'Terenuri de vânzare, Timișoara', 'storia.ro', 'https://www.storia.ro/ro/rezultate/vanzare/teren/timis/timisoara', 'TEREN', NULL, 'vanzare');
