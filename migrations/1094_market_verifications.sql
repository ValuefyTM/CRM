-- Verificarea telefonică a unei comparabile (anunț de piață), ținută pe raport: data, cu cine s-a discutat, rezultatul și
-- notițele; din ele se compune fraza citată în raport și în fișa exportată (PDF / Word).
CREATE TABLE IF NOT EXISTS market_verifications (
  report_id   TEXT NOT NULL,
  listing_id  TEXT NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  day         TEXT,                                   -- yyyy-mm-dd
  person      TEXT,
  outcome     TEXT NOT NULL DEFAULT 'confirmate',     -- confirmate | suplimentare | diferite | tranzactionat
  note        TEXT,
  updated_by  TEXT,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (report_id, listing_id)
);
