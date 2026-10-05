// Server-only: valuation and sale requests sent from the website assistant (table "leads", written by valuefy.ro).
// The website's admin panel works on the same rows, so status and notes stay in sync between the two.

export const LEAD_STATUSES = [
  ["NEW", "Nouă", "pillInfo"],
  ["CONTACTED", "Contactat", "pillWarn"],
  ["OFFER", "Ofertă trimisă", "pillWarn"],
  ["WON", "Acceptată", "pillOk"],
  ["LOST", "Închisă fără contract", "pillErr"],
] as const;
export const leadStatus = (s: string): [string, string] => {
  const x = LEAD_STATUSES.find(([k]) => k === s);
  return x ? [x[1], x[2]] : [s, ""];
};

export type Lead = {
  id: string; created_at: string; status: string; priority: string; kind: "sale" | "valuation";
  property_type: string | null; description: string | null; city: string | null; address: string | null;
  surface_area: number | null; land_area: number | null; rooms: number | null;
  purpose: string | null; deadline: string | null; asking_price: number | null; documents_status: string | null;
  customer_type: string | null; name: string; email: string | null; phone: string | null; notes: string | null;
  summary: string | null; email_sent: boolean; admin_notes: string | null; updated_at: string | null; files: string[];
};

type Row = Omit<Lead, "kind" | "purpose" | "deadline" | "asking_price" | "email_sent" | "files" | "notes" | "summary"> & {
  source: string; valuation_purpose: string | null; deadline: string | null; conversation_summary: string | null; email_sent: number;
  payload: string; prop_notes: string | null; files: string | null;
};

const SELECT = `SELECT l.*, p.property_type, p.description, p.city, p.address, p.surface_area, p.land_area, p.rooms, p.notes AS prop_notes,
  c.name, c.email, c.phone, c.customer_type,
  (SELECT group_concat(filename, '|') FROM lead_files f WHERE f.lead_id = l.id) AS files
  FROM leads l JOIN properties p ON p.id = l.property_id JOIN clients c ON c.id = l.client_id`;

function toLead(r: Row): Lead {
  let payload: { asking_price?: unknown } = {};
  try { payload = JSON.parse(r.payload); } catch { /* keep empty */ }
  const sale = r.source === "WEBSITE_AI_SALE";
  const price = payload.asking_price;
  return {
    id: r.id, created_at: r.created_at, status: r.status, priority: r.priority, kind: sale ? "sale" : "valuation",
    property_type: r.property_type, description: r.description, city: r.city, address: r.address,
    surface_area: r.surface_area, land_area: r.land_area, rooms: r.rooms,
    purpose: sale ? null : r.valuation_purpose, deadline: sale ? null : r.deadline,
    asking_price: typeof price === "number" ? price : price ? Number(price) || null : null,
    documents_status: r.documents_status, customer_type: r.customer_type, name: r.name, email: r.email, phone: r.phone,
    notes: r.prop_notes, summary: r.conversation_summary, email_sent: r.email_sent === 1, admin_notes: r.admin_notes,
    updated_at: r.updated_at ?? null, files: r.files ? r.files.split("|") : [],
  };
}

/** All requests, newest first. Empty when the website tables are not there (local development of the CRM alone). */
export async function listLeads(db: D1Database): Promise<Lead[]> {
  try {
    const { results } = await db.prepare(`${SELECT} ORDER BY l.created_at DESC LIMIT 5000`).all<Row>();
    return results.map(toLead);
  } catch {
    return [];
  }
}

export async function getLead(db: D1Database, id: string) {
  const r = await db.prepare(`${SELECT} WHERE l.id = ?`).bind(id).first<Row>().catch(() => null);
  return r ? toLead(r) : null;
}

/** New sale requests (valuation requests are counted as orders). */
export async function countNewLeads(db: D1Database) {
  return (await db.prepare("SELECT COUNT(*) AS n FROM leads WHERE status = 'NEW' AND source = 'WEBSITE_AI_SALE'").first<{ n: number }>().catch(() => null))?.n ?? 0;
}

export async function updateLead(db: D1Database, id: string, patch: { status?: unknown; admin_notes?: unknown }) {
  const sets: string[] = [];
  const vals: (string | null)[] = [];
  if (patch.status !== undefined) {
    if (!LEAD_STATUSES.some(([k]) => k === patch.status)) return false;
    sets.push("status = ?"); vals.push(patch.status as string);
  }
  if (typeof patch.admin_notes === "string") { sets.push("admin_notes = ?"); vals.push(patch.admin_notes.slice(0, 5000) || null); }
  if (!sets.length) return false;
  await db.prepare(`UPDATE leads SET ${sets.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).bind(...vals, id).run();
  return true;
}
