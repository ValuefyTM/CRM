import type { Metadata } from "next";
import { billingLabel } from "@/lib/billing-modes";
import { fmtDate, staffPage } from "@/lib/guard";
import { niceName } from "@/lib/labels";
import { cap, lei, REPORT_STATUS } from "@/lib/reports";
import { CONTRACT_PAGE, CONTRACT_STATES, contractStats, listCollaborations, listContracts, type ContractFilters as F, type ContractRow } from "@/lib/contracts";
import { scopeFilter } from "@/lib/scope";
import { CrmShell } from "@/components/CrmShell";
import { ContractFilters } from "./ContractFilters";
import { ClickRow } from "@/components/ClickRow";
import { BillingModeEdit } from "@/components/BillingModePick";
import { getBilling } from "@/lib/billing";
import { fileSrc } from "@/lib/files";
import { can } from "@/lib/perms";

export const metadata: Metadata = { title: "Contracte | CRM VALUEFY" };
export const dynamic = "force-dynamic";

type SP = Omit<F, "page"> & { page?: string };
type Tab = "clasic" | "cadru" | "colaborare";

const TABS: [Tab, string, string][] = [
  ["clasic", "Clasice", "lucrări directe, portal, site"],
  ["cadru", "Cadru", "cu băncile"],
  ["colaborare", "Colaborare", "firme de evaluare partenere"],
];
const SUBTITLE: Record<Tab, string> = {
  clasic: "Contractele clasice: un client, o lucrare (din portal, de pe site sau lucrări directe)",
  cadru: "Contractele cadru cu băncile: grila de onorarii, cum se facturează, rapoartele lucrate pe ele",
  colaborare: "Acordurile cu firmele de evaluare care ne trimit lucrări: cota VALUEFY și cum se facturează",
};
// The states that make sense on each tab (closed is only for framework contracts).
const CLASSIC_STATES = CONTRACT_STATES.filter(([k]) => k && k !== "inchise");
const FRAMEWORK_STATES: [string, string][] = [["fara-raport", "Fără raport"], ["in-lucru", "Cu rapoarte în lucru"], ["inchise", "Închise"]];

/** The firm's logo, or its initials. */
function Logo({ src, name }: { src: string | null; name: string }) {
  const url = fileSrc(src);
  return url ? <img src={url} alt="" className="ctCollabLogo" /> : <i className="ctCollabLogo">{niceName(name).slice(0, 2).toUpperCase()}</i>;
}

