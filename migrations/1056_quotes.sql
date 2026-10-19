-- Oferte: the offers made to clients before any order or contract exists (a note not to forget them), converted later
-- into direct work (classic contract) or a collaboration order.
CREATE TABLE IF NOT EXISTS quotes (
  id              TEXT PRIMARY KEY,
  seq             INTEGER UNIQUE,                       -- OF-<seq>
  status          TEXT NOT NULL DEFAULT 'draft',        -- draft | sent | accepted | declined | converted
  client_id       TEXT REFERENCES entities(id),
  client_kind     TEXT NOT NULL DEFAULT 'person',       -- person | company
  client_name     TEXT NOT NULL,
  client_phone    TEXT,
  client_email    TEXT,
  client_cui      TEXT,
  purpose         TEXT,
  report_type     TEXT,
  fee             REAL,                                 -- without VAT, lei
  term_days       INTEGER,
  valid_until     TEXT,
  urgent          INTEGER NOT NULL DEFAULT 0,
  assets_json     TEXT NOT NULL DEFAULT '[]',           -- the assets as typed in the form
  inspection_notes TEXT,
  notes           TEXT,
  channel         TEXT,                                 -- direct | collab (how it will be converted, when known)
  collaboration_id TEXT REFERENCES collaborations(id),
  sent_at         TEXT,
  sent_via        TEXT,                                 -- email | whatsapp | phone | meeting
  decided_at      TEXT,
  decline_reason  TEXT,
  converted_at    TEXT,
  order_id        TEXT REFERENCES orders(id),
  contract_id     TEXT REFERENCES contracts(id),
  report_id       TEXT REFERENCES reports(id),
  created_by      TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS quotes_status ON quotes(status, updated_at);
CREATE INDEX IF NOT EXISTS quotes_client ON quotes(client_id);
