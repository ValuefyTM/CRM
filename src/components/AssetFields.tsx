"use client";
// The fields of one asset (new work, report page): category and type, the place (county and locality from the official
// list, filled in from the address when it names them) and the details that this type of asset has — an apartment
// has rooms and floor, a house its land too, land only its area, a car its make, model and plate.
import { useEffect, useRef, useState } from "react";
import { ASSET_CATEGORIES, assetProfile, capType, FIELD_HINTS, FIELD_LABELS, type AssetForm, type ProfileField } from "@/lib/asset-labels";
import { extractPlace, loadPlaces, type Places } from "@/lib/places";
import { Combo } from "./Combo";
import { MiniMap, type MiniPoint } from "./MiniMap";

type Loc = { state: "idle" | "loading" | "found" | "none"; point: MiniPoint | null; note: string };
const SOURCE_TEXT: Record<MiniPoint["source"], string> = { cadastru: "Localizat din geoportal (plan cadastral)", adresa: "Localizat după adresă", localitate: "Aproximativ: centrul localității" };

const NUMERIC: ProfileField[] = ["usable_area", "land_area", "rooms", "year_built", "mileage"];
const MONO: ProfileField[] = ["cf_number", "cad_building", "cad_land", "reg_number", "vin"];

export function AssetFields({ value: f, onChange }: { value: AssetForm; onChange: (patch: Partial<AssetForm>) => void }) {
  const [places, setPlaces] = useState<Places>({});
  const [auto, setAuto] = useState(false);
  const last = useRef<{ county: string; city: string } | null>(null);
  useEffect(() => { loadPlaces().then(setPlaces); }, []);
  const types = ASSET_CATEGORIES.find(([c]) => c === f.category)?.[2] ?? [];
  const [other, setOther] = useState(!!f.type && !types.includes(f.type));
  const p = assetProfile(f.category, f.type);
  const counties = Object.keys(places);
  const localities = f.county && places[f.county] ? places[f.county] : [];

  // The small map: the geoportal by the cadastral / CF number first, else the address (looked up a moment after typing).
  const [loc, setLoc] = useState<Loc>({ state: "idle", point: null, note: "" });
  const hasCad = !!(f.cad_building.trim() || f.cad_land.trim() || f.cf_number.trim());
  const where = f.full_address.trim() || f.city.trim();
  useEffect(() => {
    if (!hasCad && !where) { setLoc({ state: "idle", point: null, note: "" }); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoc((x) => ({ ...x, state: "loading" }));
      const r = await fetch("/api/crm/geo/lookup", { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cad_building: f.cad_building, cad_land: f.cad_land, cf_number: f.cf_number, city: f.city, county: f.county, address: f.full_address }) }).catch(() => null);
      if (ctl.signal.aborted) return;
      const d = (await r?.json().catch(() => null)) as { hit?: (MiniPoint & { note: string }) | null; cadastreTried?: boolean } | null;
      if (d?.hit) setLoc({ state: "found", point: { lat: d.hit.lat, lng: d.hit.lng, source: d.hit.source }, note: d.hit.note });
      else setLoc({ state: "none", point: null, note: d?.cadastreTried ? "Nici geoportalul, nici adresa nu au dat un punct." : "Adresa nu a fost găsită pe hartă." });
    }, 900);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [f.cad_building, f.cad_land, f.cf_number, f.full_address, f.city, f.county]); // eslint-disable-line react-hooks/exhaustive-deps

  // The address names the place: fill in county and locality, unless they were chosen by hand.
  const fromAddress = (address: string) => {
    if (!counties.length) return;
    const handCounty = f.county && f.county !== last.current?.county;
    const handCity = f.city && f.city !== last.current?.city;
    if (handCounty && handCity) return;
    const hit = extractPlace(address, places, handCounty ? f.county : null);
    if (!hit) return;
    const patch: Partial<AssetForm> = {};
    if (!handCounty && hit.county && hit.county !== f.county) patch.county = hit.county;
    if (!handCity && hit.city && hit.city !== f.city) patch.city = hit.city;
    if (Object.keys(patch).length) {
      last.current = { county: patch.county ?? f.county, city: patch.city ?? f.city };
      setAuto(true);
      onChange(patch);
    }
  };

  const field = (k: ProfileField) => {
    if (k === "construction") return (
      <label key={k} className="field">Stadiu
        <select className="select" value={f.construction} onChange={(e) => onChange({ construction: e.target.value })}>
          <option value="existing">Existent</option><option value="under_construction">În construcție</option>
        </select>
      </label>
    );
    return (
      <label key={k} className="field">{p.labels[k] ?? FIELD_LABELS[k]}
        <input className={`input${MONO.includes(k) ? " mono" : ""}`} inputMode={NUMERIC.includes(k) ? (k === "usable_area" || k === "land_area" ? "decimal" : "numeric") : undefined}
          value={f[k]} placeholder={FIELD_HINTS[k] ?? ""} onChange={(e) => onChange({ [k]: k === "reg_number" || k === "vin" ? e.target.value.toUpperCase() : e.target.value })} />
      </label>
    );
  };
  const details = p.fields.filter((k) => k !== "construction" && !["cf_number", "cad_building", "cad_land"].includes(k));
  const ids = p.fields.filter((k) => ["cf_number", "cad_building", "cad_land"].includes(k));

  return (
    <div className="afWrap">
    <div className="afGrid">
      <div className="formRow">
        <label className="field">Categorie
          <select className="select" value={f.category} onChange={(e) => { setOther(false); onChange({ category: e.target.value, type: "" }); }}>
            {ASSET_CATEGORIES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
          </select>
        </label>
        <label className="field">Tip bun
          {other || types.length === 0
            ? <span className="afOther">
                <input className="input" value={f.type} onChange={(e) => onChange({ type: e.target.value.toUpperCase() })} placeholder="ex. SPATIU DE BIROURI" />
                {types.length > 0 && <button type="button" className="linkBtn" onClick={() => { setOther(false); onChange({ type: "" }); }}>din listă</button>}
              </span>
            : <select className="select" value={f.type} aria-invalid={!f.type ? undefined : false}
                onChange={(e) => { if (e.target.value === "__other") { setOther(true); onChange({ type: "" }); } else onChange({ type: e.target.value }); }}>
                <option value="">Alege tipul…</option>
                {types.map((t) => <option key={t} value={t}>{capType(t)}</option>)}
                <option value="__other">Alt tip…</option>
              </select>}
        </label>
        {p.fields.includes("construction") && field("construction")}
      </div>

      <div className="afPlace">
        <label className="field">{p.address ? "Adresa completă" : "Unde se află (opțional)"}
          <input className="input" value={f.full_address} placeholder="Strada, număr, bloc, scară, etaj, apartament, localitate"
            onChange={(e) => { onChange({ full_address: e.target.value }); setAuto(false); }} onBlur={(e) => fromAddress(e.target.value)} />
        </label>
        <div className="formRow">
          <div className="field">Județ
            <Combo label="Județ" value={f.county} options={counties} free={false} placeholder="Alege județul"
              onChange={(v) => { last.current = null; setAuto(false); onChange(v === f.county ? {} : { county: v, city: "" }); }} />
          </div>
          <div className="field">Localitate
            <Combo label="Localitate" value={f.city} options={localities} placeholder={f.county ? "Alege sau scrie localitatea" : "Alege întâi județul"}
              onChange={(v) => { last.current = null; setAuto(false); onChange({ city: v }); }} />
          </div>
        </div>
        {auto && <p className="afAuto">Județul și localitatea au fost completate din adresă. Le poți schimba.</p>}
      </div>

      {details.length > 0 && <div className="formRow afDetails">{details.map(field)}</div>}
      {ids.length > 0 && <div className="formRow">{ids.map(field)}</div>}
      <label className="field"><span className="fLabel">Descriere <small>(opțional)</small></span>
        <input className="input" value={f.description} onChange={(e) => onChange({ description: e.target.value })}
          placeholder={p.key === "vehicle" ? "ex. motorină, cutie automată, stare bună" : p.key === "land" ? "ex. formă regulată, front stradal 20 m, utilități la limită" : "ex. compartimentare, finisaje, stare"} />
      </label>
    </div>
    <aside className="afMap" aria-label="Localizare pe hartă">
      <MiniMap point={loc.point} />
      <p className={`afMapNote ${loc.state === "found" ? loc.point?.source ?? "" : loc.state}`}>
        {loc.state === "idle" ? "Harta se completează din nr. cadastral / CF (geoportal) sau din adresă."
          : loc.state === "loading" ? "Caut pe hartă…"
          : loc.state === "found" && loc.point ? <><b>{SOURCE_TEXT[loc.point.source]}</b><small>{loc.note}</small></>
          : loc.note}
      </p>
    </aside>
    </div>
  );
}
