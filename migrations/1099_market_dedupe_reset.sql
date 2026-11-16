-- Anunțuri de piață: grupurile de duplicate făcute cu regulile vechi (imagine, apropiere pe hartă, zonă + titlu) se desfac.
-- Comasarea se reface la următoarea trecere a cronului (cel mult 5 minute), doar după descriere + preț + suprafață.
UPDATE market_listings SET dup_group = NULL, dup_reason = NULL WHERE dup_group IS NOT NULL;
DELETE FROM settings WHERE key = 'market_dedupe';
