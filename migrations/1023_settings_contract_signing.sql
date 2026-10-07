-- Firm settings edited from the CRM (Setări): VALUEFY's details on contracts, stamp and signature (R2 keys).
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);

-- Online signing of a classic contract by the client: the secret link, its life, and the evidence of the signature
-- (name, drawn signature, IP, browser, the exact content signed and its hash).
ALTER TABLE contracts ADD COLUMN sign_token TEXT;
ALTER TABLE contracts ADD COLUMN sign_sent_at TEXT;
ALTER TABLE contracts ADD COLUMN sign_sent_to TEXT;
ALTER TABLE contracts ADD COLUMN sign_viewed_at TEXT;
ALTER TABLE contracts ADD COLUMN signed_at TEXT;
ALTER TABLE contracts ADD COLUMN signed_name TEXT;
ALTER TABLE contracts ADD COLUMN signed_signature TEXT;
ALTER TABLE contracts ADD COLUMN signed_ip TEXT;
ALTER TABLE contracts ADD COLUMN signed_ua TEXT;
ALTER TABLE contracts ADD COLUMN signed_hash TEXT;
ALTER TABLE contracts ADD COLUMN signed_snapshot TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_sign_token ON contracts(sign_token);
