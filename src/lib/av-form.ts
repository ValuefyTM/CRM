// Server-only: the Appraisal & Valuation order form, filled in from the report (client, designated user, purpose,
// assets) and the order's own settings, then written into their template (same sheets, lists and comments).
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { now, parseJson } from "./db";
import { audit } from "./auth";
import { niceName } from "./labels";
import { AV_TEMPLATE } from "./av-template";
import {
  avBank, avFirmFor, avMissing, avMobile, avPurpose, avSubtype, avType, countyCode, isAvFirm, type AvAddress, type AvAsset, type AvForm,
} from "./av-labels";

/** The order's own settings of the form (kept on orders.av_form). */
type Saved = {
  firm?: string; client_id?: string; officer_email?: string; due_days?: string; same?: boolean; purpose?: string; recipient?: string;
  assets?: Record<string, { state?: string; type?: string; subtype?: string; details?: string; fee?: string; days_min?: string; days_max?: string }>;
};

type Row = {
  id: string; order_id: string | null; fee: number | null; purpose: string | null; bank_branch: string | null; firm: string | null; av_form: string | null;
  client_id: string | null; kind: string | null; name: string | null; cui: string | null; cnp: string | null; reg_no: string | null; legal_rep: string | null;
  email: string | null; phone: string | null; county: string | null; city: string | null; addr_street: string | null; addr_number: string | null; addr_block: string | null;
  addr_stair: string | null; addr_floor: string | null; addr_apartment: string | null; recipient_id: string | null; recipient: string | null; order_email: string | null; order_phone: string | null;
};
type Prop = {
  asset_id: string; property_id: string; is_main: number; category: string | null; type: string | null; construction: string | null; county: string | null; city: string | null;
  street_type: string | null; street: string | null; number: string | null; block: string | null; stair: string | null; floor: string | null; apartment: string | null;
  postal_code: string | null; district: string | null; parking_spots: number | null; cf_number: string | null; cad_building: string | null; cad_land: string | null;
  usable_area: number | null; description: string | null; vehicle_make: string | null; vehicle_model: string | null; year_built: number | null; full_address: string | null;
};

const s = (v: unknown) => (v == null ? "" : String(v).trim());

/** Whether the report is worked for Appraisal & Valuation (its order is on that collaboration). */
export async function avReport(db: D1Database, reportId: string) {
  const r = await db.prepare(`SELECT e.name FROM reports r JOIN orders o ON o.id = r.order_id JOIN collaborations c ON c.id = o.collaboration_id JOIN entities e ON e.id = c.firm_id WHERE r.id = ?`)
    .bind(reportId).first<{ name: string }>();
  return !!r && isAvFirm(r.name);
}

