-- Expertize judiciare: un dosar poate trece prin mai multe instanțe (fond, apel, recurs). Fiecare ședință preluată din
-- portal ține instanța și stadiul procesual la care a avut loc.
ALTER TABLE expert_case_terms ADD COLUMN court TEXT;
ALTER TABLE expert_case_terms ADD COLUMN phase TEXT;                  -- stadiul procesual: Fond, Apel, Recurs…
