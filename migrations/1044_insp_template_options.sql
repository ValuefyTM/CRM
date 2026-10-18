-- Options of a sheet (JSON): {"rooms": true|false} the finishes of each room are asked; {"photos": [..]} the photo groups it
-- suggests (none: the groups of the asset type). NULL: the defaults of its built-in type.
ALTER TABLE insp_template_meta ADD COLUMN options TEXT;
