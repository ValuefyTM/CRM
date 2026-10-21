-- When the CRM learnt that an inspection was done (the phone app, UVALO's sync, marked by hand): the alert
-- "Inspecție realizată" is sent from that moment, also when the inspection itself was finished earlier.
ALTER TABLE inspections ADD COLUMN done_logged_at TEXT;
