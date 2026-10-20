-- The share of each fixed monthly cost carried by an administrator (JSON {"<user id>": percent}): in the month's
-- figures filtered by that administrator, the cost counts with their share.
ALTER TABLE fixed_costs ADD COLUMN splits TEXT;
