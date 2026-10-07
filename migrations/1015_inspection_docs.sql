-- Documents the inspector takes to the visit: the land book extract (CF) and the floor survey (releveu, RLV).
-- A report document can be marked as one of them, for one asset of the report or for all of them (asset_id empty).
ALTER TABLE report_documents ADD COLUMN doc_type TEXT;   -- cf | rlv | other (empty: guessed from the file name)
ALTER TABLE report_documents ADD COLUMN asset_id TEXT;   -- the asset it belongs to; empty: the whole report
