-- Processing: every order becomes a report file ("dosar") in the CRM.
-- Portal and website orders open it when the client accepts the offer; bank and collaboration orders are registered
-- directly under the framework contract / collaboration agreement (the order stays as the line for the statement / borderou).

-- Working stage of the report, on top of its status: inspection → drafting → review → delivered.
-- Empty = waiting for the inspection (drafting starts by itself once the inspection is done).
ALTER TABLE reports ADD COLUMN stage TEXT;                 -- NULL | drafting | review
ALTER TABLE reports ADD COLUMN term_days INTEGER;          -- working days from the inspection (from the accepted offer)
ALTER TABLE reports ADD COLUMN due_on TEXT;                -- YYYY-MM-DD, set by hand (bank orders) or kept from the offer
ALTER TABLE reports ADD COLUMN offer_id TEXT REFERENCES offers(id);
ALTER TABLE reports ADD COLUMN opened_by TEXT REFERENCES users(id);
ALTER TABLE reports ADD COLUMN client_notified_at TEXT;    -- portal / email notice that the report is ready

-- Website orders have no portal account behind them: the delivery email goes to the order's client email.
CREATE INDEX IF NOT EXISTS idx_reports_stage ON reports(status, stage);
