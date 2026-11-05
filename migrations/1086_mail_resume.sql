-- Emailuri primite: a rule can also put a suspended report back in work ("Reia raportul suspendat"): the bank says the
-- information asked for was provided. The email keeps the report it acted on.
ALTER TABLE bank_emails ADD COLUMN report_id TEXT;
INSERT INTO mail_rules (id, name, sort, body_has, ref_after, ref_shape, client_after, action, bank_id)
SELECT 'rule-brd-info', 'BRD: informații primite → reia raportul', 30, 'au fost puse la dispozitie | documentele suplimentare solicitate', 'cererea cu ID | ID', 'EVA | REV', 'client', 'resume_report',
  (SELECT id FROM entities WHERE kind IN ('bank', 'ifn') AND (upper(code) = 'BRD' OR upper(name) LIKE 'BRD%') ORDER BY upper(code) = 'BRD' DESC, approved DESC LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM mail_rules WHERE id = 'rule-brd-info');
