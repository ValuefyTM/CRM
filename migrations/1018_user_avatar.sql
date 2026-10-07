-- Profile photo of a user (R2 key avatars/<id>.jpg); the time it was set is also the cache key of its URL.
ALTER TABLE users ADD COLUMN avatar_at TEXT;
-- Deleted accounts that still appear in past work keep their row (status 'deleted', email freed) and leave every list.
