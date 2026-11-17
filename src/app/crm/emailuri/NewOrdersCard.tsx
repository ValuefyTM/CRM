// Dashboard: the new orders, by where they come from — each bank with a processing rule (BRD, BCR…: the tasks from its
// emails), the website (valuefy.ro) and the collaborators' portal (the orders nobody opened yet) — each with its logo,
// what is new (urgent) and its work in progress; under them the bank tasks and the new orders, a click away.
import { fileSrc } from "@/lib/files";
import { getDb } from "@/lib/db";
import { niceName } from "@/lib/labels";
import { openTasks } from "@/lib/mail-rules";
import { orderCode, propertyLabel } from "@/lib/order-labels";
import { can, type WithPerms } from "@/lib/perms";
import { TaskList } from "./TaskList";

type NewOrder = { id: string; seq: number | null; source: string; client: string | null; what: string | null; place: string | null; partner: string | null; who: string | null; at: string; urgent: number | null };

const age = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `de ${m} min` : m < 1440 ? `de ${Math.floor(m / 60)} h` : `de ${Math.floor(m / 1440)} ${Math.floor(m / 1440) === 1 ? "zi" : "zile"}`;
};

/** The logo of the collaborators' portal: two people, linked. */
const CollabLogo = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <rect width="40" height="40" rx="9" fill="#141414" />
    <circle cx="14.5" cy="15" r="4.2" fill="#F2A93B" /><path d="M6.5 30c0-4.6 3.6-8 8-8s8 3.4 8 8" fill="#F2A93B" />
    <circle cx="26.5" cy="15.5" r="3.6" fill="#fff" /><path d="M20.5 30c.2-3.9 2.7-7 6.2-7 3.6 0 6.3 3 6.8 7" fill="#fff" />
  </svg>
);

export async function NewOrdersCard({ user, base }: { user: WithPerms & { id: string }; base: string }) {
  const db = await getDb();
  if (!db) return null;
  const orders = can(user, "orders");
  // the website and the portal: for who works on every order (the accredited on framework contracts see the banks only)
  const every = orders && !(can(user, "orders.contract") && !can(user, "orders.all"));
  const tasks = await openTasks(db, user, orders).catch(() => []);
  if (!orders && !tasks.length) return null;
  const [banks, fresh, open] = await Promise.all([
    db.prepare(`SELECT e.id, e.name, e.code, e.logo_url AS logo,
        (SELECT COUNT(*) FROM reports r JOIN orders o ON o.id = r.order_id WHERE o.bank_id = e.id AND r.status IN ('draft', 'in_progress', 'suspended') AND r.delivered_at IS NULL) AS open
      FROM entities e WHERE e.id IN (SELECT bank_id FROM mail_rules WHERE action = 'bank_order' AND active = 1 AND bank_id IS NOT NULL) ORDER BY e.name`)
      .all<{ id: string; name: string; code: string | null; logo: string | null; open: number }>().then((x) => x.results).catch(() => []),
    every ? db.prepare(`SELECT o.id, o.seq, o.source, o.client_name AS client, o.property_type AS what, COALESCE(NULLIF(o.city, ''), o.address) AS place, o.urgent, o.created_at AS at,
          (SELECT p.name FROM partners p WHERE p.id = o.partner_id) AS partner, (SELECT COALESCE(NULLIF(u.name, ''), u.email) FROM users u WHERE u.id = o.created_by) AS who
        FROM orders o WHERE o.source IN ('site', 'partner') AND o.glide_id IS NULL AND o.viewed_at IS NULL AND o.status <> 'cancelled' ORDER BY o.created_at DESC LIMIT 40`)
      .all<NewOrder>().then((x) => x.results).catch(() => []) : Promise.resolve([] as NewOrder[]),
    every ? db.prepare(`SELECT o.source, COUNT(*) AS n FROM orders o WHERE o.source IN ('site', 'partner') AND o.glide_id IS NULL AND o.status IN ('received', 'in_progress') AND o.viewed_at IS NOT NULL GROUP BY o.source`)
      .all<{ source: string; n: number }>().then((x) => Object.fromEntries(x.results.map((r) => [r.source, r.n])) as Record<string, number>).catch(() => ({} as Record<string, number>)) : Promise.resolve({} as Record<string, number>),
  ]);
  if (!banks.length && !tasks.length && !every) return null;
  const site = fresh.filter((o) => o.source === "site"), collab = fresh.filter((o) => o.source === "partner");
  const total = tasks.length + fresh.length;
  const tile = (key: string, logo: React.ReactNode, name: string, sub: string, n: number, href?: string) => (
    <a key={key} className={`tkBank${n ? " hot" : ""}`} href={href}>
      <span className="tkLogo">{logo}</span>
      <span className="tkTxt"><b>{name}</b><small>{sub}</small></span>
      <span className={`tkN${n ? " hot" : ""}`}>{n}<small>{n === 1 ? "nouă" : "noi"}</small></span>
    </a>
  );
  return (
    <section className={`card tkBanks${total ? " hot" : ""}`} aria-label="Comenzi noi">
      <div className="cardHead"><h2>Comenzi noi</h2>{total > 0 ? <span className="pill pillErr"><i />{total} de procesat</span> : <span className="pill pillOk"><i />toate procesate</span>}</div>
      <div className="tkBankRow">
        {banks.map((b) => {
          const logo = fileSrc(b.logo);
          return tile(b.id, logo ? <img src={logo} alt="" /> : <b>{(b.code || b.name).slice(0, 3)}</b>, b.code || (niceName(b.name) || b.name).split(/\s+/)[0], `pe email · ${b.open} în curs`,
            tasks.filter((t) => t.bank_id === b.id).length, orders ? `${base}/comenzi?tab=banci` : undefined);
        })}
        {every && tile("site", <img src="/valuefy-mark.png" alt="" />, "valuefy.ro", `de pe site · ${open.site ?? 0} în curs`, site.length, `${base}/comenzi?tab=site`)}
        {every && tile("collab", <CollabLogo />, "Colaboratori", `din portal · ${open.partner ?? 0} în curs`, collab.length, `${base}/comenzi?tab=parteneri`)}
      </div>
      {tasks.length > 0 && <TaskList tasks={tasks} base={base} />}
      {fresh.length > 0 && (
        <ul className="tkList">
          {fresh.slice(0, 8).map((o) => (
            <li key={o.id} className={Date.now() - Date.parse(o.at) > 2 * 3600e3 ? "late" : ""}>
              <a href={`${base}/comenzi/${o.id}`}>
                <span className="tkLogo">{o.source === "site" ? <img src="/valuefy-mark.png" alt="" /> : <CollabLogo />}</span>
                <span className="tkTxt"><b>{orderCode({ id: o.id, seq: o.seq, source: o.source })}{o.client ? ` · ${o.client}` : ""}{o.urgent ? " · urgent" : ""}</b>
                  <small>{[o.source === "site" ? "de pe valuefy.ro" : `de la ${o.partner ?? o.who ?? "colaborator"}`, o.what ? propertyLabel(o.what) : null, o.place, `primită ${age(o.at)}`].filter(Boolean).join(" · ")}</small></span>
                <span className="tkGo">Deschide →</span>
              </a>
            </li>
          ))}
          {fresh.length > 8 && <li><a href={`${base}/comenzi`}><span className="tkTxt"><small>încă {fresh.length - 8} comenzi noi</small></span><span className="tkGo">Toate →</span></a></li>}
        </ul>
      )}
    </section>
  );
}
