import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, portalPage } from "@/lib/guard";
import { canSee, getOrder, orderCode, orderDocuments, orderPlace, orderWhat } from "@/lib/orders";
import { PortalShell } from "@/components/PortalShell";
import { OrderDocuments, OrderInfo } from "@/components/OrderDetails";
import { Avatar } from "@/components/Avatar";
import { orderStatus } from "@/lib/orders";
import { portalPhoto } from "@/lib/portal-orders";
import { isExpired, money, offerForOrder, offerTotals } from "@/lib/offers";
import { orderProgress } from "@/lib/delivery";
import { messagesOf } from "@/lib/messages";
import { docRequests, sharedChat } from "@/lib/order-chat";
import { Messages } from "@/components/Messages";

export const metadata: Metadata = { title: "Comandă | Portal VALUEFY" };
export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nou?: string }> }) {
  const { db, user, base } = await portalPage();
  const { id } = await params;
  const o = await getOrder(db, id);
  if (!o || !canSee(user, o)) notFound();
  const [docs, found, progress] = await Promise.all([orderDocuments(db, id), offerForOrder(db, id), orderProgress(db, o)]);
  const rep = progress.report;
  // a collaborator's order: the conversation with the team, and the documents the team asked for
  const chat = sharedChat(o);
  const [rawMessages, requests] = chat ? await Promise.all([messagesOf(db, "order", id, user.id, true), docRequests(db, id)]) : [[], []];
  // the photos through the portal's own address (the CRM's is for the team only)
  const messages = rawMessages.map((m) => ({ ...m, photo: m.photo && m.author_id ? m.photo.replace(/^\/api\/crm\/users\/([^/]+)\/avatar/, "/api/portal/avatar/$1") : null }));
  const offer = found && found.status !== "draft" ? found : null;
  const expired = offer?.status === "sent" && isExpired(offer);
  const nou = (await searchParams).nou;
  const failed = nou?.startsWith("eroare-") ? Number(nou.slice(7)) : 0;
  // a collaborator's order: no offer; the fee and the term are set by the team when it is processed
  const direct = o.source === "partner";
  const term = direct && rep ? (await db.prepare("SELECT term_days FROM reports WHERE id = ?").bind(rep.id).first<{ term_days: number | null }>())?.term_days ?? null : null;
  // the inspection as the collaborator needs it (when, who comes, who opens the door, where) and the report's team
  const [insp, team, sheets] = rep ? await Promise.all([
    db.prepare(`SELECT i.status, i.scheduled_at, i.done_at, i.contact_name, i.contact_phone, COALESCE(NULLIF(u.name, ''), u.email) AS inspector, u.phone AS inspector_phone, u.id AS inspector_id, u.avatar_at AS inspector_av,
        COALESCE(p.full_address, p.city) AS address, p.city
      FROM inspections i LEFT JOIN users u ON u.id = i.inspector_id LEFT JOIN assets a ON a.id = i.asset_id LEFT JOIN crm_properties p ON p.id = a.property_id
      WHERE i.report_id = ? AND i.status <> 'cancelled' ORDER BY (i.status = 'done') ASC, a.is_main DESC, i.created_at DESC LIMIT 1`).bind(rep.id)
      .first<{ status: string; scheduled_at: string | null; done_at: string | null; contact_name: string | null; contact_phone: string | null; inspector: string | null; inspector_phone: string | null; inspector_id: string | null; inspector_av: string | null; address: string | null; city: string | null }>(),
    db.prepare(`SELECT m.role, COALESCE(NULLIF(u.name, ''), u.email) AS name, u.id, u.avatar_at FROM report_members m JOIN users u ON u.id = m.user_id
      WHERE m.report_id = ? AND m.role IN ('evaluator', 'inspector') ORDER BY m.role = 'evaluator' DESC`).bind(rep.id).all<{ role: string; name: string; id: string; avatar_at: string | null }>().then((x) => x.results),
    db.prepare(`SELECT COUNT(*) AS n, (SELECT COUNT(*) FROM inspection_photos f JOIN inspections i2 ON i2.id = f.inspection_id WHERE i2.report_id = ?1 AND f.deleted_at IS NULL) AS photos
      FROM inspections i WHERE i.report_id = ?1 AND i.status = 'done'`).bind(rep.id).first<{ n: number; photos: number }>(),
  ]) : [null, [], null];
  const [stLabel] = orderStatus(o);
  const steps = progress.steps, reached = progress.reached;
  const current = steps[Math.min(reached, steps.length - 1)];
  const delivered = !!rep?.delivered_at;
  const when = (iso: string | null, time = true) => (iso ? fmtDate(iso, time && iso.length > 10) : null);
  // the inspection in the calendar (Google Calendar link; the time is Romania's)
  const cal = insp?.status === "scheduled" && insp.scheduled_at ? (() => {
    // stored as Romania's local time ("2026-11-06T10:30") or as UTC ("…Z"): Google reads the first with ctz, the second as is
    const v = insp.scheduled_at!, utc = v.endsWith("Z");
    const start = new Date(utc ? v : `${v.slice(0, 16)}:00Z`), end = new Date(start.getTime() + 60 * 60000);
    const f = (x: Date) => x.toISOString().slice(0, 19).replace(/[-:]/g, "") + (utc ? "Z" : "");
    const q = new URLSearchParams({ action: "TEMPLATE", text: `Inspecție evaluare · ${orderCode(o)}`, dates: `${f(start)}/${f(end)}`, ctz: "Europe/Bucharest",
      location: insp.address ?? orderPlace(o), details: `Inspector: ${insp.inspector ?? "VALUEFY"}${insp.contact_name ? `\nContact: ${insp.contact_name} ${insp.contact_phone ?? ""}` : ""}` });
    return `https://calendar.google.com/calendar/render?${q}`;
  })() : null;

  return (
    <PortalShell back={{ href: `${base}/comenzi`, label: "Comenzi" }} user={user} base={base} active="orders" title={`Comanda ${orderCode(o)}`} subtitle={`${orderWhat(o)} · ${orderPlace(o)}`}>
      {nou && (
        <div className={failed ? "note" : "okMsg"}>
          {failed
            ? `Comanda ${orderCode(o)} a fost trimisă, dar ${failed} document${failed > 1 ? "e nu au" : " nu a"} putut fi încărcat${failed > 1 ? "e" : ""}. Încearcă din nou mai jos.`
            : `Comanda ${orderCode(o)} a fost trimisă. ${direct ? "Stabilim onorariul și termenul" : "Pregătim oferta"} și revenim în cel mai scurt timp.`}
        </div>
      )}

      <section className="poHead">
        <div>
          <span className="poCode">COMANDA <b>{orderCode(o)}</b></span>
          <h2>{orderWhat(o)} · {orderPlace(o)}</h2>
          <p>{[o.client_name && `Client: ${o.client_name}`, o.bank, o.purpose, `trimisă ${fmtDate(o.created_at, !o.glide_id)}`].filter(Boolean).join(" · ")}</p>
        </div>
        <span className={`poState${delivered ? " ok" : o.status === "cancelled" ? " off" : ""}`}>{delivered ? `✓ Livrată ${fmtDate(rep!.delivered_at)}` : o.status === "cancelled" ? "Anulată" : `${stLabel}${rep?.due ? ` · termen ${fmtDate(rep.due)}` : ""}`}</span>
      </section>

      <section className="card poFlow" aria-label="Unde este comanda">
        <div className="cardHead"><h2>{delivered ? "Parcursul comenzii" : "Unde este comanda"}</h2>
          <span className="muted">{delivered ? `livrată ${fmtDate(rep!.delivered_at)}` : o.status === "cancelled" ? "comandă anulată" : `${Math.min(reached, steps.length)} din ${steps.length} pași făcuți · urmează: ${current.label.toLowerCase()}`}</span></div>
        <ol className="poSteps">
          {steps.map((st, i) => {
            const state = i < reached || (delivered && i === steps.length - 1) ? "done" : i === reached && o.status !== "cancelled" ? "now" : "";
            const at = i === 0 ? when(o.created_at, !o.glide_id) : st.at && i <= reached ? when(st.at) : null;
            const sub = state === "now" && i === 2 && insp?.status === "scheduled" && insp.scheduled_at ? `${fmtDate(insp.scheduled_at, true)}${insp.inspector ? ` · ${insp.inspector}` : ""}`
              : state === "now" && i === steps.length - 1 && rep?.due ? `estimat ${fmtDate(rep.due)}` : null;
            return (
              <li key={st.label} className={state}>
                <span className="poDot" aria-hidden="true">{state === "done" ? "✓" : i + 1}</span>
                <b>{st.label}</b>
                <small>{sub ?? at ?? (state ? "" : i === steps.length - 1 && rep?.due ? `estimat ${fmtDate(rep.due)}` : "urmează")}</small>
              </li>
            );
          })}
        </ol>
      </section>

      {delivered && rep?.final && (
        <section className="card poReport">
          <span className="poPdf" aria-hidden="true">PDF</span>
          <div><span className="poEyebrow">RAPORTUL DE EVALUARE</span><b>Raportul semnat este gata</b><span className="muted">Livrat {fmtDate(rep.delivered_at)}. Îl poți descărca oricând de aici.</span></div>
          <a className="btn btnGold" href={`/api/portal/orders/${o.id}/report`}>Descarcă raportul ↓</a>
        </section>
      )}

      <div className="poCols">
        <div className="poCol">
          {rep && insp && (
            <section className="card">
              <div className="cardHead"><h2>Inspecția</h2>
                <span className={`pill ${insp.status === "done" ? "pillOk" : insp.status === "scheduled" ? "pillWarn" : ""}`}><i />{insp.status === "done" ? "Realizată" : insp.status === "scheduled" ? "Programată" : "De programat"}</span></div>
              <div className="poFacts">
                <div><small>Când</small><b>{insp.status === "done" ? fmtDate(insp.done_at, true) : insp.scheduled_at ? fmtDate(insp.scheduled_at, true) : "Te sunăm pentru programare"}</b></div>
                <div><small>Inspector</small><span className="poWho">{insp.inspector_id && insp.inspector && <Avatar id={insp.inspector_id} name={insp.inspector} size={30} photo={portalPhoto(insp.inspector_id, insp.inspector_av)} />}<b>{insp.inspector ?? "se alocă"}</b></span>{insp.inspector_phone && <a href={`tel:${insp.inspector_phone.replace(/\s/g, "")}`}>{insp.inspector_phone}</a>}</div>
                <div><small>Persoana de contact</small><b>{insp.contact_name ?? o.contact_name ?? o.client_name ?? "—"}</b>{(insp.contact_phone ?? o.contact_phone) && <a href={`tel:${(insp.contact_phone ?? o.contact_phone ?? "").replace(/\s/g, "")}`}>{insp.contact_phone ?? o.contact_phone}</a>}</div>
              </div>
              <p className="hint">{insp.address ?? orderPlace(o)}</p>
              {cal && <div className="actions"><a className="btn btnGhost btnSm" href={cal} target="_blank" rel="noopener">Adaugă în calendar</a></div>}
            </section>
          )}
          {offer && (
            <section className="card" style={{ border: `1.5px solid ${offer.status === "sent" && !expired ? "var(--acc)" : "var(--line)"}` }}>
              <div className="cardHead">
                <h2>Oferta de evaluare {offer.number}</h2>
                <span className={`pill ${offer.status === "accepted" ? "pillOk" : offer.status === "declined" || expired ? "pillErr" : "pillWarn"}`}><i />
                  {offer.status === "accepted" ? "Acceptată" : offer.status === "declined" ? "Refuzată" : expired ? "Expirată" : "De acceptat"}</span>
              </div>
              <dl className="dl">
                <div><dt>Onorariu (cu TVA)</dt><dd>{money(offerTotals(offer, !!offer.accepted_urgent).total)}</dd></div>
                <div><dt>Termen</dt><dd>{offer.accepted_urgent && offer.urgent_days ? offer.urgent_days : offer.term_days} zile lucrătoare de la inspecție</dd></div>
                <div><dt>{offer.status === "accepted" ? "Acceptată" : "Valabilă până la"}</dt><dd>{fmtDate(offer.accepted_at ?? offer.valid_until)}</dd></div>
              </dl>
              <a className={`btn ${offer.status === "sent" && !expired ? "btnGold" : "btnGhost"}`} style={{ alignSelf: "flex-start" }} href={`${base}/oferta/${offer.token}`}>
                {offer.status === "sent" && !expired ? "Vezi oferta și acceptă →" : "Vezi oferta"}
              </a>
            </section>
          )}
          {direct && !o.processed_at && o.status === "received" && <section className="card" style={{ border: "1.5px solid var(--line)" }}>
            <div className="cardHead"><h2>Confirmarea comenzii</h2><span className="pill"><i />În analiză</span></div>
            <div className="actions" style={{ flexWrap: "nowrap" }}>
              <span className="spinner" aria-hidden />
              <p className="hint" style={{ fontSize: 14 }}>Analizăm comanda și stabilim onorariul și termenul de predare. Te anunțăm pe email.</p>
            </div>
          </section>}
          {!direct && !offer && o.status === "received" && <section className="card" style={{ border: "1.5px solid var(--line)" }}>
            <div className="cardHead"><h2>Oferta de evaluare</h2><span className="pill"><i />În pregătire</span></div>
            <div className="actions" style={{ flexWrap: "nowrap" }}>
              <span className="spinner" aria-hidden />
              <p className="hint" style={{ fontSize: 14 }}>Analizăm comanda și pregătim oferta: onorariul și termenul de livrare. Te anunțăm pe email când este gata.</p>
            </div>
          </section>}
          {!o.glide_id && <OrderDocuments o={o} docs={docs} canUpload={o.status !== "done" && o.status !== "cancelled"} href={(d) => `/api/portal/orders/${o.id}/documents/${d.id}`} requests={requests} />}
          <OrderInfo o={o} />
        </div>
        <aside className="poCol">
          <section className="card">
            <div className="cardHead"><h2>Livrabile</h2><span className="muted">apar pe rând</span></div>
            <ul className="poDeliv">
              <li className={delivered && rep?.final ? "ok" : ""}>
                <span className="poDot" aria-hidden="true">{delivered && rep?.final ? "✓" : ""}</span>
                <span><b>Raportul de evaluare</b><small>{delivered ? `PDF semnat · ${fmtDate(rep!.delivered_at)}` : rep?.due ? `PDF semnat · estimat ${fmtDate(rep.due)}` : "PDF semnat, la finalizare"}</small></span>
                {delivered && rep?.final ? <a className="link" href={`/api/portal/orders/${o.id}/report`}>Descarcă ↓</a> : <em>{rep ? "în lucru" : "urmează"}</em>}
              </li>
              <li className={sheets?.n ? "ok" : ""}>
                <span className="poDot" aria-hidden="true">{sheets?.n ? "✓" : ""}</span>
                <span><b>Inspecția și fotografiile</b><small>{sheets?.n ? `făcută ${fmtDate(insp?.done_at ?? null)}${sheets.photos ? ` · ${sheets.photos} fotografii` : ""} · incluse în raport` : insp?.scheduled_at ? `după vizita din ${fmtDate(insp.scheduled_at)}` : "după vizită"}</small></span>
                <em>{sheets?.n ? "gata" : "urmează"}</em>
              </li>
            </ul>
            {direct && o.processed_at && o.fee != null && <p className="hint">Onorariu {money(o.fee)} + TVA{term ? ` · ${term} zile lucrătoare de la inspecție` : ""}{o.urgent ? " · urgent" : ""}.</p>}
          </section>
          {chat && <Messages entity="order" id={o.id} rows={messages} post={`/api/portal/orders/${o.id}/messages`} title="Mesaje cu echipa"
            hint="Întrebări despre comandă, acte, programare: îți răspundem aici și pe email." empty="Niciun mesaj încă. Scrie-ne dacă ai o întrebare." />}
          {team.length > 0 && (
            <section className="card poTeam">
              <span className="poEyebrow">ECHIPA COMENZII</span>
              {team.map((m) => (
                <span key={m.role + m.id} className="poPerson"><Avatar id={m.id} name={m.name} size={34} photo={portalPhoto(m.id, m.avatar_at)} /><span><b>{m.name}</b><small>{m.role === "evaluator" ? "evaluator" : "inspector"}</small></span></span>
              ))}
            </section>
          )}
        </aside>
      </div>
    </PortalShell>
  );
}
