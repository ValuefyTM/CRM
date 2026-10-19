-- The fee with VAT, when it is known as such (a grid "cu TVA", or typed with VAT when invoicing): the invoice is then
-- issued in Oblio with the VAT included, so its total is exactly this amount (no rounding of the net fee).
ALTER TABLE orders ADD COLUMN fee_gross REAL;
ALTER TABLE reports ADD COLUMN fee_gross REAL;
