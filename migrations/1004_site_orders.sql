-- Valuation requests from the valuefy.ro assistant become orders automatically (source = 'site').
-- lead_id links the order to the request in the website's "leads" table (same database).
ALTER TABLE orders ADD COLUMN lead_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_lead ON orders(lead_id);
