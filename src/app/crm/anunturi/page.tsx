import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { listAll, listInquiries } from "@/lib/listings";
import { formatEur, siteUrl } from "@/lib/listing-format";
import { CrmShell } from "@/components/CrmShell";
import { InquiryStatus, PublishToggle } from "./ListingControls";

export const metadata: Metadata = { title: "Anunțuri imobiliare | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** Properties for sale on valuefy.ro/imobiliare, and the viewing / report requests sent from their pages. */
export default async function ListingsPage() {
  const { db, user, base } = await staffPage("listings");
  const [listings, inquiries] = await Promise.all([listAll(db), listInquiries(db)]);
  const fresh = inquiries.filter((i) => i.status === "NEW").length;

  return (
    <CrmShell
      user={user} base={base} active="listings" title="Anunțuri imobiliare"
      subtitle={`${listings.length} anunțuri · ${listings.filter((l) => l.published).length} publicate pe valuefy.ro`}
      actions={<a href={`${base}/anunturi/nou`} className="btn btnGold btnSm">+ Anunț nou</a>}
    >
      <section className="card">
        <h2>Anunțuri</h2>
        {listings.length === 0 ? <div className="empty">Nu există încă niciun anunț. Apasă „Anunț nou” ca să începi.</div> : (
          <ul className="lstList">
            {listings.map((l) => (
              <li key={l.id}>
                <a href={`${base}/anunturi/${l.id}`} className="lstThumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {l.photos[0] ? <img src={l.photos[0]} alt="" loading="lazy" /> : <span>fără foto</span>}
                </a>
                <div className="lstMain">
                  <a href={`${base}/anunturi/${l.id}`} className="rowLink">{l.title}</a>
                  <div className="muted">
                    {l.type} · {[l.zone, l.city].filter(Boolean).join(", ")} · <b>{formatEur(l.price)}</b> · {l.photos.length} foto
                    {l.report && <span className="pill" style={{ marginLeft: 8 }}>Raport</span>}
                    {l.status && <span className="pill pillWarn" style={{ marginLeft: 6 }}>{l.status}</span>}
                  </div>
                </div>
                <PublishToggle id={l.id} published={l.published} />
                <div className="actions">
                  <a href={`${base}/anunturi/${l.id}`} className="btn btnGhost btnSm">Editează</a>
                  {l.published && <a href={siteUrl(l.slug)} target="_blank" rel="noopener" className="btn btnGhost btnSm">Vezi ↗</a>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" id="cereri">
        <h2>Cereri primite <span className="muted">{inquiries.length} cereri · {fresh} noi</span></h2>
        <p className="hint">Programări la vizionare și cereri de raport trimise din paginile anunțurilor. Rapoartele de evaluare nu se trimit automat: trimite-le pe email după verificare, apoi schimbă statusul.</p>
        {inquiries.length === 0 ? <div className="empty">Încă nu există cereri de vizionare sau de raport.</div> : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Data</th><th>Tip</th><th>Proprietate</th><th>Persoană</th><th>Contact</th><th>Motiv / mesaj</th><th>Status</th></tr></thead>
              <tbody>
                {inquiries.map((q) => (
                  <tr key={q.id} className={q.status === "NEW" ? "lstNew" : undefined}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDate(q.created_at, true)}</td>
                    <td><span className="pill">{q.kind === "report" ? "Raport" : "Vizionare"}</span></td>
                    <td>{q.listing_id ? <a className="rowLink" href={`${base}/anunturi/${q.listing_id}`}>{q.listing_title}</a> : q.listing_title}</td>
                    <td>{q.name}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {q.phone && <a href={`tel:${q.phone.replace(/\s/g, "")}`}>{q.phone}</a>}
                      {q.email && <><br /><a href={`mailto:${q.email}`}>{q.email}</a></>}
                    </td>
                    <td className="lstMsg">{[q.reason, q.message].filter(Boolean).join(" — ") || <span className="muted">—</span>}</td>
                    <td><InquiryStatus id={q.id} status={q.status} kind={q.kind} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </CrmShell>
  );
}
