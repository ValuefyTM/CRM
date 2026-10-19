-- The report number of a collaborating firm, typed with the order (VALUEFY's reports are numbered automatically).
ALTER TABLE orders ADD COLUMN collab_report_number TEXT;

-- Reports opened from the CRM on a collaboration order are issued on the collaborating firm, not on VALUEFY.
UPDATE reports SET issuer_id = (SELECT c.firm_id FROM orders o JOIN collaborations c ON c.id = o.collaboration_id WHERE o.id = reports.order_id)
  WHERE glide_id IS NULL AND order_id IN (SELECT id FROM orders WHERE collaboration_id IS NOT NULL);

-- VALUEFY's reports opened from the CRM without a number get the next ones of the series, in the order they were opened.
UPDATE reports SET number = CAST(
    (SELECT COALESCE(MAX(CAST(x.number AS INTEGER)), 0) FROM reports x WHERE x.issuer_id = reports.issuer_id AND x.number GLOB '[0-9]*')
    + (SELECT COUNT(*) FROM reports y WHERE y.issuer_id = reports.issuer_id AND y.glide_id IS NULL AND (y.number IS NULL OR y.number = '')
        AND y.status <> 'cancelled' AND (y.created_at < reports.created_at OR (y.created_at = reports.created_at AND y.id <= reports.id)))
  AS TEXT)
  WHERE glide_id IS NULL AND (number IS NULL OR number = '') AND status <> 'cancelled'
    AND issuer_id = (SELECT id FROM entities WHERE kind = 'valuation_firm' AND upper(name) LIKE 'VALUEFY%' LIMIT 1);
