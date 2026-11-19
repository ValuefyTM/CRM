-- Expertize judiciare: evidența dosarelor în care un evaluator este numit expert tehnic judiciar.
-- Dosarele sunt personale: fiecare rând ține de expertul lui (owner_id) și doar el îl vede — nu există vedere de administrator.

-- Cine are modulul: bifa „Expert judiciar” de pe utilizator.
ALTER TABLE users ADD COLUMN judicial_expert INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS expert_cases (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id),
  number        TEXT NOT NULL,                         -- numărul dosarului, ex. 4127/325/2025
  court         TEXT,                                  -- instanța
  section       TEXT,
  panel         TEXT,                                  -- completul
  object        TEXT,                                  -- obiectul dosarului
  specialty     TEXT,
  appointed_on  TEXT,                                  -- data încheierii de numire
  property      TEXT,                                  -- bunul expertizat (text liber)
  objectives    TEXT NOT NULL DEFAULT '[]',            -- JSON: [{ text, done }]
  stage         INTEGER NOT NULL DEFAULT 0,            -- 0 numire · 1 onorariu consemnat · 2 convocare · 3 constatare · 4 raport depus · 5 obiecțiuni · 6 finalizat
  visit_on      TEXT,                                  -- constatarea la fața locului: data, ora, locul, dacă s-a făcut
  visit_time    TEXT,
  visit_place   TEXT,
  visit_done    INTEGER NOT NULL DEFAULT 0,
  fee_prov      REAL,                                  -- onorariu provizoriu, lei
  fee_paid      INTEGER NOT NULL DEFAULT 0,            -- consemnat
  fee_extra     REAL,                                  -- majorare cerută
  fee_final     REAL,                                  -- definitiv, stabilit de instanță
  fee_cashed    REAL,                                  -- încasat
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expert_cases_owner ON expert_cases(owner_id, stage);

CREATE TABLE IF NOT EXISTS expert_case_parties (
  id        TEXT PRIMARY KEY,
  case_id   TEXT NOT NULL REFERENCES expert_cases(id),
  role      TEXT NOT NULL,                             -- reclamant, pârât, intervenient, expert consilier…
  name      TEXT NOT NULL,
  address   TEXT,
  phone     TEXT,
  email     TEXT,
  lawyer    TEXT,                                      -- avocat / reprezentant
  note      TEXT,
  position  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_expert_parties_case ON expert_case_parties(case_id, position);

CREATE TABLE IF NOT EXISTS expert_case_terms (
  id        TEXT PRIMARY KEY,
  case_id   TEXT NOT NULL REFERENCES expert_cases(id),
  on_date   TEXT NOT NULL,                             -- AAAA-LL-ZZ
  at_time   TEXT,
  kind      TEXT NOT NULL DEFAULT 'judecata',          -- judecata | depunere | obiectiuni | onorariu | constatare | eveniment
  title     TEXT NOT NULL,
  note      TEXT,
  done      INTEGER NOT NULL DEFAULT 0,                -- trecut / rezolvat (nu mai dă alerte)
  result    TEXT                                       -- ce s-a întâmplat la termen
);
CREATE INDEX IF NOT EXISTS idx_expert_terms_case ON expert_case_terms(case_id, on_date);
CREATE INDEX IF NOT EXISTS idx_expert_terms_open ON expert_case_terms(done, on_date);

CREATE TABLE IF NOT EXISTS expert_case_summons (
  id           TEXT PRIMARY KEY,
  case_id      TEXT NOT NULL REFERENCES expert_cases(id),
  to_name      TEXT NOT NULL,
  method       TEXT NOT NULL,                          -- scrisoare recomandată cu confirmare de primire, e-mail, telefon, personal
  sent_on      TEXT,
  confirmed_on TEXT,                                   -- data dovezii de primire
  proof        TEXT,                                   -- nr. AWB / recomandată, observații
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expert_summons_case ON expert_case_summons(case_id, sent_on);

CREATE TABLE IF NOT EXISTS expert_case_folders (
  id        TEXT PRIMARY KEY,
  case_id   TEXT NOT NULL REFERENCES expert_cases(id),
  name      TEXT NOT NULL,
  preset    INTEGER NOT NULL DEFAULT 0,                -- folder predefinit (nu se șterge)
  position  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_expert_folders_case ON expert_case_folders(case_id, position);

-- Un fișier cu același nume în același folder îl înlocuiește pe cel vechi, care rămâne ca versiune (current = 0).
CREATE TABLE IF NOT EXISTS expert_case_docs (
  id           TEXT PRIMARY KEY,
  case_id      TEXT NOT NULL REFERENCES expert_cases(id),
  folder_id    TEXT NOT NULL,
  filename     TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  r2_key       TEXT NOT NULL,
  version      INTEGER NOT NULL DEFAULT 1,
  current      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expert_docs_case ON expert_case_docs(case_id, folder_id, current);