/** The form as it would be filled now, with what is still missing. */
export async function avData(db: D1Database, reportId: string) {
  const r = await db.prepare(`SELECT r.id, r.order_id, r.fee, r.purpose, r.bank_branch, fe.name AS firm, o.av_form, o.client_email AS order_email, o.client_phone AS order_phone,
      r.client_id, c.kind, c.name, c.cui, c.cnp, c.reg_no, c.legal_rep, c.email, c.phone, c.county, c.city, c.addr_street, c.addr_number, c.addr_block, c.addr_stair,
      c.addr_floor, c.addr_apartment, r.recipient_id, b.name AS recipient
    FROM reports r LEFT JOIN orders o ON o.id = r.order_id LEFT JOIN collaborations cb ON cb.id = o.collaboration_id LEFT JOIN entities fe ON fe.id = cb.firm_id
      LEFT JOIN entities c ON c.id = r.client_id LEFT JOIN entities b ON b.id = r.recipient_id WHERE r.id = ?`).bind(reportId).first<Row>();
  if (!r) return null;
  const sv = parseJson<Saved>(r.av_form, {});
  const { results: props } = await db.prepare(`SELECT a.id AS asset_id, p.id AS property_id, a.is_main, p.category, p.type, p.construction, p.county, p.city, p.street_type, p.street, p.number,
      p.block, p.stair, p.floor, p.apartment, p.postal_code, p.district, p.parking_spots, p.cf_number, p.cad_building, p.cad_land, p.usable_area, p.description,
      p.vehicle_make, p.vehicle_model, p.year_built, p.full_address
    FROM assets a JOIN crm_properties p ON p.id = a.property_id WHERE a.report_id = ? ORDER BY a.is_main DESC, a.created_at`).bind(reportId).all<Prop>();
  const hasRecipient = !!r.recipient_id && r.recipient_id !== r.client_id;
  const recipient = s(sv.recipient) || (hasRecipient ? avBank(niceName(r.recipient ?? "") || r.recipient) : "");
  const addrOf = (p: Prop): AvAddress => ({
    county: countyCode(p.county), city: s(p.city), street: [s(p.street_type) && !/^str/i.test(s(p.street_type)) ? s(p.street_type) : "", s(p.street)].filter(Boolean).join(" "),
    number: s(p.number), block: s(p.block), stair: s(p.stair), floor: s(p.floor), apartment: s(p.apartment),
  });
  const assets: AvAsset[] = props.map((p, i) => {
    const o = sv.assets?.[p.asset_id] ?? {};
    const mobile = p.category === "BUN MOBIL";
    const cad = s(p.cad_building) || s(p.cad_land);
    return {
      id: p.asset_id, property_id: p.property_id, mobile, label: `${s(p.type) ? s(p.type).charAt(0) + s(p.type).slice(1).toLowerCase() : "Bun"}${s(p.full_address) ? ` · ${s(p.full_address)}` : ""}`,
      state: s(o.state) || (p.construction === "under_construction" ? "In constructie " : "Existenta"),
      type: s(o.type) || (mobile ? avMobile(p.type) : avType(p.category)),
      subtype: s(o.subtype) || (mobile ? "" : avSubtype(p.type)),
      details: s(o.details) || (mobile ? [s(p.vehicle_make), s(p.vehicle_model)].filter(Boolean).join(" ") : cad ? `Imobil cu nr. Cad ${cad}` : s(p.description)),
      cf: s(p.cf_number), parking: p.parking_spots != null ? String(p.parking_spots) : "", area: p.usable_area != null ? String(p.usable_area) : "",
      // the fee goes on the main asset (the report's fee, without VAT)
      fee: s(o.fee) || (i === 0 && r.fee != null ? String(r.fee) : ""),
      addr: addrOf(p), postal: s(p.postal_code), district: s(p.district),
      days_min: s(o.days_min) || (mobile ? "1" : "5"), days_max: s(o.days_max) || (mobile ? "3" : "10"),
      make: s(p.vehicle_make), model: s(p.vehicle_model), year: p.year_built != null ? String(p.year_built) : "",
    };
  });
  const main = assets.find((a) => !a.mobile);
  const own: AvAddress = { county: countyCode(r.county), city: s(r.city), street: s(r.addr_street), number: s(r.addr_number), block: s(r.addr_block), stair: s(r.addr_stair), floor: s(r.addr_floor), apartment: s(r.addr_apartment) };
  const form: AvForm = {
    firm: s(sv.firm) || avFirmFor(recipient), client_id: s(sv.client_id), name: niceName(r.name ?? "") || s(r.name), pj: r.kind === "company",
    legal_rep: s(r.legal_rep), cnp: s(r.cnp), cui: s(r.cui), reg_no: s(r.reg_no), addr: own,
    email: s(r.email) || s(r.order_email), recipient, branch: s(r.bank_branch), officer_email: s(sv.officer_email), phone: s(r.phone) || s(r.order_phone),
    purpose: s(sv.purpose) || avPurpose(r.purpose), same: sv.same ?? (!!main && sameAddr(own, main.addr)), fee_vat: false, due_days: s(sv.due_days) || "5",
  };
  return { form, assets, hasRecipient, missing: avMissing(form, assets, hasRecipient), firmName: r.firm, orderId: r.order_id, clientId: r.client_id };
}

const sameAddr = (a: AvAddress, b: AvAddress) => !!a.street && a.county === b.county && a.city.toLowerCase() === b.city.toLowerCase() && a.street.toLowerCase() === b.street.toLowerCase() && a.number === b.number;

