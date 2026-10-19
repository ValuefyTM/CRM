-- Alert "inspection done, report not collected" per framework contract / collaboration (Setări → Facturare):
-- days after the inspection (NULL = no alert) and to whom (evaluator | ops | both).
ALTER TABLE contracts ADD COLUMN collect_alert_days INTEGER;
ALTER TABLE contracts ADD COLUMN collect_alert_to TEXT;
ALTER TABLE collaborations ADD COLUMN collect_alert_days INTEGER;
ALTER TABLE collaborations ADD COLUMN collect_alert_to TEXT;
