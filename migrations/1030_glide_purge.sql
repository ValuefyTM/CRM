-- Deleting the Glide data (owner only, from Import Glide): the rows to delete are collected here first, so the
-- whole deletion runs as one transaction. glide_files keeps the files already copied from Glide into R2, so that
-- a new import links them again instead of downloading them from Glide a second time.
CREATE TABLE IF NOT EXISTS glide_purge (
  tbl TEXT NOT NULL,
  rid INTEGER NOT NULL,
  PRIMARY KEY (tbl, rid)
);

CREATE TABLE IF NOT EXISTS glide_files (
  tbl    TEXT NOT NULL,
  col    TEXT NOT NULL,
  row_id TEXT NOT NULL,
  value  TEXT NOT NULL,                                 -- r2:<key> | lost:<url>
  PRIMARY KEY (tbl, col, row_id)
);
