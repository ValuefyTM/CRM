-- Expertize judiciare: preluarea din portal.just.ro (ședințe, soluții, termenul următor) și monitorizarea dosarului.

-- Ședința luată din portal ține completul, tipul soluției, soluția pe scurt și documentul ședinței.
ALTER TABLE expert_case_terms ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';   -- manual | portal
ALTER TABLE expert_case_terms ADD COLUMN panel TEXT;
ALTER TABLE expert_case_terms ADD COLUMN solution TEXT;                            -- tipul soluției, ex. „Amână cauza”
ALTER TABLE expert_case_terms ADD COLUMN summary TEXT;                             -- soluția pe scurt
ALTER TABLE expert_case_terms ADD COLUMN doc TEXT;                                 -- documentul ședinței, ex. „Încheiere de ședință”
ALTER TABLE expert_case_terms ADD COLUMN doc_no TEXT;
ALTER TABLE expert_case_terms ADD COLUMN doc_date TEXT;

-- Monitorizare: dosarul este verificat periodic în portal; ce s-a schimbat rămâne ca alertă până când expertul
-- confirmă că a verificat dosarul electronic.
ALTER TABLE expert_cases ADD COLUMN monitor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expert_cases ADD COLUMN portal_at TEXT;                                -- ultima verificare reușită
ALTER TABLE expert_cases ADD COLUMN portal_error TEXT;
ALTER TABLE expert_cases ADD COLUMN portal_stage TEXT;                             -- stadiul procesual din portal
ALTER TABLE expert_cases ADD COLUMN portal_changed_at TEXT;
ALTER TABLE expert_cases ADD COLUMN portal_change TEXT;                            -- ce s-a schimbat la ultima verificare cu noutăți
ALTER TABLE expert_cases ADD COLUMN portal_ack_at TEXT;                            -- „am verificat dosarul electronic”
CREATE INDEX IF NOT EXISTS idx_expert_cases_monitor ON expert_cases(monitor, portal_at);
