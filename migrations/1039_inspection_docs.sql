-- The documents of the report the inspector may open for an inspection, chosen when it is given (a JSON list of
-- report document ids). Empty (NULL): the CF extract and floor survey of the asset, as before.
ALTER TABLE inspections ADD COLUMN doc_refs TEXT;
