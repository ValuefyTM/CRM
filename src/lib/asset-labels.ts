// Vocabulary of the valued assets, as in the Glide data (categories and types in capitals). No server code: also used in forms.

export const ASSET_CATEGORIES: [code: string, label: string, types: string[]][] = [
  ["REZIDENTIAL", "Rezidențial", ["APARTAMENT IN BLOC", "APARTAMENT IN CASA", "CASA CU TEREN", "LOC DE PARCARE ( SUBTERAN )", "LOC DE PARCARE ( SUPRATERAN )", "ANSAMBLU REZIDENTIAL", "CURTE", "ACCESORIU"]],
  ["COMERCIAL", "Comercial", ["SPATIU COMERCIAL - PARTE DINTR-O CLADIRE", "SPATIU COMERCIAL - CLADIRE INDEPENDENTA", "SPATIU DE BIROURI - PARTE DINTR-O CLADIRE", "SPATIU DE BIROURI - CLADIRE INDEPENDENTA", "UNITATE CAZARE", "SPATIU DE AGREMENT", "BLOC APARTAMENTE CU SPATIU COMERCIAL (RETAIL)"]],
  ["INDUSTRIAL", "Industrial", ["SPATIU DE PRODUCTIE", "SPATIU DE DEPOZITARE SI LOGISTICA"]],
  ["TEREN", "Teren", ["TEREN INTRAVILAN CONSTRUCTII", "TEREN INTRAVILAN ARABIL", "TEREN EXTRAVILAN", "TEREN CU DESTINATIE AGRICOLA"]],
  ["PROPRIETATE AGRICOLA", "Proprietate agricolă", ["FERMA AGRICOLA", "FERMA AGRICOLA DE CULTURA", "SERE LEGUMICOLE/FLORICOLE", "CRAME/CENTRE DE VINIFICATIE"]],
  ["MIXT", "Mixt", []],
  ["BUN MOBIL", "Bun mobil", ["AUTOTURISM", "AUTOUTILITARA", "UTILAJ", "MOTOSCUTER"]],
];

export const APPROACHES: [string, string][] = [["", "—"], ["market", "Piață"], ["income", "Venit"], ["cost", "Cost"]];

/** "APARTAMENT IN BLOC" → "Apartament in bloc". */
export const capType = (s: string | null | undefined) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");

export type AssetInput = {
  property_id?: string | null;
  category: string | null; type: string; construction: string | null; county: string | null; city: string | null; full_address: string | null;
  cf_number: string | null; cad_building: string | null; cad_land: string | null; usable_area: number | null; year_built: number | null; description: string | null;
  is_main: boolean; value: number | null; approach: string | null; notes: string | null;
};

/** Values of the asset form (strings, as typed). */
export type AssetForm = {
  id?: string; category: string; type: string; construction: string; county: string; city: string; full_address: string; cf_number: string;
  cad_building: string; cad_land: string; usable_area: string; year_built: string; description: string; is_main: boolean; value: string; approach: string; notes: string;
};
export const emptyAsset = (near?: { county?: string | null; city?: string | null }): AssetForm => ({
  category: "REZIDENTIAL", type: "", construction: "existing", county: near?.county ?? "", city: near?.city ?? "", full_address: "", cf_number: "", cad_building: "", cad_land: "",
  usable_area: "", year_built: "", description: "", is_main: false, value: "", approach: "", notes: "",
});

