import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { err, json, staffApi } from "@/lib/api";
import { cleanTemplate } from "@/lib/insp-templates";
import { removeTemplate, renameTemplate, saveTemplate, setTemplateAssets, templateList, templateOf } from "@/lib/insp-templates-db";
import { cleanAssets } from "@/lib/insp-templates";
import { dropTemplateInUvalo, inspChannel, later, syncTemplates } from "@/lib/uvalo";

type P = { params: Promise<{ type: string }> };
const sheetOf = async (db: D1Database, p: P) => { const { type } = await p.params; return (await templateList(db)).find((x) => x.key === type) ?? null; };

/** Saves the firm's template of one sheet (owner / admins). Applies to the sheets started from now on. */
export async function PUT(req: Request, p: P) {
  const a = await staffApi("templates.E", true);
  if ("res" in a) return a.res;
  const s = await sheetOf(a.db, p);
  if (!s) return err("Fișă necunoscută.", 404);
  const r = cleanTemplate(s.base, (await json(req)).groups);
  if (!r.ok) return err(r.error);
  await saveTemplate(a.db, s.key, r.tpl, a.user.id);
  await audit(a.db, `user:${a.user.id}`, "insp.template", "insp_template", s.key, `Fișa ${s.name} modificată`);
  // inspections through UVALO: the sheet is sent there too (the UVALO copy is changed only from here)
  if ((await inspChannel(a.db)) === "uvalo") await later(syncTemplates(a.db, s.key));
  return NextResponse.json({ ok: true, ...(await templateOf(a.db, s.key, s.base)) });
}

/** Renames a sheet (`{ name }`) or links it to asset types (`{ assets: ["CATEGORIE" | "CATEGORIE|TIP"] }`). */
export async function PATCH(req: Request, p: P) {
  const a = await staffApi("templates.E", true);
  if ("res" in a) return a.res;
  const s = await sheetOf(a.db, p);
  if (!s) return err("Fișă necunoscută.", 404);
  const b = await json(req);
  if (Array.isArray(b.assets)) {
    const assets = cleanAssets(b.assets);
    await setTemplateAssets(a.db, s.key, s.base, assets);
    await audit(a.db, `user:${a.user.id}`, "insp.template", "insp_template", s.key, `Fișa ${s.name}: ${assets.length ? `pentru ${assets.length} tipuri de bun` : "pentru orice bun"}`);
    return NextResponse.json({ ok: true, assets });
  }
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  if (!name) return err("Scrie numele fișei.");
  if ((await templateList(a.db)).some((x) => x.key !== s.key && x.name.toLowerCase() === name.toLowerCase())) return err("Există deja o fișă cu acest nume.");
  await renameTemplate(a.db, s.key, s.base, name);
  await audit(a.db, `user:${a.user.id}`, "insp.template", "insp_template", s.key, `Fișa ${s.name} redenumită „${name}”`);
  if ((await inspChannel(a.db)) === "uvalo") await later(syncTemplates(a.db, s.key));
  return NextResponse.json({ ok: true, name });
}

/** Back to the built-in form ("Modelul VALUEFY"); `?sterge=1` takes the sheet off the list (UVALO keeps its own standard sheets). */
export async function DELETE(req: Request, p: P) {
  const a = await staffApi("templates.E", true);
  if ("res" in a) return a.res;
  const s = await sheetOf(a.db, p);
  if (!s) return err("Fișă necunoscută.", 404);
  if (new URL(req.url).searchParams.get("sterge") === "1") {
    await removeTemplate(a.db, s.key, s.base);
    if ((await inspChannel(a.db)) === "uvalo") await later(dropTemplateInUvalo(s.key));
    await audit(a.db, `user:${a.user.id}`, "insp.template", "insp_template", s.key, `Fișa ${s.name} ștearsă`);
    return NextResponse.json({ ok: true, removed: true });
  }
  await saveTemplate(a.db, s.key, null, a.user.id);
  await audit(a.db, `user:${a.user.id}`, "insp.template", "insp_template", s.key, `Fișa ${s.name} readusă la modelul VALUEFY`);
  if ((await inspChannel(a.db)) === "uvalo") await later(syncTemplates(a.db, s.key));
  return NextResponse.json({ ok: true, ...(await templateOf(a.db, s.key, s.base)) });
}
