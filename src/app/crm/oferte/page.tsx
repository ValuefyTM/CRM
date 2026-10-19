import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { can } from "@/lib/perms";
import { isExpired, listQuotes, quoteCode, quoteCounts, QUOTE_STATUS, QUOTE_TABS, quoteWhat } from "@/lib/quotes";
import { CrmShell } from "@/components/CrmShell";
import { ClickRow } from "@/components/ClickRow";
import { niceName } from "@/lib/labels";

export const metadata: Metadata = { title: "Oferte | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** The offers made to clients: open (to send / waiting for an answer), accepted, converted into work, declined or expired. */
export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; ale?: string }> }) {
  const { db, user, base } = await staffPage("orders");
  const sp = await searchParams;
  const tab = QUOTE_TABS.some(([k]) => k === sp.tab) ? sp.tab! : "deschise";
  // Without "all orders": only one's own offers.
  const mine = !can(user, "orders.all") || sp.ale === "1" ? user.id : null;
  const [rows, counts] = await Promise.all([listQuotes(db, { tab, q: sp.q, mine }), quoteCounts(db, mine)]);
  const link = (change: { tab?: string; q?: string; ale?: string }) => {
    const n = { tab, q: sp.q, ale: sp.ale, ...change };
    const qs = Object.entries(n).filter(([k, v]) => v && !(k === "tab" && v === "deschise")).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
    return `${base}/oferte${qs ? `?${qs}` : ""}`;
  };
  const lei = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("ro-RO", { maximumFractionDigits: 2 })} lei`);
  return (
    <CrmShell user={user} base={base} active="quotes" title="Oferte" subtitle="Ofertele făcute clienților, până devin comenzi sau contracte"
      actions={<>{can(user, "orders.all") && <a className={`btn btnSm ${mine ? "btnGold" : "btnGhost"}`} href={link({ ale: mine ? undefined : "1" })}>{mine ? "Toate ofertele" : "Ofertele mele"}</a>}{can(user, "orders.A") && <a className="btn btnGold btnSm" href={`${base}/oferte/noua`}>+ Ofertă nouă</a>}</>}>
      <section className="card repFilters">
        <form className="filterBar" method="get" action={`${base}/oferte`}>
          {tab !== "deschise" && <input type="hidden" name="tab" value={tab} />}
          {sp.ale && <input type="hidden" name="ale" value={sp.ale} />}
          <span className="segment ibStates ordStates" role="group" aria-label="Stare ofertă">
            {QUOTE_TABS.map(([k, l]) => <a key={k} href={link({ tab: k })} aria-current={tab === k ? "page" : undefined}>{l} <small>{(counts[k] ?? 0).toLocaleString("ro-RO")}</small></a>)}
          </span>
          <input className="search" name="q" defaultValue={sp.q ?? ""} placeholder="Caută client, telefon, adresă, OF-nr… ↵" aria-label="Caută" />
        </form>
      </section>
      <section className="card repCard">
        {rows.length === 0 ? (
          <div className="empty">{sp.q ? "Nicio ofertă pentru căutarea asta." : tab === "deschise" ? "Nicio ofertă deschisă. Notează aici ce oferte faci clienților, ca să nu le uiți." : "Nimic aici."}</div>
        ) : (
          <div className="tableWrap">
            <table className="table qtTable">
              <thead><tr><th>Ofertă</th><th>Client</th><th>Ce se evaluează</th><th>Scop · tip</th><th style={{ textAlign: "right" }}>Onorariu</th><th>Valabilă până</th><th>Stare</th><th>De cine</th></tr></thead>
              <tbody>
                {rows.map((q) => {
                  const exp = isExpired(q);
                  const [label, cls] = exp ? ["Expirată", "pillWarn"] : QUOTE_STATUS[q.status];
                  return (
                    <ClickRow key={q.id} href={`${base}/oferte/${q.id}`}>
                      <td><a className="rowLink" href={`${base}/oferte/${q.id}`}><b className="mono">{quoteCode(q)}</b></a><div className="muted">{fmtDate(q.sent_at ?? q.created_at)}</div></td>
                      <td><b>{niceName(q.client_name)}</b><div className="muted">{[q.client_phone, q.client_email].filter(Boolean).join(" · ")}</div></td>
                      <td>{quoteWhat(q) || <span className="muted">—</span>}</td>
                      <td><div className="two"><b>{q.purpose || "—"}</b><small>{q.report_type ?? ""}</small></div></td>
                      <td style={{ textAlign: "right" }} className="mono num">{lei(q.fee)}</td>
                      <td>{q.valid_until ? <span className={exp ? "errTxt" : undefined}>{fmtDate(q.valid_until)}</span> : "—"}</td>
                      <td><span className={`pill ${cls}`}><i />{label}</span>{q.urgent ? <span className="pill pillErr" style={{ marginLeft: 4 }}><i />Urgent</span> : null}
                        {q.status === "converted" && <div className="muted">{q.report_number ? `raport ${q.report_number}` : q.order_seq ? `CO-${q.order_seq}` : q.contract_number ? `contract ${q.contract_number}` : ""}</div>}</td>
                      <td>{q.author ?? "—"}</td>
                    </ClickRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </CrmShell>
  );
}
