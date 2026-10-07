import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { catKey, parseGeo, registryProperty } from "@/lib/registry";
import { REPORT_STATUS } from "@/lib/reports";
import { niceName } from "@/lib/labels";
import { CrmShell } from "@/components/CrmShell";
import { geolocateEnabled } from "@/lib/geolocate";
import { LocateOne } from "../LocateActions";
import { RegistryMap } from "../RegistryMap";
import { CAT_COLOR, CAT_LABEL } from "@/lib/registry-labels";

export const metadata: Metadata = { title: "Proprietate | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const cap = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
const lei = (v: number | null) => (v ? `${Math.round(v).toLocaleString("ro-RO")} lei` : "—");
const APPROACH: Record<string, string> = { market: "Piață", income: "Venit", cost: "Cost" };

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div><dt>{k}</dt><dd>{children ?? "—"}</dd></div>;
}

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage();
  const d = await registryProperty(db, (await params).id);
  if (!d) notFound();
  const p = d.property;
  const ll = parseGeo(p.geo);
  const vals = d.valuations.map((v) => ({ ...v, val: v.value ?? (v.assets === 1 ? v.result_value : null) }));
  const series = vals.filter((v) => v.val && v.date).reverse();
  const first = series[0]?.val, last = series[series.length - 1]?.val;
  const change = first && last && series.length > 1 ? Math.round(((last - first) / first) * 100) : null;

  return (
    <CrmShell user={user} base={base} active="properties" title={cap(p.type) || "Proprietate"} subtitle={`Registru proprietăți · ${p.full_address ?? p.city ?? ""}`}
      actions={<a className="btn btnGhost btnSm" href={`${base}/proprietati`}>← Proprietăți</a>}>
      <section className="rgHero">
        <div>
          {p.category && <span className="rgCat light" style={{ ["--c" as string]: CAT_COLOR[catKey(p.category)] ?? "#7a7a7a" }}>{CAT_LABEL[catKey(p.category)] ?? p.category}</span>}
          <h2>{cap(p.type) || "Proprietate"}</h2>
          <p>{p.full_address ?? "—"}{p.city && !p.full_address?.includes(p.city) ? `, ${p.city}` : ""}{p.county ? `, ${p.county}` : ""}</p>
          {ll && <a className="rgHeroLink" href={`https://www.google.com/maps?q=${ll[0]},${ll[1]}`} target="_blank" rel="noopener">Deschide în Google Maps ↗</a>}
        </div>
        <div className="rgHeroNums">
          <span><em>Ultima valoare cunoscută</em><b>{lei(p.value)}</b></span>
          <span><em>Lei / m²</em><b>{p.sqm ? Math.round(p.sqm).toLocaleString("ro-RO") : "—"}</b></span>
          <span><em>Evaluări</em><b>{p.valuations ?? 0}</b></span>
          {change != null && <span><em>Evoluție valoare</em><b className={change >= 0 ? "up" : "down"}>{change >= 0 ? "+" : ""}{change}%</b></span>}
        </div>
      </section>

      <div className="cols">
        <section className="card">
          <h2>Date proprietate</h2>
          <dl className="kv">
            <Row k="Tip">{cap(p.type)}</Row>
            <Row k="Construcție">{p.construction === "under_construction" ? "În construcție" : p.construction ? "Existentă" : null}</Row>
            <Row k="Suprafață utilă">{p.usable_area ? `${p.usable_area.toLocaleString("ro-RO")} m²` : null}</Row>
            <Row k="An construcție">{p.year_built}</Row>
            <Row k="Carte funciară">{p.cf_number && <span className="mono">{p.cf_number}</span>}</Row>
            <Row k="Nr. cadastral construcție">{p.cad_building && <span className="mono">{p.cad_building}</span>}</Row>
            <Row k="Nr. cadastral teren">{p.cad_land && <span className="mono">{p.cad_land}</span>}</Row>
            <Row k="Zonă">{p.zone}</Row>
            <Row k="Coordonate">{ll ? <span className="mono">{ll[0].toFixed(6)}, {ll[1].toFixed(6)}</span> : null}</Row>
            <Row k="Sursa coordonatelor">{ll ? (p.geo_source === "cadastru" ? `centrul parcelei din cadastru${p.geo_note ? ` (${p.geo_note})` : ""}` : p.geo_source === "glide" ? "introduse în Glide" : p.geo_source === "gps" ? "GPS la inspecție" : p.geo_source ?? null) : null}</Row>
          </dl>
          {p.description && <p className="prose">{p.description}</p>}
        </section>
        <section className="card flush">
          <div className="cardHead"><h2>Localizare</h2></div>
          {ll ? <div style={{ height: 340 }}><RegistryMap base={base} height={340} points={[{ id: p.id, lat: ll[0], lng: ll[1], cat: catKey(p.category), label: p.type ?? "", address: p.full_address ?? "", value: p.value, date: p.last_date }]} /></div>
            : (
              <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <p className="hint" style={{ margin: 0 }}>Proprietatea nu are coordonate.{p.geo_note ? ` Ultima căutare în cadastru: ${p.geo_note}` : ""}</p>
                {geolocateEnabled() && (p.cad_building || p.cad_land || p.cf_number) && <LocateOne id={p.id} />}
              </div>
            )}
        </section>
      </div>

      <section className="card flush">
        <div className="cardHead"><h2>Istoric evaluări</h2><span className="muted">{vals.length} {vals.length === 1 ? "evaluare" : "evaluări"}</span></div>
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Raport</th><th>Data</th><th>Client</th><th>Bancă / utilizator</th><th>Evaluator</th><th>Abordare</th><th className="r">Valoare</th><th className="r">Lei / m²</th><th>Status</th></tr></thead>
            <tbody>
              {vals.map((v) => {
                const [label, cls] = REPORT_STATUS[v.status ?? ""] ?? [v.status ?? "—", ""];
                return (
                  <tr key={v.id}>
                    <td>{v.report_id ? <a className="ref rowLink" href={`${base}/rapoarte/${v.report_id}`}>{v.number ?? "fără nr."}</a> : "—"}{v.assets > 1 && <div className="muted">{v.assets} bunuri</div>}</td>
                    <td>{fmtDate(v.date)}</td>
                    <td>{niceName(v.client) || "—"}{v.purpose && <div className="muted">{v.purpose}</div>}</td>
                    <td>{niceName(v.bank) || "—"}</td>
                    <td>{v.evaluator ?? "—"}</td>
                    <td>{v.approach ? APPROACH[v.approach] ?? v.approach : "—"}</td>
                    <td className="r">{lei(v.val)}</td>
                    <td className="r">{v.val && p.usable_area ? Math.round(v.val / p.usable_area).toLocaleString("ro-RO") : "—"}</td>
                    <td>{v.status ? <span className={`pill ${cls}`}><i />{label}</span> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </CrmShell>
  );
}
