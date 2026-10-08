import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { isAdmin } from "@/lib/users";
import { history } from "@/lib/history";
import { BILLING_MODES, billingRules, DIRECT_FLOWS, getBilling } from "@/lib/billing";
import { oblioCredentials } from "@/lib/oblio";
import { CrmShell } from "@/components/CrmShell";
import { History } from "@/components/History";
import { SettingsTabs } from "../SettingsTabs";
import { BillingPanel } from "./BillingPanel";

export const metadata: Metadata = { title: "Setări facturare | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** Billing settings: the Oblio connection, series, VAT and product, the flow for direct clients, and per framework contract / collaboration when invoices are issued. */
export default async function BillingSettingsPage() {
  const { db, user, base } = await staffPage();
  const [settings, rules, log] = await Promise.all([getBilling(db), billingRules(db), history(db, ["billing"])]);
  const c = oblioCredentials();
  return (
    <CrmShell user={user} base={base} active="settings" title="Setări · Facturare" subtitle="Oblio: conexiune, serii, TVA, reguli de facturare pe tip de client">
      <SettingsTabs base={base} active="facturare" />
      {!isAdmin(user) && <div className="note">Doar proprietarul și administratorii pot modifica setările de facturare.</div>}
      <div className="cols">
        <div style={{ minWidth: 0 }}>
          <BillingPanel edit={isAdmin(user)} initial={settings} creds={{ email: c.email?.name ?? null, secret: c.secret?.name ?? null }}
            rules={rules} modes={BILLING_MODES} flows={DIRECT_FLOWS} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <h2>Cum se facturează</h2>
            <ul className="blHow">
              <li><b>Clienți direcți</b> (contract clasic): din fișa contractului, proformă și / sau factură, câte o linie pe raport.</li>
              <li><b>Contracte cadru (bănci)</b> și <b>colaborări</b>: după regula fiecăruia — nu din CRM, per comandă după aprobarea raportului (ex. BRD) sau lunar pe borderou.</li>
              <li>Fiecare document emis apare în CRM cu PDF-ul lui (Financiar → Facturare, în contract și în raport).</li>
              <li>Trimiterea în e-Factura (SPV) o face Oblio, după setarea din contul Oblio.</li>
            </ul>
          </section>
          <History log={log} />
        </div>
      </div>
    </CrmShell>
  );
}
