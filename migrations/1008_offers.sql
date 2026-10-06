-- Valuation offers for orders (portal and website): fee, timeline, documents and the terms of reference,
-- opened by the client on a public page (portal.valuefy.ro/oferta/<token>) where they accept and sign.
CREATE TABLE IF NOT EXISTS offers (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders(id),
  number           TEXT NOT NULL UNIQUE,                 -- OF-2026-0001
  token            TEXT NOT NULL UNIQUE,                 -- secret part of the public link
  status           TEXT NOT NULL DEFAULT 'draft',        -- draft | sent | accepted | declined
  client_name      TEXT,
  client_email     TEXT,
  fee              REAL NOT NULL,                        -- report fee, without VAT
  travel_fee       REAL,                                 -- null/0 = included
  travel_label     TEXT,
  urgent_fee       REAL,                                 -- optional express delivery, without VAT (null = not offered)
  vat_rate         REAL NOT NULL DEFAULT 21,
  term_days        INTEGER NOT NULL,                     -- working days from the inspection
  urgent_days      INTEGER,
  valid_until      TEXT NOT NULL,                        -- YYYY-MM-DD
  payment_terms    TEXT,
  evaluator_id     TEXT REFERENCES users(id),
  message          TEXT,                                 -- personal note shown at the top
  object_text      TEXT,
  value_type       TEXT,
  approaches       TEXT,
  standards        TEXT,
  documents        TEXT,                                 -- JSON [{ label, received, optional }]
  terms            TEXT,                                 -- terms of reference: "## Title" sections
  sent_at          TEXT,
  sent_to          TEXT,
  viewed_at        TEXT,
  accepted_at      TEXT,
  accepted_name    TEXT,
  accepted_urgent  INTEGER,
  signature        TEXT,                                 -- PNG data URL drawn by the client
  accepted_ip      TEXT,
  accepted_ua      TEXT,
  content_hash     TEXT,                                 -- SHA-256 of what was accepted
  declined_at      TEXT,
  decline_reason   TEXT,
  created_by       TEXT REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_offers_order ON offers(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
