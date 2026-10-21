import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { contractChoices } from "@/lib/contract-orders";
import { evaluatorChoices } from "@/lib/dossier";
import { inspectorChoices } from "@/lib/insp-assign";
import { fileSrc } from "@/lib/files";
import { roleLabel } from "@/lib/labels";
import { CrmShell } from "@/components/CrmShell";
import { can } from "@/lib/perms";
import { getBilling } from "@/lib/billing";
import { ContractOrderForm } from "./ContractOrderForm";
import { niceName } from "@/lib/labels";

export const metadata: Metadata = { title: "Lucrare nouă | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** Work under a framework contract (bank) or a collaboration: order (statement line) and report file in one step. */
export default async function NewContractOrder({ searchParams }: { searchParams: Promise<{ tip?: string; contract?: string }> }) {
  const { db, user, base } = await staffPage("orders.A");
  // Accredited only (agreeri, without the Comenzi module on every order): the bank contracts they are accredited on.
  const limited = can(user, "orders.contract") && !can(user, "orders.all");
  const [{ contracts, collabs }, evaluators, inspectors, next, billing] = await Promise.all([contractChoices(db, limited ? user.id : undefined), evaluatorChoices(db), inspectorChoices(db, user.id),
    db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM orders").first<{ n: number }>(), getBilling(db)]);
  // who the report is made for (the designated user): banks first, then IFN, institutions…
  const parties = (await db.prepare(`SELECT id, name, kind, code, logo_url AS logo FROM entities WHERE kind IN ('bank', 'ifn', 'uat', 'anaf', 'broker', 'other')
      ORDER BY kind <> 'bank', kind, name`).all<{ id: string; name: string; kind: string; code: string | null; logo: string | null }>()).results
    .map((e) => ({ id: e.id, name: niceName(e.name) || e.name, kind: e.kind, code: e.code, logo: e.logo }));
  const sp = await searchParams;
  const kind = sp.tip === "colaborare" && !limited ? "collab" : "bank";
  return (
    <CrmShell user={user} base={base} active="orders" title={limited ? "Comandă nouă" : "Lucrare nouă"}
      subtitle={limited ? "Comandă pe contractele cadru pe care ești agreat · se procesează direct, fără ofertă" : "Comandă din contract cadru (bancă) sau din colaborare · se procesează direct, fără ofertă"}
      actions={can(user, "orders") ? <a href={`${base}/comenzi?tab=banci`} className="btn btnGhost btnSm">← Comenzi</a> : <a href={base || "/"} className="btn btnGhost btnSm">← Tablou de bord</a>}>
      {limited && contracts.length === 0 && <div className="note">Nu ești agreat pe niciun contract cadru deschis. Agreerile le dă un administrator, din fișa ta de utilizator.</div>}
      <ContractOrderForm base={base} me={user.id} initialKind={kind} bankOnly={limited} nextOrder={next?.n ?? 1} initialContract={sp.contract ?? null} vatPercent={billing.vatPercent} canAddReferral={can(user, "users.A")} parties={parties}
        contracts={contracts.map((c) => ({ ...c, logo: fileSrc(c.logo) }))} collabs={limited ? [] : collabs.map((c) => ({ ...c, logo: fileSrc(c.logo) }))}
        evaluators={evaluators.map((e) => ({ id: e.id, name: e.name, sub: e.sub, presence: e.presence, seen: e.seen, photo: e.photo, duties: e.duties }))}
        inspectors={inspectors.map((x) => ({ id: x.id, name: x.name, sub: [roleLabel("internal", x.role), x.coverage && `zone: ${x.coverage}`].filter(Boolean).join(" · "), presence: x.presence, seen: x.seen, photo: x.photo }))} />
    </CrmShell>
  );
}
