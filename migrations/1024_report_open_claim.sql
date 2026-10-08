-- An order opens its report(s) once: the first request claims it (two clicks, or a staff click while the client signs
-- the offer, no longer open two report sets and two contracts).
ALTER TABLE orders ADD COLUMN report_opened_at TEXT;
UPDATE orders SET report_opened_at = COALESCE((SELECT MIN(r.created_at) FROM reports r WHERE r.order_id = orders.id), updated_at)
  WHERE EXISTS (SELECT 1 FROM reports r WHERE r.order_id = orders.id);
