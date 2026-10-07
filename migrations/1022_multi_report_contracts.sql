-- A classic contract can hold several reports (e.g. one for taxation, one for financial reporting of the same building):
-- each report has its own terms of reference (Annex 1.N of the contract) and delivery term.
ALTER TABLE reports ADD COLUMN terms TEXT;
-- Direct work with several reports: per report its purpose, report type, fee, term and which of the order's assets it
-- values. A property valued in more than one report is inspected once (the other reports mark it "no inspection").
ALTER TABLE orders ADD COLUMN reports_json TEXT;
