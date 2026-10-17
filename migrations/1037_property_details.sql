-- Details of a valued asset that depend on its type: land area (houses, land, standalone buildings), rooms and floor
-- (apartments), height regime (buildings) and, for vehicles, make, model, registration number, VIN and mileage.
ALTER TABLE crm_properties ADD COLUMN land_area REAL;
ALTER TABLE crm_properties ADD COLUMN rooms INTEGER;
ALTER TABLE crm_properties ADD COLUMN height_regime TEXT;
ALTER TABLE crm_properties ADD COLUMN vehicle_make TEXT;
ALTER TABLE crm_properties ADD COLUMN vehicle_model TEXT;
ALTER TABLE crm_properties ADD COLUMN reg_number TEXT;
ALTER TABLE crm_properties ADD COLUMN vin TEXT;
ALTER TABLE crm_properties ADD COLUMN mileage INTEGER;
