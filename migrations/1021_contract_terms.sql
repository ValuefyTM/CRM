-- Terms of reference of a classic contract (Annex 1) and its payment terms (Annex 2), as JSON: designated users, value
-- type, deliverable, delivery term, limitations, special assumptions, payment tranches. Empty = the defaults computed
-- from the contract, its reports and assets.
ALTER TABLE contracts ADD COLUMN terms TEXT;
