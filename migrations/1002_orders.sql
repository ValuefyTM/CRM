-- Valuation orders placed from the portal (by partner users for their clients, or by clients for themselves)
-- and the documents uploaded with them (files live in R2, bucket valuefy-documents).

CREATE TABLE IF NOT EXISTS orders (
  id                  TEXT PRIMARY KEY,
  seq                 INTEGER NOT NULL UNIQUE,          -- shown as CO-<seq>
  source              TEXT NOT NULL,                    -- 'partner' | 'client'
  created_by          TEXT NOT NULL REFERENCES users(id),
  partner_id          TEXT REFERENCES partners(id),     -- partner orders: the firm (all its people see the order)
  -- property
  property_type       TEXT NOT NULL,                    -- see PROPERTY_TYPES in src/lib/order-labels.ts
  city                TEXT NOT NULL,
  address             TEXT NOT NULL,
  surface_area        REAL,
  land_area           REAL,
  rooms               INTEGER,
  -- purpose and deadline
  purpose             TEXT NOT NULL,
  bank                TEXT,
  urgent              INTEGER NOT NULL DEFAULT 0,
  -- client (for partner orders: the partner's client)
  client_name         TEXT NOT NULL,
  client_phone        TEXT NOT NULL,
  client_email        TEXT,
  -- inspection
  contact_name        TEXT,                             -- when someone else shows the property
  contact_phone       TEXT,
  inspection_notes    TEXT,
  may_contact_client  INTEGER NOT NULL DEFAULT 1,
  notes               TEXT,                             -- remarks from whoever placed the order
  -- progress (processing comes in a later phase)
  status              TEXT NOT NULL DEFAULT 'received',
  docs_missing        INTEGER NOT NULL DEFAULT 0,
  viewed_at           TEXT,                             -- first opened in the CRM
  viewed_by           TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_partner ON orders(partner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_creator ON orders(created_by, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_documents (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders(id),
  kind          TEXT NOT NULL,                          -- document key (see DOCS) or 'other'
  filename      TEXT NOT NULL,
  content_type  TEXT,
  size_bytes    INTEGER NOT NULL,
  r2_key        TEXT NOT NULL,
  uploaded_by   TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_order_documents_order ON order_documents(order_id);
