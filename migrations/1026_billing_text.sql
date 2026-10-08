-- What a framework contract's / collaboration's invoices say (each bank asks for different references): the service
-- name, the line description and the mentions, with placeholders filled from the report ({contract}, {client},
-- {comanda}…). JSON; empty = the default text.
ALTER TABLE contracts ADD COLUMN billing_text TEXT;
ALTER TABLE collaborations ADD COLUMN billing_text TEXT;
