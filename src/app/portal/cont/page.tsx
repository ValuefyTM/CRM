import type { Metadata } from "next";
import { portalPage } from "@/lib/guard";
import { getPartner, kindLabel } from "@/lib/partners";
import { clientTypeLabel, partnerPeople } from "@/lib/users";
import { PortalShell } from "@/components/PortalShell";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Contul meu | Portal VALUEFY" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { db, user, base } = await portalPage();
  const partner = user.kind === "partner" && user.partner_id ? await getPartner(db, user.partner_id) : null;
  const team = partner ? (await partnerPeople(db, partner.id)).filter((u) => u.status !== "disabled") : [];
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
            <div className="section">Persoane cu acces</div>
            <ul className="people">
              {team.map((u) => (
                <li key={u.id}>
                  <span className="who"><b>{u.name || u.email}{u.id === user.id && <span className="muted"> (tu)</span>}</b><span className="muted">{u.email}</span></span>
                  <span className={`pill ${u.status === "active" ? "pillOk" : "pillWarn"}`}><i />{u.status === "active" ? (u.role === "owner" ? "Administrator" : "Activ") : "Invitat"}</span>
                </li>
              ))}
            </ul>
            <p className="hint">Pentru a adăuga sau elimina colegi, scrie-ne la contact@valuefy.ro.</p>
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
