-- Which documents the inspector sees: ticked per document in the report (NULL = the default: the CF extract and the
-- floor survey yes, the rest no). It replaces the list chosen once when the inspection was given (inspections.doc_refs),
-- so documents uploaded later reach the inspector too.
ALTER TABLE report_documents ADD COLUMN insp_visible INTEGER;
ALTER TABLE order_documents ADD COLUMN insp_visible INTEGER;

-- The lists chosen so far on open inspections become the ticks of their report's documents.
UPDATE report_documents SET insp_visible = CASE WHEN EXISTS (
    SELECT 1 FROM inspections i, json_each(i.doc_refs) j
    WHERE i.report_id = report_documents.report_id AND i.status IN ('to_schedule', 'scheduled') AND i.doc_refs IS NOT NULL AND j.value = report_documents.id
  ) THEN 1 ELSE 0 END
  WHERE kind = 'source' AND EXISTS (
    SELECT 1 FROM inspections i WHERE i.report_id = report_documents.report_id AND i.status IN ('to_schedule', 'scheduled') AND i.doc_refs IS NOT NULL AND i.glide_id IS NULL);
