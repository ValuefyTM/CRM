import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { reportAccess } from "@/lib/perms-db";
import { inspectionSheetDoc, type SheetDoc } from "@/lib/insp-sheet-doc";
import { getDb } from "@/lib/db";
import { ROOM_FIELDS } from "@/lib/insp-forms";
import { SheetToolbar } from "./SheetToolbar";
import { getFirm } from "@/lib/settings";

// The title is the PDF's name the browser offers when saving: "Fisa de inspectie_<type>_<VIN or CF>".
export async function generateMetadata({ params }: { params: Promise<{ id: string; asset: string }> }): Promise<Metadata> {
  const { id, asset } = await params;
  const db = await getDb();
  const d = db ? await inspectionSheetDoc(db, id, asset).catch(() => null) : null;
  return { title: { absolute: d ? sheetPdfName(d) : "Fișa de inspecție" } };
}
export const dynamic = "force-dynamic";

/** The PDF's name: "Fisa de inspectie_<type>_<VIN, else CF, else cadastral number>". */
const sheetPdfName = (d: SheetDoc) => {
  const type = (d.property.type ?? "").replace(/\(\s*/g, "(").replace(/\s*\)/g, ")");
  return ["Fisa de inspectie", type && type === type.toUpperCase() ? cap(type) : type, d.property.vin || d.property.cf || d.property.cad]
    .map((x) => (x ?? "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim()).filter(Boolean).join("_");
};

const cap = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");

const num = (v: string | number | null | undefined) => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null; };
const nf = (n: number | null | undefined, d = 2) => (n == null ? "—" : n.toLocaleString("ro-RO", { maximumFractionDigits: d }));

/** A small map of the inspection's place, from OpenStreetMap tiles (3 × 3 around the point), with the pin in the middle. */
function StaticMap({ lat, lng }: { lat: number; lng: number }) {
  const z = 17, n = 2 ** z;
  const fx = ((lng + 180) / 360) * n, rad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const tx = Math.floor(fx), ty = Math.floor(fy);
  // the point's pixel in the 3 × 3 block that starts one tile up-left
  const px = (fx - tx + 1) * 256, py = (fy - ty + 1) * 256;
  return (
    <div className="fxMap" aria-label={`Hartă: ${lat.toFixed(5)}, ${lng.toFixed(5)}`}>
      <div className="fxMapTiles" style={{ left: `calc(50% - ${px}px)`, top: `calc(50% - ${py}px)` }}>
        {[-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${dx}:${dy}`} src={`https://tile.openstreetmap.org/${z}/${tx + dx}/${ty + dy}.png`} alt="" style={{ left: (dx + 1) * 256, top: (dy + 1) * 256 }} />
        )))}
      </div>
      <span className="fxPin" aria-hidden="true" />
      <small className="fxMapCredit">© OpenStreetMap</small>
    </div>
  );
}

/**
 * The inspection sheet of an asset as a document, laid out like UVALO's: the firm's head, the property's profile photo,
 * the summary with its figures, the numbered sections, the rooms, the findings, the place, the signatures, then the
 * photos. Printed / saved as PDF from the browser, to attach to the valuation report.
 */
