-- Anunțuri de piață: corecturi după primele rulări.
-- imobiliare.ro și publi24.ro: localitatea era zona (acum: județ › oraș › zonă din calea paginii), iar imobiliare.ro avea
-- adresele imaginilor greșite. Anunțurile lor se descarcă din nou la rularea următoare (amprenta ștearsă), imaginile
-- nedescărcate ale imobiliare.ro se refac din pagina anunțului, iar celelalte imagini eșuate se mai încearcă o dată.
DELETE FROM market_listing_photos WHERE r2_key IS NULL AND listing_id IN (SELECT id FROM market_listings WHERE source = 'imobiliare.ro');
UPDATE market_listings SET fp_card = NULL WHERE source IN ('imobiliare.ro', 'publi24.ro');
UPDATE market_listing_photos SET attempts = 0, error = NULL WHERE r2_key IS NULL;
