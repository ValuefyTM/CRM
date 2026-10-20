-- "Recomandată de": the collaborator's account (users of kind "partner", Utilizatori → Colaboratori), as on reports.
ALTER TABLE orders ADD COLUMN referral_user_id TEXT REFERENCES users(id);
ALTER TABLE quotes ADD COLUMN referral_user_id TEXT REFERENCES users(id);
