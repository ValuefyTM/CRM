-- Emailuri primite: every email received on the intake address (or pasted) is kept; rules (pattern → action) decide what
-- it becomes — a processing task for a bank order, a plain task, or nothing (ignored). Tasks stay open until someone
-- processes them; the people the rule notifies see them, with a reminder every 2 hours.
CREATE TABLE IF NOT EXISTS mail_rules (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1,
  sort           INTEGER NOT NULL DEFAULT 0,
  from_has       TEXT,                     -- the sender contains (any of, "|"-separated)
  subject_has    TEXT,                     -- the subject contains
  body_has       TEXT,                     -- the text (subject + body) contains
  ref_after      TEXT,                     -- the order number: the code after this text
  ref_shape      TEXT,                     -- or a code shape: letters then digits, e.g. "EVA" / "EV" / "REV" ("|"-separated)
  client_after   TEXT,                     -- the client's name: the words after this text (to the end of the line / a full stop)
  type_after     TEXT,                     -- the request type, after this text
  action         TEXT NOT NULL DEFAULT 'bank_order', -- bank_order | task | ignore
  bank_id        TEXT REFERENCES entities(id),
  task_title     TEXT,                     -- plain task: the title, with {ref} {client}
  notify_roles   TEXT,                     -- csv of roles (owner, admin, operator, …)
  notify_users   TEXT,                     -- csv of user ids
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT,
  updated_by     TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS mail_tasks (
  id           TEXT PRIMARY KEY,
  email_id     TEXT REFERENCES bank_emails(id),
  rule_id      TEXT REFERENCES mail_rules(id),
  kind         TEXT NOT NULL DEFAULT 'bank_order', -- bank_order | task
  title        TEXT NOT NULL,
  bank_id      TEXT REFERENCES entities(id),
  ref          TEXT,
  client_name  TEXT,
  request_type TEXT,
  notify_roles TEXT,
  notify_users TEXT,
  status       TEXT NOT NULL DEFAULT 'open',       -- open | done | dismissed
  created_at   TEXT NOT NULL,
  opened_at    TEXT,
  opened_by    TEXT REFERENCES users(id),
  done_at      TEXT,
  done_by      TEXT REFERENCES users(id),
  done_note    TEXT,
  order_id     TEXT REFERENCES orders(id)
);
CREATE INDEX IF NOT EXISTS idx_mail_tasks_open ON mail_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_mail_tasks_ref ON mail_tasks(ref);

ALTER TABLE bank_emails ADD COLUMN rule_id TEXT;
ALTER TABLE bank_emails ADD COLUMN task_id TEXT;

-- The two rules to start with (from the banks' notices), editable in Emailuri primite → Reguli.
INSERT INTO mail_rules (id, name, sort, body_has, ref_after, ref_shape, client_after, type_after, action, bank_id, notify_roles)
SELECT 'rule-brd', 'Procesare comandă BRD', 10, 'selectata pentru realizarea | selectat pentru realizarea | Alocare comanda', 'cererii | evaluarii | evaluari | comanda', 'EVA | REV', 'client', NULL, 'bank_order',
  (SELECT id FROM entities WHERE kind IN ('bank', 'ifn') AND (upper(code) = 'BRD' OR upper(name) LIKE 'BRD%') ORDER BY upper(code) = 'BRD' DESC, approved DESC LIMIT 1), 'owner,admin,operator'
WHERE NOT EXISTS (SELECT 1 FROM mail_rules WHERE id = 'rule-brd');
INSERT INTO mail_rules (id, name, sort, body_has, ref_after, ref_shape, client_after, type_after, action, bank_id, notify_roles)
SELECT 'rule-bcr', 'Procesare comandă BCR', 20, 'ID de cerere | aplicatia de Valuator', 'ID de cerere: | ID-ul', 'EV', 'Numele clientului:', 'Codul cererii:', 'bank_order',
  (SELECT id FROM entities WHERE kind IN ('bank', 'ifn') AND (upper(code) = 'BCR' OR upper(name) LIKE 'BCR%' OR upper(name) LIKE '%BANCA COMERCIAL_ ROM_N%') ORDER BY upper(code) = 'BCR' DESC, approved DESC LIMIT 1), 'owner,admin,operator'
WHERE NOT EXISTS (SELECT 1 FROM mail_rules WHERE id = 'rule-bcr');

-- The attachments of the emails received (kept in R2), for the documents of the order when it is processed.
CREATE TABLE IF NOT EXISTS mail_attachments (
  id           TEXT PRIMARY KEY,
  email_id     TEXT NOT NULL REFERENCES bank_emails(id),
  filename     TEXT NOT NULL,
  content_type TEXT,
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  r2_key       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mail_attachments_email ON mail_attachments(email_id);
