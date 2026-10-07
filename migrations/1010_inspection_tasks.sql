-- Inspection task: the main evaluator of a report gives the inspection of an asset to themselves or to a colleague
-- (inspector / evaluator). The inspector then schedules it from the inspections app.
ALTER TABLE inspections ADD COLUMN assigned_by TEXT REFERENCES users(id);
ALTER TABLE inspections ADD COLUMN assigned_at TEXT;
ALTER TABLE inspections ADD COLUMN due_on TEXT;                    -- YYYY-MM-DD: inspection to be done by
ALTER TABLE inspections ADD COLUMN instructions TEXT;              -- from the evaluator to the inspector
ALTER TABLE inspections ADD COLUMN cancelled_at TEXT;
ALTER TABLE inspections ADD COLUMN cancelled_by TEXT REFERENCES users(id);
