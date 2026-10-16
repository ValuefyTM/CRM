-- When the user last opened the notifications bell (what came after is shown as new).
ALTER TABLE users ADD COLUMN notif_seen_at TEXT;
