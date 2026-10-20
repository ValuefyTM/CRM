-- Orders (from the website, partners, clients) cancelled by hand, with the reason; offers get the status "cancelled"
-- (its reason in decline_reason). Cancelled ones leave the alerts, the bell and the dashboard.
ALTER TABLE orders ADD COLUMN cancel_reason TEXT;
ALTER TABLE orders ADD COLUMN cancelled_at TEXT;
ALTER TABLE orders ADD COLUMN cancelled_by TEXT;
