-- Bank orders that arrive by email (BCR, BRD…): every message received on the intake address, what was read from it,
-- and the order it created. The email only has the bank's request id and the client's name; the rest is filled in
-- when the order is processed (screenshot of the bank app, or by hand).
CREATE TABLE IF NOT EXISTS bank_emails (
  id           TEXT PRIMARY KEY,
  received_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  via          TEXT NOT NULL DEFAULT 'email',          -- email (intake address) | paste (pasted in the CRM)
  mail_from    TEXT,
  mail_to      TEXT,
  subject      TEXT,
  body         TEXT,                                   -- plain text, trimmed
  bank         TEXT,                                   -- BCR | BRD | … (null: not recognised)
  bank_ref     TEXT,
  client_name  TEXT,
  request_type TEXT,                                   -- e.g. "Prima evaluare" (BCR "Codul cererii")
  link         TEXT,                                   -- link to the request in the bank's app
  status       TEXT NOT NULL DEFAULT 'new',            -- order | duplicate | unrecognised | ignored
  order_id     TEXT REFERENCES orders(id),
  created_by   TEXT REFERENCES users(id)               -- pasted by
);
CREATE INDEX IF NOT EXISTS idx_bank_emails_received ON bank_emails(received_at);
CREATE INDEX IF NOT EXISTS idx_bank_emails_ref ON bank_emails(bank, bank_ref);

-- Where a bank order came from (email) and when it was processed (client and assets filled in, file opened).
ALTER TABLE orders ADD COLUMN intake TEXT;                -- email | paste | form
ALTER TABLE orders ADD COLUMN bank_link TEXT;
ALTER TABLE orders ADD COLUMN processed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_bank_ref ON orders(bank_id, bank_ref);
