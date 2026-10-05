// Server-only: every valuation request sent from the website assistant becomes a CRM order (source "site").
// Runs on CRM page loads: a single cheap query when there is nothing new.
import { now } from "./db";

const TYPE: Record<string, string> = {
  Apartament: "apartment", "Casă": "house", Teren: "land", "Spațiu comercial": "commercial", "Hală / industrial": "industrial",
};
/** Website request status → order status (requests handled before the CRM existed are not shown as new). */
const STATUS: Record<string, string> = { NEW: "received", CONTACTED: "received", OFFER: "received", WON: "in_progress", LOST: "cancelled" };

type Pending = {
  id: string; created_at: string; status: string; updated_at: string | null; valuation_purpose: string | null; deadline: string | null;
  documents_status: string | null; property_type: string | null; description: string | null; city: string | null; address: string | null;
  surface_area: number | null; land_area: number | null; rooms: number | null; prop_notes: string | null; name: string; email: string | null; phone: string | null;
};

export async function syncSiteOrders(db: D1Database) {
  const pending = await db
    .prepare(
      `SELECT l.id, l.created_at, l.status, l.updated_at, l.valuation_purpose, l.deadline, l.documents_status,
         p.property_type, p.description, p.city, p.address, p.surface_area, p.land_area, p.rooms, p.notes AS prop_notes,
         c.name, c.email, c.phone
       FROM leads l JOIN properties p ON p.id = l.property_id JOIN clients c ON c.id = l.client_id
       WHERE l.source = 'WEBSITE_AI' AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.lead_id = l.id)
       ORDER BY l.created_at LIMIT 100`,
    )
    .all<Pending>()
    .then((r) => r.results)
    .catch(() => [] as Pending[]); // website tables missing (CRM developed alone) or migration not applied yet
  try {
  for (const l of pending) {
    const notes = [l.description && `Descriere: ${l.description}`, l.prop_notes && `Observații client: ${l.prop_notes}`,
      l.deadline && !["Standard", "Urgent"].includes(l.deadline) ? `Termen cerut: ${l.deadline}` : null].filter(Boolean).join("\n") || null;
    const status = STATUS[l.status] ?? "received";
    for (let attempt = 0; attempt < 5; attempt++) {
      const seq = ((await db.prepare("SELECT MAX(seq) AS m FROM orders").first<{ m: number | null }>())?.m ?? 1000) + 1;
      try {
        await db
          .prepare(
            `INSERT INTO orders (id, seq, source, lead_id, property_type, city, address, surface_area, land_area, rooms, purpose, urgent,
               client_name, client_phone, client_email, notes, status, docs_missing, viewed_at, created_at, updated_at)
             VALUES (?, ?, 'site', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            `site-${l.id}`, Math.max(seq, 1001), l.id, TYPE[l.property_type ?? ""] ?? "other", l.city, l.address, l.surface_area, l.land_area, l.rooms,
            l.valuation_purpose, l.deadline === "Urgent" ? 1 : 0, l.name, l.phone, l.email, notes, status,
            l.documents_status === "Da" ? 0 : 1, l.status === "NEW" ? null : l.updated_at ?? l.created_at, l.created_at, now(),
          )
          .run();
        break;
      } catch (e) {
        if (String(e).includes("idx_orders_lead") || String(e).includes("lead_id")) break; // converted by a parallel request
        if (!String(e).includes("UNIQUE")) throw e;
      }
    }
  }
  } catch (e) {
    console.error("[site orders]", e); // never break a CRM page because of the sync
  }
  return pending.length;
}
