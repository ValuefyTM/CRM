-- A framework contract can be closed (the bank ended the agreement): it keeps its history but takes no new orders and
-- leaves the list of framework contracts.
ALTER TABLE contracts ADD COLUMN closed_on TEXT;
ALTER TABLE contracts ADD COLUMN closed_by TEXT;
ALTER TABLE contracts ADD COLUMN closed_note TEXT;
