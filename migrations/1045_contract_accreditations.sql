-- Agreeri: team members accredited by a bank on a framework contract. Whatever their role says, they may register the
-- bank's orders on that contract (Lucrare nouă), process them and run their reports (Utilizatori → Agreeri).
CREATE TABLE IF NOT EXISTS contract_accreditations (
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by  TEXT,
  PRIMARY KEY (contract_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_contract_accreditations_user ON contract_accreditations(user_id);
