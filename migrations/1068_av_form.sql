-- The Appraisal & Valuation order form (Formular_facturare_externi.xlsx): what it asks and the CRM did not keep.
-- The client: CNP (persons), the legal representative (companies), the address in parts (county / city exist).
ALTER TABLE entities ADD COLUMN cnp TEXT;
ALTER TABLE entities ADD COLUMN legal_rep TEXT;
ALTER TABLE entities ADD COLUMN addr_street TEXT;
ALTER TABLE entities ADD COLUMN addr_number TEXT;
ALTER TABLE entities ADD COLUMN addr_block TEXT;
ALTER TABLE entities ADD COLUMN addr_stair TEXT;
ALTER TABLE entities ADD COLUMN addr_floor TEXT;
ALTER TABLE entities ADD COLUMN addr_apartment TEXT;
-- The property: postal code, district (cartier), parking places.
ALTER TABLE crm_properties ADD COLUMN postal_code TEXT;
ALTER TABLE crm_properties ADD COLUMN district TEXT;
ALTER TABLE crm_properties ADD COLUMN parking_spots INTEGER;
-- The order: the form's own settings (JSON: firm APP/NAI/SGET, their client id, the credit officer's email, the
-- invoice's due days, the days min / max, the property at the client's address).
ALTER TABLE orders ADD COLUMN av_form TEXT;
