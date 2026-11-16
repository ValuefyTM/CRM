-- Anunțuri de piață: județul, localitatea și zona ca chei de filtrare (fără diacritice, fără „Județul”, „Municipiul”…),
-- ca „Timiș” / „Timis” / „Județul Timiș” de pe site-uri diferite să fie același filtru.
ALTER TABLE market_listings ADD COLUMN loc_county TEXT;
ALTER TABLE market_listings ADD COLUMN loc_city TEXT;
ALTER TABLE market_listings ADD COLUMN loc_zone TEXT;
ALTER TABLE market_listings ADD COLUMN loc_at TEXT;
CREATE INDEX IF NOT EXISTS idx_market_listings_loc ON market_listings(loc_county, loc_city, loc_zone);