export default async function InspectionSheetDocument({ params, searchParams }: { params: Promise<{ id: string; asset: string }>; searchParams: Promise<{ foto?: string; print?: string }> }) {
  const { db, base, user } = await staffPage();
  const { id, asset } = await params;
  const sp = await searchParams;
  const rep = await db.prepare("SELECT id, status, delivered_at FROM reports WHERE id = ?").bind(id).first<{ id: string; status: string; delivered_at: string | null }>();
  if (!rep || !(await reportAccess(db, user, rep)).view) notFound();
  const d = await inspectionSheetDoc(db, id, asset).catch((e) => { console.error("fisa", id, asset, e); return null; });
  if (!d) notFound();
  const firm = await getFirm(db);
  const when = d.inspection.done_at ?? d.sheet.submitted_at;
  const util = d.rooms.reduce((t, r) => t + (num(r.area) ?? 0), 0);
  const fin = d.rooms.some((r) => (r.floor ?? []).length || (r.walls ?? []).length || r.ceiling || r.condition);
  // the place: the GPS of the sheet ("lat, lng"), else the property's pin
  const m = (d.sheet.location ?? "").match(/(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)/);
  const place = m ? { lat: Number(m[1]), lng: Number(m[2]), gps: true } : d.property.lat != null && d.property.lng != null ? { lat: d.property.lat, lng: d.property.lng, gps: false } : null;
  const no = (i: number) => String(i).padStart(2, "0");
  // the sections' numbers, in the order they are printed
  const nRooms = d.sections.length + 1, nNotes = nRooms + (d.rooms.length ? 1 : 0), nSigns = nNotes + (d.notes ? 1 : 0), nPhotos = nSigns + 1;
  const H2 = ({ n, title }: { n: number; title: string }) => <h2 className="fxH2"><span>{no(n)}</span>{title}</h2>;
  return (
    <div className="cdWrap">
      <SheetToolbar back={`${base}/rapoarte/${id}?tab=bunuri`} name={sheetPdfName(d)}
        photos={d.photos.length} withPhotos={sp.foto !== "0"} autoPrint={sp.print === "1"} />
      {d.sheet.status !== "submitted" && <div className="cdWarn">Fișa nu a fost încă trimisă din aplicație: documentul arată ciorna salvată până acum.</div>}
      <article className="cdPage fxPage">
        <header className="fxBrand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/valuefy-logo.png" alt={firm.name || "VALUEFY"} />
          <span><b>{firm.name || "VALUEFY"}</b>{firm.anevar && <small>Autorizație ANEVAR nr. {firm.anevar}</small>}<small>Anexă la raportul de evaluare{d.report.number ? ` nr. ${d.report.number}` : ""}</small></span>
          <em>Fișă de inspecție{d.sheet.no ? <><br />{d.sheet.no}</> : null}{when ? <><br />{fmtDate(when)}</> : null}</em>
        </header>

        <section className="fxSec">
          {d.cover && (
            <figure className="fxCover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.cover.src} alt="Imaginea de profil a proprietății" />
            </figure>
          )}
          <span className="fxEyebrow">Fișă de inspecție{d.sheet.no ? ` nr. ${d.sheet.no}` : ""}{when ? ` din ${fmtDate(when)}` : ""}</span>
          <h1 className="fxH1">{d.property.type ? cap(d.property.type) : "Imobil"}</h1>
          <p className="fxLead">{[d.property.address, d.property.cad && `nr. cad. ${d.property.cad}`, d.property.cf && `CF ${d.property.cf}`, d.property.vin && `VIN ${d.property.vin}`].filter(Boolean).join(" · ")}</p>
          <div className="fxKpis">
            <span><small>Suprafață utilă</small><b>{util ? `${nf(util)} m²` : d.property.usable_area ? `${nf(d.property.usable_area)} m²` : "—"}</b><em>{util ? (d.property.usable_area ? `acte ${nf(d.property.usable_area)} m²` : "din releveu") : "din acte"}</em></span>
            <span><small>Teren</small><b>{d.property.land_area ? `${nf(d.property.land_area, 0)} m²` : "—"}</b><em>din acte</em></span>
            <span><small>Inspecția</small><b>{when ? fmtDate(when) : "—"}</b><em>{when ? fmtDate(when, true).split(", ")[1] ?? "" : "neefectuată"}</em></span>
            <span className="dark"><small>Făcută de</small><b>{d.inspection.inspector ?? "—"}</b><em>{d.inspection.inspector_anevar ? `leg. ANEVAR ${d.inspection.inspector_anevar}` : "inspector"}</em></span>
          </div>
          <dl className="fxMeta">
            {d.report.client && <div><dt>Client</dt><dd>{d.report.client}</dd></div>}
            {d.report.bank && <div><dt>Utilizatorul raportului</dt><dd>{d.report.bank}</dd></div>}
            {d.report.purpose && <div><dt>Scopul evaluării</dt><dd>{d.report.purpose}</dd></div>}
            <div><dt>Persoana prezentă</dt><dd>{d.sheet.present ? `${d.sheet.present}${d.sheet.role ? `, ${d.sheet.role.toLowerCase()}` : ""}` : "—"}</dd></div>
            {d.sheet.phone && <div><dt>Telefon</dt><dd>{d.sheet.phone}</dd></div>}
            {(d.property.city || d.property.county) && <div><dt>Localitate</dt><dd>{[d.property.city, d.property.county].filter(Boolean).join(", ")}</dd></div>}
          </dl>
          {place && (
            <div className="fxLoc fxLocSm">
              <StaticMap lat={place.lat} lng={place.lng} />
              <dl className="fxLocFacts">
                <dt>Coordonate GPS</dt><dd className="mono">{place.lat.toFixed(6)}, {place.lng.toFixed(6)}</dd>
                <dt>Sursa</dt>
                <dd>{place.gps ? <>Captate cu telefonul inspectorului, la fața locului{when ? `, pe ${fmtDate(when, true)}` : ""}{d.sheet.accuracy ? ` (precizie ±${Math.round(d.sheet.accuracy)} m)` : ""}</> : "Pinul proprietății, din adresă / cadastru (fișa nu are GPS)"}</dd>
              </dl>
            </div>
          )}
        </section>

        {d.sections.map((s, i) => (
          <section key={s.title} className="fxSec">
            <H2 n={i + 1} title={s.title} />
            <div className="fxRows">{s.rows.map((r) => <div key={r.label}><span>{r.label}</span><b>{r.value}</b></div>)}</div>
          </section>
        ))}

        {d.rooms.length > 0 && (
          <section className="fxSec">
            <H2 n={nRooms} title={`Încăperi (${d.rooms.length})`} />
            <table className="fxRooms">
              <thead><tr><th>Poz.</th><th>Încăpere</th><th>Nivel</th><th className="right">m²</th>{fin && <><th>{ROOM_FIELDS.floor.label}</th><th>{ROOM_FIELDS.walls.label}</th><th>{ROOM_FIELDS.ceiling.label}</th><th>Stare</th></>}</tr></thead>
              <tbody>
                {d.rooms.map((r) => (
                  <tr key={r.id}>
                    <td className="acc">{r.pos}</td><td><b>{r.name}</b>{r.notes ? <div className="fxNote">{r.notes}</div> : null}</td><td>{r.level || "—"}</td><td className="right">{num(r.area) != null ? nf(num(r.area)) : r.area || "—"}</td>
                    {fin && <><td>{(r.floor ?? []).join(", ") || "—"}</td><td>{(r.walls ?? []).join(", ") || "—"}</td><td>{r.ceiling || "—"}</td><td>{r.condition || "—"}</td></>}
                  </tr>
                ))}
                <tr className="tot"><td /><td><b>Suprafață utilă</b></td><td /><td className="right"><b>{nf(util)}</b></td>{fin && <td colSpan={4}>{d.property.usable_area ? `acte: ${nf(d.property.usable_area)} m² · diferență ${util - d.property.usable_area >= 0 ? "+" : ""}${nf(util - d.property.usable_area)} m²` : ""}</td>}</tr>
              </tbody>
            </table>
          </section>
        )}

        {d.notes && (
          <section className="fxSec fxFind">
            <h2 className="fxH2 light"><span>{no(nNotes)}</span>Observații</h2>
            <p>{d.notes}</p>
          </section>
        )}

        <section className="fxSec fxSigns">
          <div><small>{no(nSigns)} · Persoana prezentă</small><b>{d.sheet.present ?? "—"}{d.sheet.role ? <span className="fxLegit"> · {d.sheet.role}</span> : null}</b>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {d.sheet.signature ? <img className="fxSignImg" src={d.sheet.signature} alt={`Semnătura: ${d.sheet.present ?? "persoana prezentă"}`} /> : <span className="fxSignLine" />}
            <em>{d.sheet.signature ? `Semnat pe telefon${d.sheet.submitted_at ? ` · ${fmtDate(d.sheet.submitted_at, true)}` : ""}` : "Semnătura persoanei prezente"}</em></div>
          <div><small>Inspector</small><b>{d.inspection.inspector ?? "—"}{d.inspection.inspector_anevar ? <span className="fxLegit"> · leg. {d.inspection.inspector_anevar}</span> : null}</b>
            <span className="fxSignLine" /><em>Semnătura inspectorului</em></div>
        </section>
      </article>

      {d.photos.length > 0 && (
        <article className="cdPage fxPage fsPhotosPage" id="anexa-foto">
          <header className="fxBrand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/valuefy-logo.png" alt={firm.name || "VALUEFY"} />
            <span><b>Documentar foto</b><small>{d.property.address ?? ""}</small></span>
            <em>{d.photos.length} fotografii</em>
          </header>
          <section className="fxSec">
            <h2 className="fxH2"><span>{no(nPhotos)}</span>Fotografii</h2>
            <div className="fxPhotos">
              {d.photos.map((p, i) => (
                <figure key={i}>
                  <span className="fxPhBox">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt={p.label} /><span className="fxPhN">{i + 1}</span>
                  </span>
                  <figcaption><b>{p.label}</b><span>{p.taken_at ? fmtDate(p.taken_at, true) : ""}</span></figcaption>
                </figure>
              ))}
            </div>
          </section>
        </article>
      )}
    </div>
  );
}
