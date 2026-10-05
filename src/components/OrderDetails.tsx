// Order content shared by the portal and the CRM: status, details and documents.
import { fmtDate } from "@/lib/guard";
import { DOCS, docLabel, fmtSize, missingDocs, orderRef, orderStatus, propertyLabel, STAGES, type Order, type OrderDocument } from "@/lib/orders";
import { DocUpload } from "./DocUpload";

export function OrderStatusCard({ o, docs }: { o: Order; docs: OrderDocument[] }) {
  const [label, cls] = orderStatus(o);
  const missing = missingDocs(o.property_type, docs);
  return (
    <section className="card">
      <div className="cardHead">
        <h2>Status comandă</h2>
        <span className="actions" style={{ gap: 6 }}>
          {o.urgent ? <span className="pill pillErr"><i />Urgent</span> : null}
          <span className={`pill ${cls}`}><i />{label}</span>
        </span>
      </div>
      {missing.length > 0 && (
        <div className="note"><b>Documente lipsă:</b> {missing.map((d) => d.label).join(", ")}.</div>
      )}
      <ol className="timeline">
        {STAGES.map((s, i) => {
          const state = i === 0 ? "on" : i === 1 && missing.length ? "warn" : "";
          return (
            <li key={s} className={state}>
              <span className="dot">{state === "warn" ? "!" : ""}</span>
              <span>{s}{i === 0 && <span className="muted"> · {fmtDate(o.created_at, true)}</span>}{state === "warn" && <span className="muted"> · așteptăm documentele</span>}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const yes = (v: number) => (v ? "Da" : "Nu");

export function OrderInfo({ o, showSource }: { o: Order; showSource?: boolean }) {
  const area = [o.surface_area && `${String(o.surface_area).replace(".", ",")} mp utili`, o.rooms && `${o.rooms} camere`, o.land_area && `${String(o.land_area).replace(".", ",")} mp teren`].filter(Boolean).join(" · ");
  return (
    <section className="card">
      <h2>Detalii</h2>
      <div className="section" style={{ borderTop: 0, paddingTop: 0 }}>Proprietate</div>
      <dl className="dl">
        <div><dt>Tip</dt><dd>{propertyLabel(o.property_type)}</dd></div>
        <div><dt>Adresă</dt><dd>{o.address}, {o.city}</dd></div>
        {area && <div><dt>Suprafețe</dt><dd>{area}</dd></div>}
        <div><dt>Scop</dt><dd>{o.purpose}{o.bank ? ` · ${o.bank}` : ""}</dd></div>
        <div><dt>Termen</dt><dd>{o.urgent ? "Urgent (~2 zile lucrătoare)" : "Standard (~5 zile lucrătoare)"}</dd></div>
      </dl>
      <div className="section">Client și inspecție</div>
      <dl className="dl">
        <div><dt>Client</dt><dd>{o.client_name}</dd></div>
        <div><dt>Telefon client</dt><dd><a href={`tel:${o.client_phone.replace(/\s/g, "")}`}>{o.client_phone}</a></dd></div>
        {o.client_email && <div><dt>Email client</dt><dd><a href={`mailto:${o.client_email}`}>{o.client_email}</a></dd></div>}
        {o.contact_name && <div><dt>Contact inspecție</dt><dd>{o.contact_name} · <a href={`tel:${(o.contact_phone ?? "").replace(/\s/g, "")}`}>{o.contact_phone}</a></dd></div>}
        {o.source === "partner" && <div><dt>Evaluatorul poate contacta clientul</dt><dd>{yes(o.may_contact_client)}</dd></div>}
        {o.inspection_notes && <div style={{ gridColumn: "1 / -1" }}><dt>Observații inspecție</dt><dd style={{ fontWeight: 500, whiteSpace: "pre-wrap" }}>{o.inspection_notes}</dd></div>}
      </dl>
      {(o.notes || showSource) && <div className="section">Comandă</div>}
      <dl className="dl">
        {showSource && <div><dt>Trimisă de</dt><dd>{o.creator_name || o.creator_email}{o.partner_name ? ` · ${o.partner_name}` : " · client direct"}</dd></div>}
        {showSource && <div><dt>Trimisă la</dt><dd>{fmtDate(o.created_at, true)}</dd></div>}
        {o.notes && <div style={{ gridColumn: "1 / -1" }}><dt>Observații</dt><dd style={{ fontWeight: 500, whiteSpace: "pre-wrap" }}>{o.notes}</dd></div>}
      </dl>
    </section>
  );
}

/** Uploaded documents (open / download) and, in the portal, upload buttons for what is still missing. */
export function OrderDocuments({ o, docs, href, canUpload }: { o: Order; docs: OrderDocument[]; href: (d: OrderDocument) => string; canUpload: boolean }) {
  const missing = missingDocs(o.property_type, docs);
  const optional = DOCS[o.property_type].filter((d) => d.optional && !docs.some((x) => x.kind === d.key));
  return (
    <section className="card">
      <div className="cardHead">
        <h2>Documente</h2>
        <span className={`pill ${missing.length ? "pillWarn" : "pillOk"}`}><i />{docs.length} încărcat{docs.length === 1 ? "" : "e"}{missing.length ? ` · ${missing.length} lipsă` : ""}</span>
      </div>
      <ul className="docList">
        {docs.map((d) => (
          <li key={d.id}>
            <span className="docDot file" aria-hidden>{(d.filename.split(".").pop() || "").slice(0, 4).toUpperCase()}</span>
            <span className="who">
              <b>{docLabel(o.property_type, d.kind)}</b>
              <span className="muted">{d.filename} · {fmtSize(d.size_bytes)} · {fmtDate(d.created_at, true)}{d.uploader_name ? ` · ${d.uploader_name}` : ""}</span>
            </span>
            <a className="btn btnGhost btnSm" href={href(d)} target="_blank" rel="noopener">Deschide</a>
          </li>
        ))}
        {missing.map((d) => (
          <li key={d.key}>
            <span className="docDot miss" aria-hidden>?</span>
            <span className="who"><b>{d.label}</b><span className="muted">lipsește</span></span>
            {canUpload && <DocUpload orderId={o.id} kind={d.key} />}
          </li>
        ))}
        {canUpload && optional.map((d) => (
          <li key={d.key}>
            <span className="docDot" aria-hidden />
            <span className="who"><b>{d.label}</b><small className="muted">opțional</small></span>
            <DocUpload orderId={o.id} kind={d.key} />
          </li>
        ))}
        {canUpload && (
          <li>
            <span className="docDot" aria-hidden>+</span>
            <span className="who"><b>Alt document</b></span>
            <DocUpload orderId={o.id} kind="other" label="↑ Adaugă" />
          </li>
        )}
        {!docs.length && !missing.length && !canUpload && <li><span className="muted">Niciun document încărcat.</span></li>}
      </ul>
    </section>
  );
}

export const orderTitle = (o: Pick<Order, "seq" | "property_type" | "city">) => `${orderRef(o.seq)} · ${propertyLabel(o.property_type)}, ${o.city}`;
