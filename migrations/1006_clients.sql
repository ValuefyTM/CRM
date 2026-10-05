-- Clients managed in the CRM: address details on entities, contact people of companies,
-- and the link between a client and its portal account(s).
ALTER TABLE entities ADD COLUMN city TEXT;
ALTER TABLE entities ADD COLUMN county TEXT;
ALTER TABLE entities ADD COLUMN vat_payer INTEGER;      -- companies: registered for VAT (from ANAF)
ALTER TABLE entities ADD COLUMN caen TEXT;
ALTER TABLE entities ADD COLUMN created_by TEXT;

CREATE TABLE IF NOT EXISTS entity_contacts (
  id          TEXT PRIMARY KEY,
  entity_id   TEXT NOT NULL REFERENCES entities(id),
  name        TEXT NOT NULL,
  role        TEXT,                                     -- function in the company (administrator, contabil…)
  phone       TEXT,
  email       TEXT,
  is_primary  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_entity_contacts_entity ON entity_contacts(entity_id);

-- Portal accounts of clients point to the client (person or company) they belong to.
ALTER TABLE users ADD COLUMN entity_id TEXT REFERENCES entities(id);
CREATE INDEX IF NOT EXISTS idx_users_entity ON users(entity_id);
CREATE INDEX IF NOT EXISTS idx_entities_cui ON entities(cui);
CREATE INDEX IF NOT EXISTS idx_entities_email ON entities(email);
