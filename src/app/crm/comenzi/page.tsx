import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { allOrders, orderCode, orderPlace, orderStatus, orderWhat } from "@/lib/orders";
import { CrmShell } from "@/components/CrmShell";
import { OrdersTable } from "./OrdersTable";
import { BankOrdersTable } from "./BankOrdersTable";
import { BankMailPaste } from "./BankMailPaste";

export const metadata: Metadata = { title: "Comenzi | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/**
 * One inbox per channel: valuation requests from the website, partners (brokers) in the portal, bank orders under
 * framework contracts, orders under collaboration agreements, and direct clients (portal clients, direct work).
 * (Properties offered for sale on the website are left out for now.)
 */
const TAB_SOURCES: Record<string, string[]> = { site: ["site"], parteneri: ["partner"], banci: ["bank"], colaborari: ["collab"], directe: ["client", "direct"] };
export default async function CrmOrdersPage({ searchParams }: { searchParams: Promise<{ f?: string; tab?: string }> }) {
  const { db, user, base } = await staffPage();
  const sp = await searchParams;
  const [orders, mails] = await Promise.all([
    allOrders(db),
    sp.tab === "banci"
      ? db.prepare("SELECT id, received_at, via, mail_from, subject, bank, bank_ref, client_name, status, order_id FROM bank_emails ORDER BY received_at DESC LIMIT 8")
        .all<{ id: string; received_at: string; via: string; mail_from: string | null; subject: string | null; bank: string | null; bank_ref: string | null; client_name: string | null; status: string; order_id: string | null }>().then((r) => r.results)
      : Promise.resolve([]),
  ]);
  // Calendar day in Romania, so "astăzi" matches the team's day.
  const day = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
  const today = day(new Date().toISOString());
  const rows = orders.map((o) => ({
    id: o.id, ref: orderCode(o), created: fmtDate(o.created_at, !o.glide_id), type: orderWhat(o), address: orderPlace(o),
    client: o.client_name ?? "—", clientPhone: o.client_phone, from: o.source === "collab" ? o.collab_firm ?? "Colaborare" : o.source === "site" ? "valuefy.ro" : o.creator_name || o.creator_email || "—",
    fromId: o.created_by, firm: o.partner_name, firmId: o.partner_id, source: o.source, purpose: (o.purpose ?? "—") + (o.bank ? ` · ${o.bank}` : ""), bank: o.bank,
    bankRef: o.bank_ref, branch: o.bank_branch, reportType: o.report_type, fee: o.fee, contract: o.contract_number,
    urgent: !!o.urgent, unread: !o.viewed_at, docs: o.doc_count, docsMissing: !!o.docs_missing, status: orderStatus(o),
    today: day(o.created_at) === today, pending: o.status === "received",
  }));
  const inTab = (k: string) => rows.filter((r) => TAB_SOURCES[k].includes(r.source));
  // Without a chosen tab: the first channel with unopened orders, else the website.
  const tab = sp.tab && sp.tab in TAB_SOURCES ? sp.tab : Object.keys(TAB_SOURCES).find((k) => inTab(k).some((r) => r.unread)) ?? "site";
  const current = inTab(tab);
  const banks = inTab("banci");
  const unread = (list: typeof rows) => list.filter((r) => r.unread).length;
  const TABS: [string, string, typeof rows][] = [
    ["site", "Site valuefy.ro", inTab("site")],
    ["parteneri", "Parteneri", inTab("parteneri")],
    ["banci", "Bănci · contracte cadru", banks],
    ["colaborari", "Colaborări", inTab("colaborari")],
    ["directe", "Clienți direcți", inTab("directe")],
  ];
  const tabQs = tab === "site" ? "" : `tab=${tab}`;
  const link = (f: string) => `${base}/comenzi?${tabQs ? `${tabQs}&` : ""}f=${f}`;
  // The cards count the open tab; "Noi astăzi" also says where today's orders came from.
  const CARDS: [string, string, string, number, string][] = [
    ["pending", "Neprocesate", "var(--info)", current.filter((r) => r.pending).length, tab === "banci" || tab === "colaborari" ? "raport necreat încă" : "fără ofertă încă"],
    ["today", "Noi astăzi", "var(--acc)", current.filter((r) => r.today).length,
      TABS.map(([, l, list]) => [l, list.filter((r) => r.today).length] as const).filter(([, n]) => n).map(([l, n]) => `${n} ${l.split(" ")[0].toLowerCase()}`).join(" · ") || "nicio comandă azi"],
    ["new", "Nedeschise", "var(--acc-ink)", unread(current), "nimeni nu le-a deschis"],
    ["docs", "Documente lipsă", "var(--err)", current.filter((r) => r.docsMissing).length, "așteaptă documente"],
    ["urgent", "Urgente", "var(--err)", current.filter((r) => r.urgent && r.pending).length, "neprocesate, termen ~2 zile"],
  ];
  const NEW_WORK: Record<string, [string, string]> = {
    banci: ["+ Lucrare bancă", `${base}/comenzi/noua`], colaborari: ["+ Lucrare colaborare", `${base}/comenzi/noua?tip=colaborare`], directe: ["+ Contract nou (lucrare directă)", `${base}/contracte/nou`],
  };
  const action = NEW_WORK[tab] ?? ["+ Lucrare bancă / colaborare", `${base}/comenzi/noua`];

  return (
    <CrmShell user={user} base={base} active="orders" title="Comenzi primite" subtitle={`${orders.length.toLocaleString("ro-RO")} comenzi${unread(rows) ? ` · ${unread(rows)} noi` : ""}`}
      actions={<a href={action[1]} className="btn btnGold btnSm">{action[0]}</a>}>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {CARDS.map(([f, label, dot, n, sub]) => (
          <a key={f} className="kpi" href={sp.f === f ? `${base}/comenzi${tabQs ? `?${tabQs}` : ""}` : link(f)} aria-current={sp.f === f ? "true" : undefined} style={{ ["--dot" as string]: dot }}>
            <span><i />{label}</span>
            <b>{n}</b>
            <small className="muted">{sub}</small>
          </a>
        ))}
      </div>
      <nav className="tabs" aria-label="Tip comenzi">
        {TABS.map(([k, label, list]) => (
          <a key={k} href={`${base}/comenzi${k === "site" ? "" : `?tab=${k}`}`} aria-current={tab === k ? "page" : undefined}>
            {label} <small>{unread(list) ? `${unread(list)} noi` : list.length.toLocaleString("ro-RO")}</small>
          </a>
        ))}
      </nav>
      {tab !== "banci" ? <OrdersTable key={tab} rows={current} base={base} initial={sp.f ?? "all"} />
        : (
          <>
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <p className="hint" style={{ margin: 0 }}>Comenzile BCR și BRD intră automat din emailul băncii; le completezi la „Procesează”.</p>
              <BankMailPaste base={base} />
            </div>
            <BankOrdersTable rows={banks} base={base} initial={sp.f ?? "all"} />
            {mails.length > 0 && (
              <section className="card flush">
                <div className="cardHead" style={{ padding: "16px 22px 0" }}><h2>Ultimele emailuri de la bănci</h2></div>
                <div className="tableWrap">
                  <table className="table">
                    <thead><tr><th>Primit</th><th>Bancă · cerere</th><th>Client</th><th>Rezultat</th></tr></thead>
                    <tbody>{mails.map((m) => (
                      <tr key={m.id}>
                        <td className="muted">{fmtDate(m.received_at, true)}{m.via === "paste" ? " · lipit" : ""}</td>
                        <td>{m.bank ? <b className="mono">{m.bank} {m.bank_ref}</b> : <span className="muted">{m.subject ?? m.mail_from ?? "—"}</span>}</td>
                        <td>{m.client_name ?? "—"}</td>
                        <td>{m.order_id ? <a className="rowLink" href={`${base}/comenzi/${m.order_id}`}>{m.status === "duplicate" ? "Duplicat → comanda existentă" : "Comandă creată"}</a> : <span className="pill pillWarn"><i />Nerecunoscut</span>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
    </CrmShell>
  );
}
