import { niceName } from "@/lib/labels";
import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { CLIENT_KINDS, CLIENT_PAGE, clientCounts, kindName, listClients } from "@/lib/clients";
import { STATUS_LABEL } from "@/lib/labels";
import { CrmShell } from "@/components/CrmShell";
import { ClientFilters } from "./ClientFilters";
import { ClickRow } from "@/components/ClickRow";

export const metadata: Metadata = { title: "Clienți | CRM VALUEFY" };
export const dynamic = "force-dynamic";

type SP = { q?: string; kind?: string; portal?: string; page?: string };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { db, user, base } = await staffPage();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [data, counts] = await Promise.all([listClients(db, { ...sp, page }), clientCounts(db)]);
  const pages = Math.max(1, Math.ceil(data.total / CLIENT_PAGE));
  const link = (p: number) => `${base}/clienti?${Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&")}`;

  return (
    <CrmShell
      user={user} base={base} active="clients" title="Clienți" subtitle={`${(counts.person ?? 0).toLocaleString("ro-RO")} persoane fizice · ${(counts.company ?? 0).toLocaleString("ro-RO")} firme · bănci și instituții`}
      actions={<><a href={`${base}/clienti/nou`} className="btn btnGold btnSm">+ Persoană fizică</a><a href={`${base}/clienti/nou?tip=pj`} className="btn btnGold btnSm">+ Persoană juridică</a></>}
    >
      <section className="card">
        <ClientFilters base={base} total={data.total} current={{ q: sp.q, kind: sp.kind, portal: sp.portal }} kinds={CLIENT_KINDS.filter(([k]) => counts[k]).map(([k, l]) => [k, l, counts[k]])} />
        {data.rows.length === 0 ? <div className="empty">Niciun client pentru filtrele alese.</div> : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Client</th><th>Tip</th><th>Telefon</th><th>Localitate</th><th style={{ textAlign: "right" }}>Rapoarte</th><th>Ultimul raport</th><th>Portal</th></tr></thead>
              <tbody>
                {data.rows.map((c) => {
                  const [pl, pc] = c.portal ? STATUS_LABEL[c.portal] ?? [c.portal, ""] : ["—", ""];
                  return (
                    <ClickRow key={c.id} href={`${base}/clienti/${c.id}`}>
                      <td><a className="rowLink" href={`${base}/clienti/${c.id}`}>{niceName(c.name)}</a><div className="muted">{[c.cui && `CUI ${c.cui}`, c.email].filter(Boolean).join(" · ")}</div></td>
                      <td>{kindName(c.kind)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{c.phone ?? <span className="muted">—</span>}</td>
                      <td>{c.city ?? <span className="muted">—</span>}</td>
                      <td style={{ textAlign: "right" }}>{c.reports || <span className="muted">—</span>}</td>
                      <td className="muted">{c.last_report ? fmtDate(c.last_report) : "—"}</td>
                      <td>{c.portal ? <span className={`pill ${pc}`}><i />{pl}</span> : <span className="muted">—</span>}</td>
                    </ClickRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <span className="muted">Pagina {page} din {pages}</span>
            <span className="actions">
              {page > 1 && <a className="btn btnGhost btnSm" href={link(page - 1)}>← Înapoi</a>}
              {page < pages && <a className="btn btnGhost btnSm" href={link(page + 1)}>Înainte →</a>}
            </span>
          </div>
        )}
      </section>
    </CrmShell>
  );
}
