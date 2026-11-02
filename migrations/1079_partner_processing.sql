-- A collaborator's portal order processed without an offer, on a collaborating firm: it is worked through a new
-- collaboration order, linked here (the portal shows that order's report, and the collaborator hears when it is done).
ALTER TABLE orders ADD COLUMN linked_order_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_linked ON orders(linked_order_id);
