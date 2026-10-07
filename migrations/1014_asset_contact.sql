-- Who shows each asset at the inspection (the client by default, or the owner / an agent / someone else).
-- Kept on the asset, so it pre-fills the inspection task whenever it is given or reallocated.
ALTER TABLE assets ADD COLUMN contact_kind TEXT;   -- client | owner | agent | other
ALTER TABLE assets ADD COLUMN contact_name TEXT;
ALTER TABLE assets ADD COLUMN contact_phone TEXT;