/** Contracts, in three tabs: classic (one client, one piece of work), framework (banks), collaboration (partner valuation firms). */
export default async function ContractsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { db, user, base } = await staffPage("contracts");
  const sp = await searchParams;
  const tab: Tab = sp.tip === "cadru" || sp.tip === "colaborare" ? sp.tip : "clasic";
  const page = Math.max(1, Number(sp.page) || 1);
  const scope = scopeFilter(user, "contracts", "k") ?? undefined;
  const collab = tab === "colaborare";
  const [s, data, collabs, collabTotal, billing] = await Promise.all([
    contractStats(db),
    collab ? null : listContracts(db, { q: sp.q, stare: sp.stare, tip: tab, an: tab === "clasic" ? sp.an : undefined, page, scope }),
    collab ? listCollaborations(db, sp.q) : null,
    db.prepare("SELECT COUNT(*) AS n FROM collaborations").first<{ n: number }>().then((r) => r?.n ?? 0),
    collab ? getBilling(db) : null,
  ]);
  const counts: Record<Tab, number> = { clasic: s.classic, cadru: s.framework, colaborare: collabTotal };
  const year = new Date().getFullYear();
  const link = (change: Partial<SP>) => {
    const next = { ...sp, page: undefined, ...change };
    const qs = Object.entries(next).filter(([k, v]) => v && !(k === "tip" && v === "clasic")).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
    return `${base}/contracte${qs ? `?${qs}` : ""}`;
  };
  const tabLink = (t: Tab) => `${base}/contracte${t === "clasic" ? "" : `?tip=${t}`}`;
  // a card's link: this tab with only its own filter
  const at = (change: Partial<SP>) => link({ q: undefined, an: undefined, stare: undefined, ...change });

  type Card = [string, string, string, string, string?];
  let cards: Card[];
  if (tab === "clasic") {
    cards = [
      [`Contracte ${year}`, s.year.toLocaleString("ro-RO"), "var(--ink)", at({ an: String(year) }), `${s.month} luna aceasta`],
      [`Valoare ${year}`, lei(Math.round(s.value)), "var(--acc-ink)", at({ an: String(year) }), "onorarii fără TVA"],
      ["Fără raport", s.empty.toLocaleString("ro-RO"), "var(--err)", at({ an: String(year), stare: "fara-raport" }), `din ${year}`],
      ["Așteaptă semnătura", s.unsigned.toLocaleString("ro-RO"), "var(--acc)", at({ stare: "de-semnat" }), `următorul nr. ${s.next}`],
    ];
  } else if (tab === "cadru") {
    cards = [
      ["Contracte active", s.framework.toLocaleString("ro-RO"), "var(--info)", at({}), s.frameworkClosed ? `${s.frameworkClosed} închise` : "niciunul închis"],
      ["Rapoarte luna aceasta", s.frameworkMonth.toLocaleString("ro-RO"), "var(--ink)", at({}), "primite pe contracte cadru"],
      ["Rapoarte în lucru", s.frameworkOpen.toLocaleString("ro-RO"), "var(--acc)", at({ stare: "in-lucru" }), "nelivrate încă"],
      ["Fără grilă / facturare", `${s.frameworkNoGrid} / ${s.frameworkNoBilling}`, s.frameworkNoGrid || s.frameworkNoBilling ? "var(--err)" : "var(--ok)", at({}), "de completat pe contract"],
    ];
  } else {
    const list = collabs ?? [];
    const sum = (f: (c: (typeof list)[number]) => number) => list.reduce((n, c) => n + f(c), 0);
    const noBilling = list.filter((c) => !c.billing_mode).length;
    cards = [
      ["Colaborări", list.length.toLocaleString("ro-RO"), "var(--info)", tabLink("colaborare"), `${list.filter((c) => c.orders > 0).length} cu lucrări`],
      ["Comenzi luna aceasta", sum((c) => c.month).toLocaleString("ro-RO"), "var(--ink)", tabLink("colaborare"), `${sum((c) => c.orders).toLocaleString("ro-RO")} în total`],
      ["Rapoarte în lucru", sum((c) => c.open).toLocaleString("ro-RO"), "var(--acc)", tabLink("colaborare"), "nelivrate încă"],
      ["Fără facturare proprie", noBilling.toLocaleString("ro-RO"), noBilling ? "var(--acc)" : "var(--ok)", tabLink("colaborare"),
        billing?.collabDefault ? `se aplică implicit: ${billingLabel(billing.collabDefault)?.toLowerCase()}` : "fără regulă implicită"],
    ];
  }

  // the yearly value is a total: only for "all the amounts"
  if (!can(user, "fees.all")) cards = cards.filter(([l]) => !l.startsWith("Valoare"));
  const actions = collab ? null : tab === "cadru"
    ? <a href={`${base}/contracte/nou?tip=cadru`} className="btn btnGold btnSm">+ Contract cadru</a>
    : <a href={`${base}/contracte/nou`} className="btn btnGold btnSm">+ Contract nou</a>;

  return (
    <CrmShell user={user} base={base} active="contracts" title="Contracte" subtitle={SUBTITLE[tab]} actions={actions}>
      <nav className="segment ctTabs" aria-label="Tipul contractelor">
        {TABS.map(([k, l, hint]) => (
          <a key={k} href={tabLink(k)} aria-current={tab === k ? "page" : undefined}>
            <span className="ctTabLabel"><b>{l}</b><em>{hint}</em></span><small>{counts[k].toLocaleString("ro-RO")}</small>
          </a>
        ))}
      </nav>

      <div className="dbKpis ibKpis">
        {cards.map(([l, n, c, h, foot]) => (
          <a key={l} className="dbKpi" href={h}>
            <span className="dbKpiLabel"><i style={{ background: c }} />{l}</span>
            <b className={l.startsWith("Valoare") ? "ctKpiMoney" : undefined}>{n}</b>
            {foot && <small className="ctKpiFoot">{foot}</small>}
          </a>
        ))}
      </div>

      {collab ? (
        <section className="card">
          <ContractFilters base={base} total={collabs!.length} current={{ q: sp.q, tip: tab }} placeholder="Caută firma, CUI sau nr. acordului… ↵" noun={["colaborare", "colaborări"]} />
          {collabs!.length === 0 ? <div className="empty">{sp.q ? "Nicio colaborare pentru căutarea asta." : "Nicio colaborare încă."}</div> : (
            <ul className="ctCollabs ctCollabRows">
              {collabs!.map((k) => (
                <li key={k.id}>
                  <span className="ctCollabWho">
                    <Logo src={k.logo} name={k.firm} />
                    <span><a className="rowLink" href={`${base}/clienti/${k.firm_id}`}><b>{niceName(k.firm)}</b></a>
                      <small>{[k.number ? `acord nr. ${k.number}` : "acord fără număr", k.signed_on && fmtDate(k.signed_on), k.share != null && `cota VALUEFY ${Math.round(k.share * 100)}%`].filter(Boolean).join(" · ")}</small></span>
                  </span>
                  <dl className="ctCollabStats">
                    <div><dt>Comenzi</dt><dd><b>{k.orders.toLocaleString("ro-RO")}</b>{k.month > 0 && <small>{k.month} luna aceasta</small>}</dd></div>
                    <div><dt>Rapoarte</dt><dd>{k.open > 0 ? <span className="pill pillWarn"><i />{k.open} în lucru</span> : <small>niciunul în lucru</small>}{k.delivered > 0 && <small>{k.delivered.toLocaleString("ro-RO")} predate</small>}</dd></div>
                    <div><dt>Ultima comandă</dt><dd>{k.last_order ? fmtDate(k.last_order) : <small>—</small>}</dd></div>
                  </dl>
                  <BillingModeEdit target="collab" id={k.id} value={k.billing_mode} fallback={billing?.collabDefault ?? null} edit={can(user, "contracts.E")} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="card">
          <ContractFilters base={base} total={data!.total} current={{ q: sp.q, tip: tab, an: tab === "clasic" ? sp.an : undefined, stare: sp.stare }}
            years={tab === "clasic" ? s.years.map((y) => [y.k, y.k, y.n]) : undefined} states={tab === "clasic" ? CLASSIC_STATES : FRAMEWORK_STATES}
            placeholder={tab === "cadru" ? "Caută banca, nr. contract, nr. raport… ↵" : undefined} />
          {data!.rows.length === 0 ? <div className="empty">{tab === "cadru" ? "Niciun contract cadru pentru filtrele alese." : "Niciun contract pentru filtrele alese."}</div> : (
            <div className="tableWrap">
              {tab === "cadru" ? <FrameworkTable rows={data!.rows} base={base} /> : <ClassicTable rows={data!.rows} base={base} />}
            </div>
          )}
          <Pager page={page} pages={Math.max(1, Math.ceil(data!.total / CONTRACT_PAGE))} link={link} />
        </section>
      )}
    </CrmShell>
  );
}

function Pager({ page, pages, link }: { page: number; pages: number; link: (c: Partial<SP>) => string }) {
  if (pages <= 1) return null;
  return (
    <div className="actions" style={{ justifyContent: "space-between" }}>
      <span className="muted">Pagina {page} din {pages}</span>
      <span className="actions">
        {page > 1 && <a className="btn btnGhost btnSm" href={link({ page: String(page - 1) })}>← Înapoi</a>}
        {page < pages && <a className="btn btnGhost btnSm" href={link({ page: String(page + 1) })}>Înainte →</a>}
      </span>
    </div>
  );
}

function LastReport({ k, base }: { k: ContractRow; base: string }) {
  if (!k.report_id) return <span className="muted">—</span>;
  const [rl, rc] = k.report_status ? REPORT_STATUS[k.report_status] ?? [k.report_status, ""] : ["", ""];
  return <><a className="rowLink" href={`${base}/rapoarte/${k.report_id}`}>{k.report_number ? `Raport ${k.report_number}` : cap(k.report_label ?? "") || "Raport"}</a>
    <div><span className={`pill ${rc}`}><i />{rl}</span></div></>;
}

/** Classic contracts: one client, one piece of work. */
function ClassicTable({ rows, base }: { rows: ContractRow[]; base: string }) {
  return (
    <table className="table">
      <thead><tr><th>Contract</th><th>Client</th><th>Obiect</th><th style={{ textAlign: "right" }}>Onorariu</th><th>Rapoarte</th><th>Ultimul raport</th></tr></thead>
      <tbody>
        {rows.map((k) => {
          const href = `${base}/contracte/${k.id}`;
          return (
            <ClickRow key={k.id} href={href}>
              <td>
                <a className="ref rowLink" href={href}>{k.number ? `Nr. ${k.number}` : "fără număr"}</a>
                <div className="muted">{fmtDate(k.signed_on)}</div>
                {k.signed_at ? <span className="ctSig ok">✓ semnat online</span> : k.sign_sent_at ? <span className="ctSig">trimis la semnat</span> : null}
              </td>
              <td>{k.client_id ? <a className="rowLink" href={`${base}/clienti/${k.client_id}`}>{niceName(k.client) || "—"}</a> : "—"}<div className="muted">{k.client_kind === "company" ? "Persoană juridică" : k.client_kind === "person" ? "Persoană fizică" : k.client_kind === "bank" ? "Bancă" : ""}</div></td>
              <td>{k.purpose ?? "—"}<div className="muted">{[k.report_type, k.valuation_types].filter(Boolean).join(" · ")}</div></td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{k.fee ? lei(k.fee) : <span className="muted">—</span>}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                {k.reports === 0 ? <span className="pill pillWarn"><i />Fără raport</span> : (
                  <span className="ctCounts"><b>{k.reports.toLocaleString("ro-RO")}</b>{k.open > 0 && <span className="pill pillWarn"><i />{k.open} în lucru</span>}</span>
                )}
              </td>
              <td><LastReport k={k} base={base} /></td>
            </ClickRow>
          );
        })}
      </tbody>
    </table>
  );
}

/** Framework contracts: the bank, how it is invoiced, its fee grid and the reports worked under it. */
function FrameworkTable({ rows, base }: { rows: ContractRow[]; base: string }) {
  return (
    <table className="table">
      <thead><tr><th>Bancă</th><th>Contract</th><th>Facturare</th><th>Grilă onorarii</th><th>Rapoarte</th><th>Ultimul raport</th></tr></thead>
      <tbody>
        {rows.map((k) => {
          const href = `${base}/contracte/${k.id}`;
          return (
            <ClickRow key={k.id} href={href}>
              <td><span className="ctCollabWho"><Logo src={k.client_logo} name={k.client ?? "?"} /><a className="rowLink" href={href}><b>{niceName(k.client) || "—"}</b></a></span></td>
              <td>
                <span className="ref">{k.number ? `Nr. ${k.number}` : "fără număr"}</span>
                <div className="muted">{fmtDate(k.signed_on)}{k.closed_on && <> · <span style={{ color: "var(--err)", fontWeight: 700 }}>închis {fmtDate(k.closed_on)}</span></>}</div>
              </td>
              <td>{k.billing_mode ? billingLabel(k.billing_mode) : <span className="errTxt">nesetată</span>}</td>
              <td>{k.has_grid ? <span className="pill pillOk"><i />Setată</span> : <span className="pill pillWarn"><i />Lipsă</span>}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                {k.reports === 0 ? <span className="muted">niciun raport</span> : (
                  <span className="ctCounts"><b>{k.reports.toLocaleString("ro-RO")}</b>{k.open > 0 && <span className="pill pillWarn"><i />{k.open} în lucru</span>}
                    <span className="muted">{k.month} luna aceasta</span></span>
                )}
              </td>
              <td><LastReport k={k} base={base} /></td>
            </ClickRow>
          );
        })}
      </tbody>
    </table>
  );
}
