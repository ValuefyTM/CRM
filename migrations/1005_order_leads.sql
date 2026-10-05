-- Valuation requests from the valuefy.ro assistant become orders automatically (source = 'site').
-- order_leads links each such order to its request in the website's "leads" table (same database).
-- (A separate table rather than a new column on orders: nothing to alter, safe to apply on any state.)
CREATE TABLE IF NOT EXISTS order_leads (
  order_id   TEXT PRIMARY KEY REFERENCES orders(id),
  lead_id    TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
