-- Hale / spații industriale de vânzare în județul Timiș (orice suprafață), pe lângă căutările de închiriere din 1092.
-- Crawlerul le aduce cu pagina completă și pozele în R2 (valuefy-market), cu deduplicare între site-uri.
INSERT OR IGNORE INTO market_searches (id, name, source, url, category, type, deal) VALUES
  ('hale-vanz-tm-imobiliare', 'Hale de vânzare, jud. Timiș', 'imobiliare.ro', 'https://www.imobiliare.ro/vanzare-spatii-industriale/judetul-timis', 'INDUSTRIAL', NULL, 'vanzare'),
  ('hale-vanz-tm-storia', 'Hale de vânzare, jud. Timiș', 'storia.ro', 'https://www.storia.ro/ro/rezultate/vanzare/depozite-hale/timis', 'INDUSTRIAL', NULL, 'vanzare'),
  ('hale-vanz-tm-olx', 'Hale de vânzare, jud. Timiș', 'olx.ro', 'https://www.olx.ro/imobiliare/industrial/devanzare/timis-judet/', 'INDUSTRIAL', NULL, 'vanzare'),
  ('hale-vanz-tm-publi24', 'Hale de vânzare, jud. Timiș', 'publi24.ro', 'https://www.publi24.ro/anunturi/imobiliare/de-vanzare/spatii-comerciale/hala-industriala/timis/', 'INDUSTRIAL', NULL, 'vanzare'),
  ('hale-vanz-tm-homezz', 'Hale de vânzare, jud. Timiș', 'homezz.ro', 'https://homezz.ro/vanzare-spatii-industriale/timis', 'INDUSTRIAL', NULL, 'vanzare');
-- Căutările de închiriere hale rămân / redevin active.
UPDATE market_searches SET enabled = 1 WHERE id LIKE 'hale-inch-tm-%';