/** Saves what was typed: the client's data on the client, each asset's on its property, the rest on the order. */
export async function avSave(db: D1Database, actor: string, reportId: string, body: Record<string, unknown>) {
  const cur = await avData(db, reportId);
  if (!cur) return { ok: false as const, error: "Raportul nu există." };
  const f = (body.form ?? {}) as Partial<AvForm>;
  const list = Array.isArray(body.assets) ? (body.assets as Partial<AvAsset>[]) : [];
  const t = now();
  const v = (x: unknown, n = 160) => (typeof x === "string" ? x.trim().slice(0, n) || null : null);
  const addr = (f.addr ?? {}) as Partial<AvAddress>;
  const stmts: D1PreparedStatement[] = [];
  if (cur.clientId) {
    stmts.push(db.prepare(`UPDATE entities SET cnp = ?, cui = COALESCE(?, cui), reg_no = ?, legal_rep = ?, email = COALESCE(?, email), phone = COALESCE(?, phone), county = ?, city = ?,
        addr_street = ?, addr_number = ?, addr_block = ?, addr_stair = ?, addr_floor = ?, addr_apartment = ?, updated_at = ? WHERE id = ?`)
      .bind(v(f.cnp, 13), v(f.cui, 20), v(f.reg_no, 40), v(f.legal_rep, 120), v(f.email)?.toLowerCase() ?? null, v(f.phone, 40), v(addr.county, 40), v(addr.city, 80),
        v(addr.street, 120), v(addr.number, 20), v(addr.block, 20), v(addr.stair, 20), v(addr.floor, 20), v(addr.apartment, 20), t, cur.clientId));
  }
  stmts.push(db.prepare("UPDATE reports SET bank_branch = ?, updated_at = ? WHERE id = ?").bind(v(f.branch, 120), t, reportId));
  const saved: Saved = { firm: v(f.firm, 10) ?? undefined, client_id: v(f.client_id, 40) ?? undefined, officer_email: v(f.officer_email)?.toLowerCase(), due_days: v(f.due_days, 4) ?? "5",
    same: f.same === true, purpose: v(f.purpose, 120) ?? undefined, recipient: v(f.recipient, 300) ?? undefined, assets: {} };
  for (const a of list) {
    const known = cur.assets.find((x) => x.id === a.id);
    if (!known) continue;
    saved.assets![known.id] = { state: v(a.state, 40) ?? undefined, type: v(a.type, 60) ?? undefined, subtype: v(a.subtype, 80) ?? undefined, details: v(a.details, 500) ?? undefined,
      fee: v(a.fee, 20) ?? undefined, days_min: v(a.days_min, 4) ?? undefined, days_max: v(a.days_max, 4) ?? undefined };
    const ad = (a.addr ?? {}) as Partial<AvAddress>;
    const num = (x: unknown) => { const n = Number(String(x ?? "").replace(",", ".")); return String(x ?? "").trim() && Number.isFinite(n) ? n : null; };
    stmts.push(db.prepare(`UPDATE crm_properties SET county = COALESCE(?, county), city = COALESCE(?, city), street = ?, number = ?, block = ?, stair = ?, floor = ?, apartment = ?,
        postal_code = ?, district = ?, parking_spots = ?, cf_number = ?, usable_area = COALESCE(?, usable_area), updated_at = ? WHERE id = ?`)
      .bind(v(ad.county, 40), v(ad.city, 80), v(ad.street, 120), v(ad.number, 20), v(ad.block, 20), v(ad.stair, 20), v(ad.floor, 20), v(ad.apartment, 20),
        v(a.postal, 10), v(a.district, 80), num(a.parking), v(a.cf, 60), num(a.area), t, known.property_id));
  }
  if (cur.orderId) stmts.push(db.prepare("UPDATE orders SET av_form = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(saved), t, cur.orderId));
  await db.batch(stmts);
  await audit(db, `user:${actor}`, "report.av_form", "report", reportId);
  return { ok: true as const };
}

// ---------- the workbook ----------

const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colNum = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
// numbers as in their sample (CNP, CF, street number, fee, postal code, days); text keeps leading zeros (phone)
const isNum = (x: string) => /^(0|[1-9]\d{0,14})(\.\d+)?$/.test(x);

/** Sets a cell's value in a sheet's XML, keeping its style; adds the cell (and the row) when the template has none. */
function setCell(xml: string, ref: string, value: string, asText = false) {
  const v = value.trim();
  const body = (st: string) => (v === "" ? `<c r="${ref}"${st}/>` : !asText && isNum(v) ? `<c r="${ref}"${st}><v>${v}</v></c>` : `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  const m = xml.match(re);
  if (m) { const st = m[1].match(/\ss="\d+"/)?.[0] ?? ""; return xml.replace(re, body(st)); }
  const [, colL, rowN] = ref.match(/^([A-Z]+)(\d+)$/)!;
  const rowRe = new RegExp(`<row r="${rowN}"([^>]*?)(/>|>([\\s\\S]*?)</row>)`);
  const rm = xml.match(rowRe);
  if (!rm) {
    // a new row, in order
    const rows = [...xml.matchAll(/<row r="(\d+)"/g)];
    const after = rows.filter((x) => Number(x[1]) > Number(rowN))[0];
    const row = `<row r="${rowN}">${body("")}</row>`;
    return after ? xml.slice(0, after.index) + row + xml.slice(after.index) : xml.replace("</sheetData>", `${row}</sheetData>`);
  }
  const inner = rm[3] ?? "";
  const cells = [...inner.matchAll(/<c r="([A-Z]+)\d+"/g)];
  const next = cells.find((c) => colNum(c[1]) > colNum(colL));
  const cell = body("");
  const newInner = next ? inner.slice(0, next.index) + cell + inner.slice(next.index) : inner + cell;
  return xml.replace(rowRe, `<row r="${rowN}"${rm[1]}>${newInner}</row>`);
}

/** The filled-in workbook (their template, their sheets and lists). */
export function avWorkbook(f: AvForm, assets: AvAsset[]) {
  const files = unzipSync(new Uint8Array(Buffer.from(AV_TEMPLATE, "base64")));
  const sheet = (n: number) => strFromU8(files[`xl/worksheets/sheet${n}.xml`]);
  let s1 = sheet(1), s2 = sheet(2), s3 = sheet(3);
  const main = assets.find((a) => !a.mobile) ?? assets[0];
  const prop = main?.addr ?? { county: "", city: "", street: "", number: "", block: "", stair: "", floor: "", apartment: "" };
  const c1: [string, string, boolean?][] = [
    ["C2", f.client_id], ["C3", f.firm], ["C4", f.name], ["C5", f.pj ? "DA" : "NU"], ["C6", f.pj ? f.legal_rep : ""], ["C7", f.pj ? "" : f.cnp], ["C8", f.pj ? f.cui : ""], ["C9", f.pj ? f.reg_no : ""],
    ["C10", f.addr.county], ["C11", f.addr.city], ["C12", f.addr.street], ["C13", f.addr.number], ["C14", f.addr.block], ["C15", f.addr.stair], ["C16", f.addr.floor], ["C17", f.addr.apartment],
    ["C18", f.email, true], ["C19", f.recipient], ["C20", f.branch], ["C21", f.officer_email, true], ["C22", f.phone, true], ["C23", f.email, true], ["C24", f.purpose], ["C25", f.same ? "DA" : "NU"],
    ["C26", prop.county], ["C27", prop.city], ["C28", prop.street], ["C29", prop.number], ["C30", prop.block], ["C31", prop.stair], ["C32", prop.floor], ["C33", prop.apartment],
    ["C34", f.fee_vat ? "DA" : "NU"], ["C35", f.due_days],
  ];
  for (const [ref, val, text] of c1) s1 = setCell(s1, ref, val, text);
  let r2 = 3, r3 = 3;
  for (const a of assets) {
    const same = f.same && a === main ? "DA" : "NU";
    if (a.mobile) {
      const vals = [a.type, a.details, a.make, a.model, a.year, a.fee, same, a.addr.county, a.addr.city, a.addr.street, a.addr.number, a.addr.block, a.addr.stair, a.addr.floor, a.addr.apartment, a.postal, a.district, a.days_min, a.days_max];
      vals.forEach((val, i) => { s3 = setCell(s3, `${String.fromCharCode(65 + i)}${r3}`, val); });
      r3++;
    } else {
      const vals = [a.state, a.type, a.subtype, a.details, a.cf, a.parking, a.area, a.fee, same, a.addr.county, a.addr.city, a.addr.street, a.addr.number, a.addr.block, a.addr.stair, a.addr.floor, a.addr.apartment, a.postal, a.district, a.days_min, a.days_max];
      vals.forEach((val, i) => { s2 = setCell(s2, `${String.fromCharCode(65 + i)}${r2}`, val, i === 3); });
      r2++;
    }
  }
  files["xl/worksheets/sheet1.xml"] = strToU8(s1);
  files["xl/worksheets/sheet2.xml"] = strToU8(s2);
  files["xl/worksheets/sheet3.xml"] = strToU8(s3);
  return zipSync(files, { level: 6 });
}
