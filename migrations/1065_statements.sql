-- Borderouri (statements), monthly. Two kinds: "payout" — what the firm owes one of its collaborators (a user:
-- the shares as main evaluator / verifier, the inspection fees, a commission on the reports they brought, a fixed
-- monthly amount); "receivable" — what a framework-contract client (a bank) or a collaborating firm owes for the
-- reports delivered in the month. A statement is computed live ("în curs") until the owner validates it (the lines
-- are then frozen) and issues it (numbered). Adjustments (lines added, removed, amounts changed) keep who, when, why.
ALTER TABLE statements ADD COLUMN kind TEXT;                  -- payout | receivable
ALTER TABLE statements ADD COLUMN party TEXT;                 -- u:<user id> | k:<contract id> | c:<collaboration id>
ALTER TABLE statements ADD COLUMN period TEXT;                -- YYYY-MM
ALTER TABLE statements ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE statements ADD COLUMN collaboration_id TEXT REFERENCES collaborations(id);
ALTER TABLE statements ADD COLUMN status TEXT NOT NULL DEFAULT 'open';   -- open | validated | issued
ALTER TABLE statements ADD COLUMN validated_at TEXT;
ALTER TABLE statements ADD COLUMN validated_by TEXT;
ALTER TABLE statements ADD COLUMN issued_by TEXT;
ALTER TABLE statements ADD COLUMN notes TEXT;
ALTER TABLE statements ADD COLUMN criteria TEXT;              -- JSON: the rule as it was when validated
ALTER TABLE statements ADD COLUMN updated_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_statements_party_period ON statements(party, period) WHERE party IS NOT NULL;

-- Who gets a statement and on what: the criteria and the recurrence.
CREATE TABLE IF NOT EXISTS statement_rules (
  id               TEXT PRIMARY KEY,
  kind             TEXT NOT NULL,                       -- payout | receivable
  party            TEXT NOT NULL UNIQUE,                -- u:<user id> | k:<contract id> | c:<collaboration id>
  user_id          TEXT REFERENCES users(id),
  contract_id      TEXT REFERENCES contracts(id),
  collaboration_id TEXT REFERENCES collaborations(id),
  recurrence       TEXT NOT NULL DEFAULT 'monthly',     -- monthly (every month, shown in progress) | manual (only when opened)
  basis            TEXT NOT NULL DEFAULT 'delivered',   -- which reports count in a month: delivered | collected
  inc_evaluator    INTEGER NOT NULL DEFAULT 1,          -- payout: the share as main evaluator
  inc_verifier     INTEGER NOT NULL DEFAULT 1,          -- payout: the share as verifier
  inc_inspector    INTEGER NOT NULL DEFAULT 1,          -- payout: the inspection fee (inspections done in the month)
  referral_pct     REAL,                                -- payout: % of the fee of the reports they brought (Recomandată de)
  fixed_amount     REAL,                                -- payout: a fixed monthly amount
  fixed_label      TEXT,
  active           INTEGER NOT NULL DEFAULT 1,
  notes            TEXT,
  created_by       TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The lines: automatic ones (frozen at validation; before that, stored only when adjusted) and manual ones.
CREATE TABLE IF NOT EXISTS statement_lines (
  id            TEXT PRIMARY KEY,
  statement_id  TEXT NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  key           TEXT,                                   -- automatic line: rep:<report>:<source>, insp:<inspection>, fixed; NULL = manual
  source        TEXT NOT NULL,                          -- evaluator | verifier | inspector | referral | fixed | report | manual
  report_id     TEXT REFERENCES reports(id),
  inspection_id TEXT REFERENCES inspections(id),
  label         TEXT NOT NULL,
  detail        TEXT,
  on_date       TEXT,                                   -- the delivery / inspection date
  base          REAL,                                   -- the fee it was computed from
  rate          TEXT,                                   -- "70%" / "150 lei"
  auto_amount   REAL,                                   -- the computed amount
  amount        REAL NOT NULL,                          -- the amount on the statement (after an adjustment)
  removed       INTEGER NOT NULL DEFAULT 0,
  reason        TEXT,                                   -- why it was removed / changed / added
  changed_by    TEXT,
  changed_at    TEXT,
  sort          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_statement_lines_st ON statement_lines(statement_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_statement_lines_key ON statement_lines(statement_id, key) WHERE key IS NOT NULL;
