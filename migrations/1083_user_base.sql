-- Where a team member's inspections are measured from on the statements: the office, or their own base address
-- (an inspector's home, a collaborator's base).
ALTER TABLE users ADD COLUMN distance_from TEXT NOT NULL DEFAULT 'office';
-- The base address of a team member (an inspector's home, a collaborator's base): the distance of their inspections
-- on the statements is counted from it (else from the office).
ALTER TABLE users ADD COLUMN base_address TEXT;
ALTER TABLE users ADD COLUMN base_lat REAL;
ALTER TABLE users ADD COLUMN base_lng REAL;
ALTER TABLE users ADD COLUMN base_note TEXT;
