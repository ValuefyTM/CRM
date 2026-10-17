-- The asset types a sheet is meant for (JSON list of "CATEGORIE" or "CATEGORIE|TIP"): only these sheets are offered when an
-- inspection of such an asset is given. Empty: the sheet is offered for every asset.
ALTER TABLE insp_template_meta ADD COLUMN asset_types TEXT;
