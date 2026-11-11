-- The reports imported from the old CRM (Glide) have their values in euro: their currency says so (it was left at the
-- default, RON). Their fees are in lei, as always (the currency is the one of the values).
UPDATE reports SET currency = 'EUR' WHERE glide_id IS NOT NULL AND currency = 'RON';
