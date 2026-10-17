-- The photos of an inspection regrouped by hand (asset page → Fotografii, drag and drop): the group chosen there. Empty: the
-- room / category the photo was taken with (UVALO: the room, the CRM app: the category).
ALTER TABLE inspection_photos ADD COLUMN album TEXT;
