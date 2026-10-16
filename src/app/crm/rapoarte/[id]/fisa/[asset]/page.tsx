import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { reportAccess } from "@/lib/perms-db";
import { inspectionSheetDoc } from "@/lib/insp-sheet-doc";
import { ROOM_FIELDS } from "@/lib/insp-forms";
import { SheetToolbar } from "./SheetToolbar";

export const metadata: Metadata = { title: "Fișa de inspecție | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const cap = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");

/** The inspection sheet of an asset, printable / saved as PDF from the browser, to attach to the valuation report. */
export default async function InspectionSheetDocument({ params }: { params: Promise<{ id: string; asset: string }> }) {
  const { db, base, user } = await staffPage();
  const { id, asset } = await params;
  const rep = await db.prepare("SELECT id, status, delivered_at FROM reports WHERE id = ?").bind(id).first<{ id: string; status: string; delivered_at: string | null }>();
  if (!rep || !(await reportAccess(db, user, rep)).view) notFound();
  const d = await inspectionSheetDoc(db, id, asset);
  if (!d) notFound();
  const kv = (k: string, v: string | number | null | undefined) => (v || v === 0 ? <><dt>{k}</dt><dd>{v}</dd></> : null);
  return (
    <div className="cdWrap">
      <SheetToolbar back={`${base}/rapoarte/${id}?tab=inspectii#fisa-${asset}`} />
      {d.sheet.status !== "submitted" && <div className="cdWarn">Fișa nu a fost încă trimisă din aplicație: documentul arată ciorna salvată până acum.</div>}
      <article className="cdPage fsPage">
        <header className="cdHead">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/valuefy-logo.png" alt="VALUEFY" />
          <span>Anexă la raportul de evaluare{d.report.number ? ` nr. ${d.report.number}` : ""}</span>
        </header>
        <h1>FIȘĂ DE INSPECȚIE · {d.property.type ? cap(d.property.type).toUpperCase() : "PROPRIETATE"}</h1>

        <div className="cdParties">
          <section>
            <h3>PROPRIETATEA</h3>
            <dl>{kv("Adresa", d.property.address)}{kv("Carte funciară", d.property.cf)}{kv("Nr. cadastral", d.property.cad)}{kv("Suprafață utilă (acte)", d.property.usable_area ? `${d.property.usable_area.toLocaleString("ro-RO")} m²` : null)}</dl>
          </section>
          <section>
            <h3>INSPECȚIA</h3>
            <dl>
              {kv("Data", d.inspection.done_at ? fmtDate(d.inspection.done_at, true) : d.sheet.submitted_at ? fmtDate(d.sheet.submitted_at, true) : null)}
              {kv("Inspector", d.inspection.inspector ? `${d.inspection.inspector}${d.inspection.inspector_anevar ? ` (leg. ANEVAR ${d.inspection.inspector_anevar})` : ""}` : null)}
              {kv("Persoană prezentă", d.sheet.present ? `${d.sheet.present}${d.sheet.role ? `, ${d.sheet.role.toLowerCase()}` : ""}` : null)}
              {kv("Client", d.report.client)}{kv("Destinatar", d.report.bank)}{kv("Localizare GPS", d.sheet.location)}
            </dl>
          </section>
        </div>

        {d.sections.map((s) => (
          <section key={s.title} className="fsSection">
            <h2>{s.title}</h2>
            <table className="cdTable fsKv"><tbody>{s.rows.map((r) => <tr key={r.label}><th>{r.label}</th><td>{r.value}</td></tr>)}</tbody></table>
          </section>
        ))}

        {d.rooms.length > 0 && (
          <section className="fsSection">
            <h2>Încăperi (conform releveu)</h2>
            <table className="cdTable">
              <thead><tr><th>Poz.</th><th>Încăpere</th><th>Nivel</th><th>S (m²)</th><th>{ROOM_FIELDS.floor.label}</th><th>{ROOM_FIELDS.walls.label}</th><th>{ROOM_FIELDS.ceiling.label}</th><th>Stare</th></tr></thead>
              <tbody>
                {d.rooms.map((r) => (
                  <tr key={r.id}>
                    <td>{r.pos}</td><td>{r.name}{r.notes ? <div className="fsNote">{r.notes}</div> : null}</td><td>{r.level}</td><td>{r.area}</td>
                    <td>{(r.floor ?? []).join(", ")}</td><td>{(r.walls ?? []).join(", ")}</td><td>{r.ceiling}</td><td>{r.condition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {d.notes && (<section className="fsSection"><h2>Observații</h2><p>{d.notes}</p></section>)}

        <div className="cdSign">
          <div>
            <b>Inspector</b>
            <small>{d.inspection.inspector ?? ""}</small>
            <div className="cdSignLine" />
          </div>
          <div>
            <b>Persoana prezentă la inspecție</b>
            <small>{d.sheet.present ?? ""}{d.sheet.role ? ` · ${d.sheet.role}` : ""}</small>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {d.sheet.signature ? <img className="fsSig" src={d.sheet.signature} alt="Semnătură" /> : <div className="cdSignLine" />}
          </div>
        </div>
      </article>

      {d.photos.length > 0 && (
        <article className="cdPage fsPage fsPhotosPage">
          <header className="cdHead">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/valuefy-logo.png" alt="VALUEFY" />
            <span>Documentar foto · {d.property.address ?? ""}</span>
          </header>
          <div className="fsPhotos">
            {d.photos.map((p, i) => (
              <figure key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.src} alt={p.label} loading="lazy" />
                <figcaption>{p.label}</figcaption>
              </figure>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}
