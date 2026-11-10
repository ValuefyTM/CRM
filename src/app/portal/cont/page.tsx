import type { Metadata } from "next";
import { portalPage } from "@/lib/guard";
import { getPartner, kindLabel } from "@/lib/partners";
import { clientTypeLabel } from "@/lib/users";
import { PortalShell } from "@/components/PortalShell";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Contul meu | Portal VALUEFY" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { db, user, base } = await portalPage();
  const partner = user.kind === "partner" && user.partner_id ? await getPartner(db, user.partner_id) : null;
  return (
    <PortalShell user={user} base={base} active="account" title="Contul meu" subtitle={partner?.name ?? user.company ?? undefined}>
      <div className="cols">
        <ProfileForm name={user.name} phone={user.phone ?? ""} email={user.email} />
        {partner ? (
          <section className="card">
            <h2>{partner.name}</h2>
            <dl className="dl">
              <div><dt>Tip</dt><dd>{kindLabel(partner.kind)}</dd></div>
              {partner.cui && <div><dt>CUI</dt><dd>{partner.cui}</dd></div>}
              {partner.city && <div><dt>Localitate</dt><dd>{partner.city}</dd></div>}
            </dl>
            <p className="hint">Contul tău vede doar comenzile trimise de tine. Pentru modificări ale datelor firmei, scrie-ne la contact@valuefy.ro.</p>
          </section>
        ) : (
          <section className="card">
            <h2>Date client</h2>
            <dl className="dl">
              <div><dt>Tip client</dt><dd>{clientTypeLabel(user.client_type)}</dd></div>
              {user.company && <div><dt>Companie</dt><dd>{user.company}</dd></div>}
              {user.cui && <div><dt>CUI</dt><dd>{user.cui}</dd></div>}
              {user.city && <div><dt>Localitate</dt><dd>{user.city}</dd></div>}
            </dl>
            <p className="hint">Datele de facturare se completează la fiecare comandă. Pentru modificări, scrie-ne la contact@valuefy.ro.</p>
          </section>
        )}
      </div>
    </PortalShell>
  );
}
