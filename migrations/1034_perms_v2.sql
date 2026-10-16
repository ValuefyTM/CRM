-- Permissions v2 (Setări → Permisiuni): roles × modules, rights inside the report team.
-- "Inspector" is no longer a role in the firm: evaluators also inspect, and "inspector" is a role in a report's team.
UPDATE users SET role = 'evaluator' WHERE kind = 'internal' AND role = 'inspector';

-- Fee shares are set by the owner on the user's page and summed on the monthly statement (by delivery date).
-- share_evaluator / share_verifier exist since 1003; the inspection fee is fixed (lei) or a % of the report fee.
ALTER TABLE users ADD COLUMN inspector_fee_kind TEXT;   -- fixed | pct
ALTER TABLE users ADD COLUMN inspector_fee REAL;

-- The verifier finishes the review (or sends the report back to the main evaluator with a comment).
ALTER TABLE reports ADD COLUMN verified_at TEXT;
ALTER TABLE reports ADD COLUMN verified_by TEXT REFERENCES users(id);
