-- Some assets are valued without an inspection in the CRM (desktop valuation, inspected earlier or by someone else):
-- the asset is marked so, with the reason, and does not wait for an inspection task.
ALTER TABLE assets ADD COLUMN no_inspection TEXT;      -- reason; empty: the asset needs an inspection
ALTER TABLE assets ADD COLUMN no_inspection_at TEXT;
ALTER TABLE assets ADD COLUMN no_inspection_by TEXT;
