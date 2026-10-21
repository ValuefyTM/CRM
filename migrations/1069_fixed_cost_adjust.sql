-- A fixed cost varies from month to month: an adjustment (+ / −) for one month, with its explanation.
CREATE TABLE IF NOT EXISTS fixed_cost_adjustments (
  cost_id    TEXT NOT NULL REFERENCES fixed_costs(id) ON DELETE CASCADE,
  period     TEXT NOT NULL,          -- YYYY-MM
  amount     REAL NOT NULL,          -- added to the monthly amount (negative: less)
  note       TEXT,
  changed_by TEXT,
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (cost_id, period)
);
