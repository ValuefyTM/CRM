// Dashboard: the new orders from the banks — each bank with a processing rule (BRD, BCR…), its logo, the processing
// tasks still open (urgent) and its work in progress; under them the tasks themselves, a click away from "Comandă nouă".
import { fileSrc } from "@/lib/files";
import { getDb } from "@/lib/db";
import { niceName } from "@/lib/labels";
import { openTasks } from "@/lib/mail-rules";
import { can, type WithPerms } from "@/lib/perms";
import { TaskList } from "./TaskList";

export async function BankTasksCard({ user, base }: { user: WithPerms & { id: string }; base: string }) {
  const db = await getDb();
  if (!db) return null;
  const orders = can(user, "orders");
  const tasks = await openTasks(db, user, orders).catch(() => []);
  if (!orders && !tasks.length) return null;
  const { results: banks } = await db.prepare(`SELECT e.id, e.name, e.code, e.logo_url AS logo,
        (SELECT COUNT(*) FROM reports r JOIN orders o ON o.id = r.order_id WHERE o.bank_id = e.id AND r.status IN ('draft', 'in_progress', 'suspended') AND r.delivered_at IS NULL) AS open
      FROM entities e WHERE e.id IN (SELECT bank_id FROM mail_rules WHERE action = 'bank_order' AND active = 1 AND bank_id IS NOT NULL) ORDER BY e.name`)
    .all<{ id: string; name: string; code: string | null; logo: string | null; open: number }>().catch(() => ({ results: [] as never[] }));
  if (!banks.length && !tasks.length) return null;
  return (
    <section className={`card mtBanks${tasks.length ? " hot" : ""}`} aria-label="Comenzi noi de la bănci">
      <div className="cardHead"><h2>Comenzi noi de la bănci</h2>{tasks.length > 0 ? <span className="pill pillErr"><i />{tasks.length} de procesat</span> : <span className="pill pillOk"><i />toate procesate</span>}</div>
      <div className="mtBankRow">
        {banks.map((b) => {
          const n = tasks.filter((t) => t.bank_id === b.id).length, logo = fileSrc(b.logo);
          return (
            <a key={b.id} className={`mtBank${n ? " hot" : ""}`} href={orders ? `${base}/comenzi?tab=banci` : undefined}>
              <span className="mtLogo">{logo ? <img src={logo} alt="" /> : <b>{(b.code || b.name).slice(0, 3)}</b>}</span>
              <span className="mtTxt"><b>{b.code || (niceName(b.name) || b.name).split(/\s+/)[0]}</b><small>{b.open} în curs</small></span>
              <span className={`mtN${n ? " hot" : ""}`}>{n}<small>{n === 1 ? "nouă" : "noi"}</small></span>
            </a>
          );
        })}
      </div>
      {tasks.length > 0 && <TaskList tasks={tasks} base={base} />}
    </section>
  );
}
