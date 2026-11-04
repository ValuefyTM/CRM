-- The road distance (by car) from the office to each inspection, computed once and kept: recomputed only when the
-- office's address or the inspection's place changes.
CREATE TABLE IF NOT EXISTS inspection_routes (
  inspection_id TEXT PRIMARY KEY,
  office        TEXT NOT NULL,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  road_km       REAL NOT NULL,
  computed_at   TEXT NOT NULL
);
