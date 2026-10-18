-- A report invoiced straight in Oblio (not from the CRM): the billing task is closed without an invoice of the CRM.
ALTER TABLE reports ADD COLUMN billed_outside_at TEXT;
ALTER TABLE reports ADD COLUMN billed_outside_by TEXT;
ALTER TABLE reports ADD COLUMN billed_outside_ref TEXT;   -- the invoice's series and number, when given
