-- Analize de piață: istoric pe fiecare rulare, programare avansată, căutări noi pe storia.ro și publi24.ro.

-- Fiecare eveniment din istoricul unui anunț ține minte rularea care l-a produs și ce anume s-a schimbat.
ALTER TABLE market_listing_history ADD COLUMN run_id TEXT;
ALTER TABLE market_listing_history ADD COLUMN changes TEXT;           -- JSON: { price: [vechi, nou], title: [...], description: true, ... }
CREATE INDEX IF NOT EXISTS idx_market_history_run ON market_listing_history(run_id, event);
-- evenimentele vechi: rularea în intervalul căreia au apărut
UPDATE market_listing_history SET run_id = (SELECT r.id FROM market_runs r WHERE r.started_at <= market_listing_history.at
    AND (r.finished_at IS NULL OR r.finished_at >= market_listing_history.at) ORDER BY r.started_at DESC LIMIT 1) WHERE run_id IS NULL;

-- Rularea: rezumatul pe căutări și erorile, păstrate la închidere (coada de lucru se șterge), și motivul opririi.
ALTER TABLE market_runs ADD COLUMN detail TEXT;
ALTER TABLE market_runs ADD COLUMN note TEXT;

-- Căutarea: cât de des intră în rulările programate (zile; 0 = doar la cerere) și câte anunțuri descarcă cel mult pe rulare (0 = fără limită).
ALTER TABLE market_searches ADD COLUMN every_days INTEGER NOT NULL DEFAULT 1;
ALTER TABLE market_searches ADD COLUMN max_details INTEGER NOT NULL DEFAULT 0;

-- Căutări noi pe storia.ro și publi24.ro (Timișoara). Cel mult 300 de anunțuri descărcate pe rulare, ca prima încărcare să se întindă pe câteva nopți.
INSERT OR IGNORE INTO market_searches (id, name, source, url, category, type, deal, max_pages, max_details) VALUES
  ('ap-vanz-tm-storia', 'Apartamente de vânzare, Timișoara', 'storia.ro', 'https://www.storia.ro/ro/rezultate/vanzare/apartament/timis/timisoara', 'REZIDENTIAL', 'APARTAMENT IN BLOC', 'vanzare', 20, 300),
  ('case-vanz-tm-storia', 'Case de vânzare, Timișoara', 'storia.ro', 'https://www.storia.ro/ro/rezultate/vanzare/casa/timis/timisoara', 'REZIDENTIAL', 'CASA CU TEREN', 'vanzare', 20, 300),
  ('ap-vanz-tm-publi24', 'Apartamente de vânzare, Timișoara', 'publi24.ro', 'https://www.publi24.ro/anunturi/imobiliare/de-vanzare/apartamente/timis/timisoara/', 'REZIDENTIAL', 'APARTAMENT IN BLOC', 'vanzare', 20, 300),
  ('case-vanz-tm-publi24', 'Case de vânzare, Timișoara', 'publi24.ro', 'https://www.publi24.ro/anunturi/imobiliare/de-vanzare/case/timis/timisoara/', 'REZIDENTIAL', 'CASA CU TEREN', 'vanzare', 20, 300),
  ('teren-vanz-tm-publi24', 'Terenuri de vânzare, Timișoara', 'publi24.ro', 'https://www.publi24.ro/anunturi/imobiliare/de-vanzare/terenuri/timis/timisoara/', 'TEREN', NULL, 'vanzare', 20, 300);
