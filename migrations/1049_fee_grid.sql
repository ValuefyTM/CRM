-- Framework contracts: the bank's fee grid by kind of main asset (apartment, house with land, free land), JSON:
--   { "vat": true | false, "rates": { "apartament": 450, "casa": 600, "teren": 500 } }   (vat: the amounts include VAT)
ALTER TABLE contracts ADD COLUMN fee_grid TEXT;
-- The result of the valuation on delivery: each asset's value in euro (at the BNR rate of the report's date) and the totals.
ALTER TABLE assets ADD COLUMN value_eur REAL;
ALTER TABLE reports ADD COLUMN result_eur REAL;
ALTER TABLE reports ADD COLUMN eur_rate REAL;
