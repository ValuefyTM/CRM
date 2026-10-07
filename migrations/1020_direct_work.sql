-- Direct work (a client of VALUEFY, classic contract): it is kept as an order of source 'direct', so the offer, the
-- history and the statistics follow the same path as portal orders. Its assets wait on the order until the report opens
-- (straight away, or when the client accepts the offer).
ALTER TABLE orders ADD COLUMN assets_json TEXT;
-- The classic contract of a report opened from an order is generated automatically.
CREATE INDEX IF NOT EXISTS idx_contracts_kind_number ON contracts(kind, number);
CREATE INDEX IF NOT EXISTS idx_reports_contract ON reports(contract_id);
