"use client";
// The assets of a new report, one by one (apartment, parking space, box, land…): each has its own value and inspection.
// Used when an order is registered or processed; the first asset is the main one.
import { ASSET_CATEGORIES, capType, emptyAsset, type AssetForm } from "@/lib/asset-labels";
import { ContactFields } from "@/components/ContactFields";

export function AssetsEditor({ assets, setAssets, client }: { assets: AssetForm[]; setAssets: (a: AssetForm[]) => void; client: { name: string; phone: string } }) {
  const setA = (i: number, k: keyof AssetForm, v: string) => setAssets(assets.map((a, j) => (j === i ? { ...a, [k]: v, ...(k === "category" ? { type: "" } : {}) } : a)));
  const add = () => {
    const last = assets[assets.length - 1];
    setAssets([...assets, { ...emptyAsset({ county: last?.county, city: last?.city }), full_address: "", is_main: false,
      contact_kind: last?.contact_kind ?? "client", contact_name: last?.contact_name ?? "", contact_phone: last?.contact_phone ?? "" }]);
  };
  return (
    <>
      {assets.map((a, i) => {
        const types = ASSET_CATEGORIES.find(([c]) => c === a.category)?.[2] ?? [];
        return (
          <div key={i} className="assetBox">
            <div className="cardHead">
              <b>{i === 0 ? "Bun principal" : `Bunul ${i + 1}`}{a.type ? ` · ${capType(a.type)}` : ""}</b>
              {assets.length > 1 && <button type="button" className="linkBtn danger" onClick={() => setAssets(assets.filter((_, j) => j !== i))}>Scoate</button>}
            </div>
            <div className="formRow">
              <label className="field">Categorie<select className="select" value={a.category} onChange={(e) => setA(i, "category", e.target.value)}>{ASSET_CATEGORIES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></label>
              <label className="field">Tip
                {types.length && (types.includes(a.type) || !a.type)
                  ? <select className="select" value={a.type} onChange={(e) => setA(i, "type", e.target.value === "__other" ? " " : e.target.value)}>
                      <option value="">Alege…</option>{types.map((t) => <option key={t} value={t}>{capType(t)}</option>)}<option value="__other">Alt tip…</option>
                    </select>
                  : <input className="input" value={a.type.trim()} onChange={(e) => setA(i, "type", e.target.value.toUpperCase())} placeholder="ex. SPATIU DE BIROURI" />}
              </label>
            </div>
            <div className="formRow">
              <label className="field">Județ<input className="input" value={a.county} onChange={(e) => setA(i, "county", e.target.value)} /></label>
              <label className="field">Localitate<input className="input" value={a.city} onChange={(e) => setA(i, "city", e.target.value)} /></label>
            </div>
            <label className="field">Adresa completă<input className="input" value={a.full_address} onChange={(e) => setA(i, "full_address", e.target.value)} /></label>
            <div className="formRow">
              <label className="field">Nr. CF<input className="input mono" value={a.cf_number} onChange={(e) => setA(i, "cf_number", e.target.value)} /></label>
              <label className="field">Nr. cad. construcție<input className="input mono" value={a.cad_building} onChange={(e) => setA(i, "cad_building", e.target.value)} /></label>
              <label className="field">Nr. cad. teren<input className="input mono" value={a.cad_land} onChange={(e) => setA(i, "cad_land", e.target.value)} /></label>
            </div>
            <div className="formRow">
              <label className="field">Suprafață utilă (mp)<input className="input" inputMode="decimal" value={a.usable_area} onChange={(e) => setA(i, "usable_area", e.target.value)} /></label>
              <label className="field">An construcție<input className="input" inputMode="numeric" value={a.year_built} onChange={(e) => setA(i, "year_built", e.target.value)} /></label>
              <label className="field">Descriere<input className="input" value={a.description} onChange={(e) => setA(i, "description", e.target.value)} placeholder="ex. 3 camere · teren 450 mp" /></label>
            </div>
            <ContactFields value={a} client={{ name: client.name, phone: client.phone }} onChange={(c) => setAssets(assets.map((x, j) => (j === i ? { ...x, ...c } : x)))} />
          </div>
        );
      })}
      <button type="button" className="btn btnGhost btnSm" style={{ alignSelf: "flex-start" }} onClick={add}>+ Adaugă încă un bun</button>
    </>
  );
}
