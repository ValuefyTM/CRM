-- Anunțuri de piață: numărul de camere, extras separat (din câmpurile site-ului sau din titlu).
ALTER TABLE market_listings ADD COLUMN rooms INTEGER;
ALTER TABLE market_listings ADD COLUMN rooms_at TEXT;                 -- când s-a căutat (și dacă nu s-a găsit)
CREATE INDEX IF NOT EXISTS idx_market_listings_rooms ON market_listings(rooms);
