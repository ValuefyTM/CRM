-- Who brought the work (a collaborator / broker from the entities), on offers and orders.
ALTER TABLE quotes ADD COLUMN referral_id TEXT REFERENCES entities(id);
ALTER TABLE orders ADD COLUMN referral_id TEXT REFERENCES entities(id);
