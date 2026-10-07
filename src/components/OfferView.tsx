// The offer as the client sees it (portal.valuefy.ro/oferta/<token>), also used for the preview in the CRM.
// Layout from the design handoff "Valuefy Oferta".
import { greetName, isCompany, isExpired, money, offerDocs, offerTotals, termSections, type Offer } from "@/lib/offers";
import { orderCode, propertyLabel, type Order } from "@/lib/orders";
import { initials } from "@/lib/guard";
import { OfferAccept, PrintButton } from "./OfferAccept";

const SITE = "https://valuefy.ro";
const PHONE = "+40 766 225 936";
const EMAIL = "contact@valuefy.ro";

const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("ro-RO", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Bucharest" }) : "—");
const stamp = (d: string | null) => (d ? new Date(d).toLocaleString("ro-RO", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Bucharest" }) : "—");

export function OfferView({ offer: o, order, preview = false, toolbar, delivered }: { offer: Offer; order: Order; preview?: boolean; toolbar?: React.ReactNode; delivered?: string | null }) {
  const t = offerTotals(o);
  const docs = offerDocs(o);
  const terms = termSections(o.terms);
  const first = greetName(o.client_name);
  const expired = o.status === "sent" && isExpired(o);
  const open = o.status === "sent" && !expired;
  const accepted = o.status === "accepted";
  const urgent = !!o.accepted_urgent;
  const shown = accepted ? offerTotals(o, urgent) : t;
  const [pill, pillCls] = accepted ? ["Acceptată", "ok"] : o.status === "declined" ? ["Refuzată", "err"] : expired ? ["Expirată", "err"] : o.status === "draft" ? ["Ciornă", ""] : ["Așteaptă acceptarea", "warn"];
  const term = urgent && o.urgent_days ? o.urgent_days : o.term_days;
  const details: [string, string | null][] = [
    ["Proprietate", [order.property_type ? propertyLabel(order.property_type) : null, order.rooms ? `${order.rooms} camere` : null].filter(Boolean).join(", ") || null],
    ["Suprafață utilă", order.surface_area ? `${order.surface_area.toLocaleString("ro-RO")} m²` : null],
    ["Suprafață teren", order.land_area ? `${order.land_area.toLocaleString("ro-RO")} m²` : null],
    ["Localitate", order.city],
    ["Adresă", order.address],
    ["Scop", order.purpose],
    ["Bancă", order.bank],
    ["Documente", docs.length ? (docs.filter((d) => !d.optional).every((d) => d.received) ? "Disponibile" : "Parțial disponibile") : null],
  ];
  const calendar: [string, string][] = [
    ["Ziua 0", "Acceptare și avans"],
    ["Ziua 1–2", "Inspecție la fața locului"],
    [term > 3 ? `Ziua 3–${term}` : "Ziua 3", "Analiză și evaluare"],
    [`Ziua ${Math.max(4, term + 1)}`, "Verificare internă"],
    [`Ziua ${Math.max(5, term + 2)}`, "Raport în portal"],
  ];

  return (
    <div className="ofPage">
      <header className="ofBar no-print">
        <div className="ofBarIn">
          <a href={SITE} aria-label="VALUEFY">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/valuefy-logo.png" alt="VALUEFY" className="ofLogo" />
          </a>
          <div className="ofBarRight">
            <span className={`ofPill ${pillCls}`}><i />{pill}</span>
            <PrintButton />
          </div>
        </div>
      </header>

      <main className="ofMain">
        {preview && (toolbar ?? <div className="ofBanner">Previzualizare din CRM — așa vede clientul oferta. Butoanele de acceptare sunt dezactivate aici.</div>)}
        {delivered && (
          <div className="ofBanner ok" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
            <span><b>Raportul de evaluare este gata</b> (livrat pe {day(delivered)}).</span>
            <a className="ofBtnGold" style={{ height: 44, padding: "0 20px", borderRadius: 999 }} href={`/api/offer/${o.token}/report`}>Descarcă raportul (PDF) ↓</a>
          </div>
        )}
        {o.status === "declined" && <div className="ofBanner err">Oferta a fost refuzată{o.declined_at ? ` pe ${day(o.declined_at)}` : ""}. Pentru o ofertă nouă, scrie-ne la <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</div>}
        {expired && <div className="ofBanner err">Oferta a expirat pe {day(o.valid_until)}. Scrie-ne la <a href={`mailto:${EMAIL}`}>{EMAIL}</a> sau sună la {PHONE} pentru o ofertă actualizată.</div>}

        <section className="ofHero">
          <div className="ofHeroText">
            <p className="ofEyebrow">Ofertă de evaluare · {o.number}</p>
            <h1>{accepted ? `Mulțumim${first ? `, ${first}` : ""}! Oferta este acceptată.` : `Bună${first ? `, ${first}` : " ziua"}. Oferta ta este pregătită.`}</h1>
            <p>{o.message ?? <>Am analizat solicitarea <b>{orderCode(order)}</b>. Mai jos găsești detaliile, costul și modul în care vom realiza evaluarea.</>}</p>
          </div>
          <div className="ofHeroPrice">
            <span className="ofMuted">Total de plată (TVA inclus)</span>
            <b className="ofTotal">{money(shown.total)}</b>
            <span className="ofMuted">Livrare: <b>{term} zile lucrătoare</b> &nbsp; {accepted ? <>Acceptată: <b>{day(o.accepted_at)}</b></> : <>Valabilă până la: <b>{day(o.valid_until)}</b></>}</span>
            {open && <a href="#acceptare" className="ofBtnGold no-print">Acceptă oferta →</a>}
          </div>
        </section>

        <div className="ofGrid2">
          <section className="ofCard">
            <div className="ofPhoto"><span>{orderCode(order)}</span></div>
            <h2>Detaliile solicitării</h2>
            <dl className="ofDl">
              {details.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </section>
          <section className="ofCard">
            <div className="ofCardHead"><h2>Oferta financiară</h2><span className="ofMuted">lei</span></div>
            <ul className="ofLines">
              <li><span><b>Raport de evaluare imobiliară</b><small>Include deplasarea și inspecția, analiza de piață și raportul semnat de evaluator autorizat ANEVAR.</small></span><b>{money(o.fee)}</b></li>
              {o.urgent_fee && o.urgent_days ? (
                <li className={urgent ? "" : "opt"}><span><b>Regim urgent <em>{accepted ? (urgent ? "ales" : "neales") : "opțional"}</em></b><small>Raport livrat în {o.urgent_days} zile lucrătoare de la inspecție, în loc de {o.term_days}.</small></span><b>+ {money(o.urgent_fee)}</b></li>
              ) : null}
            </ul>
            <dl className="ofSum">
              <div><dt>Subtotal</dt><dd>{money(shown.net)}</dd></div>
              <div><dt>TVA {o.vat_rate}%</dt><dd>{money(shown.vat)}</dd></div>
              <div className="tot"><dt>Total</dt><dd>{money(shown.total)}</dd></div>
            </dl>
            {o.payment_terms && <p className="ofNote"><b>Plată:</b> {o.payment_terms}</p>}
          </section>
        </div>

        <section className="ofCard">
          <div className="ofCardHead"><h2>Oferta tehnică</h2><span className="ofBadge">✓ Firmă autorizată ANEVAR</span></div>
          <div className="ofTiles">
            {[["Obiectul evaluării", o.object_text], ["Tipul valorii", o.value_type], ["Abordări de evaluare", o.approaches], ["Standarde", o.standards]]
              .filter(([, v]) => v).map(([k, v]) => <div key={k}><p className="ofEyebrow">{k}</p><p>{v}</p></div>)}
          </div>
          <h3>Calendar estimat</h3>
          <ol className="ofCal">{calendar.map(([d, l], i) => <li key={i}><span><i>{i + 1}</i>{d}</span><b>{l}</b></li>)}</ol>
          <div className="ofGrid2 flat">
            <div>
              <h3>Documente necesare</h3>
              <ul className="ofDocs">
                {docs.map((d) => <li key={d.label} className={d.received ? "ok" : ""}><i>{d.received ? "✓" : "·"}</i><span>{d.label}{d.optional ? " (dacă există)" : ""}</span><small>{d.received ? "Primit" : "De trimis"}</small></li>)}
              </ul>
            </div>
            <div>
              <h3>Livrabile</h3>
              <ul className="ofBullets">
                <li>Raport de evaluare semnat electronic (PDF)</li>
                <li>Anexe: fotografii, comparabile, documente</li>
                <li>Acces la raport în portalul client</li>
              </ul>
            </div>
          </div>
        </section>

        {terms.length > 0 && (
          <section className="ofCard" id="termeni">
            <div className="ofCardHead"><h2>Termenii de referință ai evaluării</h2><span className="ofMuted">conform Standardelor ANEVAR</span></div>
            <ol className="ofTerms">
              {terms.map((s, i) => <li key={i}>{s.title && <b>{s.title}</b>}<p>{s.body}</p></li>)}
            </ol>
          </section>
        )}

        <section className="ofCard ofEval">
          <span className="ofAvatar">{initials(o.evaluator_name ?? "VALUEFY", "v")}</span>
          <div className="ofEvalText">
            <p className="ofEyebrow">Evaluator desemnat</p>
            <b>{o.evaluator_name ?? "Echipa VALUEFY"}</b>
            <small>Evaluator autorizat ANEVAR{o.evaluator_anevar ? ` · legitimația nr. ${o.evaluator_anevar}` : ""}</small>
          </div>
          <div className="ofEvalActions no-print">
            <a className="ofBtnGhost" href={`mailto:${EMAIL}?subject=${encodeURIComponent(`Întrebare despre oferta ${o.number}`)}`}>Am o întrebare</a>
          </div>
        </section>

        {accepted ? (
          <section className="ofCard ofSigned" id="acceptare">
            <div className="ofCardHead"><h2>Acceptare și semnătură</h2><span className="ofPill ok"><i />Semnată</span></div>
            <dl className="ofDl">
              <div><dt>Nume și prenume</dt><dd>{o.accepted_name}</dd></div>
              <div><dt>Data și ora</dt><dd>{stamp(o.accepted_at)}</dd></div>
              <div><dt>Regim</dt><dd>{urgent ? `Urgent (${o.urgent_days ?? 2} zile lucrătoare)` : `Standard (${o.term_days} zile lucrătoare)`}</dd></div>
              <div><dt>Total acceptat</dt><dd>{money(shown.total)} cu TVA</dd></div>
            </dl>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {o.signature && <img className="ofSig" src={o.signature} alt={`Semnătura ${o.accepted_name}`} />}
            <p className="ofMuted small">Clientul a acceptat oferta tehnică și financiară și termenii de referință ai evaluării. Oferta semnată devine contract de prestări servicii odată ce primim toate datele de facturare. Amprentă document: <code>{o.content_hash?.slice(0, 16)}</code></p>
          </section>
        ) : (
          <OfferAccept token={o.token} disabled={!open || preview} urgentFee={o.urgent_fee && o.urgent_days ? money(Math.round(o.urgent_fee * (100 + o.vat_rate)) / 100) : null} urgentDays={o.urgent_days ?? 0}
            defaultName={isCompany(o.client_name) ? "" : o.client_name ?? ""} defaultUrgent={!!order.urgent} />
        )}

        <footer className="ofFoot">Oferta {o.number} · emisă {day(o.sent_at ?? o.created_at)} · VALUEFY · {PHONE} · <a href={`mailto:${EMAIL}`}>{EMAIL}</a></footer>
      </main>
    </div>
  );
}
