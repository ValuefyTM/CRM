-- Who can be what in a report's team (ticks on the profile: evaluator, verifier, inspector), kept in users.duties.
-- Existing accounts: whoever has an ANEVAR card may do all three (as the lists worked until now; the owner unticks
-- what does not apply); inspectors keep inspecting; the rest start with nothing ticked.
UPDATE users SET duties = 'evaluator,verifier,inspector' WHERE kind = 'internal' AND NULLIF(TRIM(COALESCE(anevar_no, '')), '') IS NOT NULL;
UPDATE users SET duties = 'inspector' WHERE kind = 'internal' AND role = 'inspector' AND (duties IS NULL OR duties = '');
UPDATE users SET duties = '' WHERE kind = 'internal' AND duties IS NULL;
