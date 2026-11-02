-- A collaborator's order: the order's chat is shared with the collaborator (portal + email). Only the messages written
-- since (shared = 1) are shown in the portal; the older ones stay the team's.
ALTER TABLE messages ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;

-- Documents asked of the collaborator from the order (like a missing document on a report): fulfilled when one is
-- uploaded for it in the portal (doc_id), or withdrawn by the team.
CREATE TABLE IF NOT EXISTS order_doc_requests (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders(id),
  name          TEXT NOT NULL,
  note          TEXT,
  requested_by  TEXT,
  requested_at  TEXT NOT NULL,
  doc_id        TEXT,
  done_at       TEXT,
  cancelled_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_doc_requests_order ON order_doc_requests(order_id, requested_at);
