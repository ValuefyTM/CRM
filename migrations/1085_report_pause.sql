-- A suspended report's time is on pause: suspended_at is when the pause began (while suspended), paused_days the
-- working days of the pauses that ended; the days counter and the term leave them out.
ALTER TABLE reports ADD COLUMN suspended_at TEXT;
ALTER TABLE reports ADD COLUMN paused_days INTEGER NOT NULL DEFAULT 0;
-- the reports suspended now: on pause since their last change of status (the history), else their last change
UPDATE reports SET suspended_at = COALESCE(
    (SELECT MAX(a.at) FROM audit_log a WHERE a.entity = 'report' AND a.entity_id = reports.id AND a.action = 'report.status' AND a.details LIKE '%→ Suspendat%'),
    updated_at, created_at)
  WHERE status = 'suspended';
