"use client";
// The assets of a new report, one by one (apartment, parking space, box, land…): each has its own value and inspection.
// Used when an order is registered or processed; the first asset is the main one.
import { capType, emptyAsset, type AssetForm } from "@/lib/asset-labels";
import { ContactFields } from "@/components/ContactFields";
import { AssetFields } from "@/components/AssetFields";

export function AssetsEditor({ assets, setAssets, client }: { assets: AssetForm[]; setAssets: (a: AssetForm[]) => void; client: { name: string; phone: string } }) {
  const patch = (i: number, p: Partial<AssetForm>) => setAssets(assets.map((a, j) => (j === i ? { ...a, ...p } : a)));
  const add = () => {
    const last = assets[assets.length - 1];
    setAssets([...assets, { ...emptyAsset({ county: last?.county, city: last?.city }), full_address: last?.full_address ?? "", is_main: false,
      contact_kind: last?.contact_kind ?? "client", contact_name: last?.contact_name ?? "", contact_phone: last?.contact_phone ?? "" }]);
  };
  return (
    <div className="assetList">
      {assets.map((a, i) => (
        <div key={i} className="assetBox">
          <div className="assetHead">
            <span className="assetNo">{i + 1}</span>
            <b>{i === 0 ? "Bun principal" : `Bunul ${i + 1}`}<small>{a.type ? capType(a.type) : "alege tipul"}{a.city ? ` · ${a.city}` : ""}</small></b>
            {assets.length > 1 && <button type="button" className="linkBtn danger" onClick={() => setAssets(assets.filter((_, j) => j !== i))}>Scoate</button>}
          </div>
          <AssetFields value={a} onChange={(p) => patch(i, p)} />
          <div className="contactBox">
            <div className="contactBoxHead">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
              <b>Contact la inspecție</b><small>cine îl primește pe inspector</small>
            </div>
            <ContactFields value={a} client={{ name: client.name, phone: client.phone }} onChange={(c) => patch(i, c)} />
          </div>
        </div>
      ))}
      <button type="button" className="addAsset" onClick={add}>
        <span aria-hidden="true">+</span> Adaugă încă un bun <small>loc de parcare, boxă, teren…</small>
      </button>
    </div>
  );
}
