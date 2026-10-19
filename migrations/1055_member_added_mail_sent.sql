-- When (and by whom) someone was put in a report's team: the "Raport alocat" alert counts from it.
ALTER TABLE report_members ADD COLUMN added_at TEXT;
ALTER TABLE report_members ADD COLUMN added_by TEXT;
-- Alerts sent by email: what was already emailed to the user (like push_sent_at for the phone).
ALTER TABLE users ADD COLUMN mail_sent_at TEXT;
