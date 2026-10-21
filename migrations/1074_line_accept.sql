-- An adjustment on a payout statement (a line changed, removed or added by the firm, with its comment) is accepted by
-- the collaborator it is for: when and by whom. Changing the line again asks for a new acceptance.
ALTER TABLE statement_lines ADD COLUMN accepted_at TEXT;
ALTER TABLE statement_lines ADD COLUMN accepted_by TEXT;
