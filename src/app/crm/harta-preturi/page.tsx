import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { PRICE_TYPES, pricePoints } from "@/lib/price-map";
import { PriceMap } from "./PriceMap";

export const metadata: Metadata = { title: "Hartă prețuri | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** The prices of the valuations finished in the last 12 months, on the map of Timișoara, by type of property. */
export default async function PriceMapPage() {
  const { db, user, base } = await staffPage("properties");
  const points = await pricePoints(db);
  // the types that have valuations, the most frequent first (the first is shown)
  const types = PRICE_TYPES.map(([k, label]) => ({ k, label, n: points.filter((p) => p.type === k).length })).filter((t) => t.n > 0).sort((a, b) => b.n - a.n);
  return (
    <CrmShell user={user} base={base} active="pricemap" title="Hartă prețuri" subtitle="Timișoara · valorile din rapoartele finalizate în ultimele 12 luni, în € / m²">
      <PriceMap points={points} types={types} base={base} />
    </CrmShell>
  );
}
