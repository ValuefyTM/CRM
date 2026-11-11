-- What a file of the report's working folder („Dosar de lucru”) is, as the valuer marks it: the signed PDF delivered is the
-- row with kind = 'final'; the working grid and the report in Word are marked here (one of each per report).
ALTER TABLE report_documents ADD COLUMN role TEXT;   -- grid | word
