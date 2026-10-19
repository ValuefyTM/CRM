-- The public page of an offer (portal.valuefy.ro/oferta/<token>): the client reads, accepts and signs it, as with the
-- offers made on orders.
ALTER TABLE quotes ADD COLUMN token TEXT;
ALTER TABLE quotes ADD COLUMN sent_to TEXT;
ALTER TABLE quotes ADD COLUMN message TEXT;
ALTER TABLE quotes ADD COLUMN payment_terms TEXT;
ALTER TABLE quotes ADD COLUMN viewed_at TEXT;
ALTER TABLE quotes ADD COLUMN accepted_name TEXT;
ALTER TABLE quotes ADD COLUMN signature TEXT;
ALTER TABLE quotes ADD COLUMN accepted_ip TEXT;
ALTER TABLE quotes ADD COLUMN content_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS quotes_token ON quotes(token);
