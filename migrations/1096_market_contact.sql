-- Anunțuri de piață: datele de contact din anunț (persoana sau agenția, telefoane, e-mail), cum apar în pagina descărcată.
ALTER TABLE market_listings ADD COLUMN contact_name TEXT;
ALTER TABLE market_listings ADD COLUMN contact_phone TEXT;            -- unul sau mai multe, separate prin virgulă
ALTER TABLE market_listings ADD COLUMN contact_email TEXT;
ALTER TABLE market_listings ADD COLUMN contact_at TEXT;               -- când s-au căutat ultima dată în pagina anunțului (și dacă nu s-a găsit nimic)
