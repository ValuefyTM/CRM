-- Fixed monthly costs (rent, salaries, subscriptions…), set by the owner, counted in the month's profit next to the
-- statements. Each runs from a month, optionally to a month.
CREATE TABLE IF NOT EXISTS fixed_costs (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  amount      REAL NOT NULL,
  from_period TEXT NOT NULL,          -- YYYY-MM
  to_period   TEXT,                   -- YYYY-MM, inclusive; NULL = still running
  notes       TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
