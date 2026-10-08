-- Invoicing through Oblio. Direct clients are invoiced from their classic contract; under a framework contract or a
-- collaboration the rule is set per contract: none (not from the CRM), per order once the report is approved (e.g.
-- BRD), or monthly on the statement.
ALTER TABLE contracts ADD COLUMN billing_mode TEXT;        -- none | per_order | monthly (framework); NULL = default
ALTER TABLE collaborations ADD COLUMN billing_mode TEXT;   -- none | per_order | monthly

CREATE TABLE IF NOT EXISTS invoices (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL DEFAULT 'invoice',            -- invoice | proforma
  series        TEXT NOT NULL,
  number        TEXT NOT NULL,
  issue_date    TEXT NOT NULL,
  due_date      TEXT,
  client_id     TEXT REFERENCES entities(id),             -- who is invoiced (client, bank, collaborating firm)
  client_name   TEXT,
  contract_id   TEXT REFERENCES contracts(id),
  collaboration_id TEXT REFERENCES collaborations(id),
  statement_id  TEXT REFERENCES statements(id),
  report_ids    TEXT,                                      -- JSON list of the reports on the invoice
  lines         TEXT,                                      -- JSON: the lines sent to Oblio
  net           REAL,
  vat           REAL,
  total         REAL,
  currency      TEXT NOT NULL DEFAULT 'RON',
  status        TEXT NOT NULL DEFAULT 'issued',            -- issued | paid | cancelled
  paid_at       TEXT,
  oblio_link    TEXT,                                      -- the PDF link Oblio returned
  r2_key        TEXT,                                      -- our copy of the PDF
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (kind, series, number)
);
CREATE INDEX IF NOT EXISTS idx_invoices_contract ON invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status, issue_date);
-- The invoice a report was billed on (per-order billing, direct clients).
ALTER TABLE reports ADD COLUMN invoice_id TEXT REFERENCES invoices(id);
