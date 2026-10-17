import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { err, json, staffApi } from "@/lib/api";
import { baseTemplate, cleanAssets } from "@/lib/insp-templates";
import { guessSheetType, SHEET_TYPES, type SheetType } from "@/lib/insp-forms";
import { createTemplate, templateList, templateOf } from "@/lib/insp-templates-db";
import { inspChannel, later, syncTemplates } from "@/lib/uvalo";

/** A new sheet: `{ name, from: "blank" | "model:<type>" | <sheet key>, assets?: [...] }` (blank, the VALUEFY model of a type, or a copy). */
export async function POST(req: Request) {
  const a = await staffApi("templates.E", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  if (!name) return err("Scrie numele fișei.");
  if ((await templateList(a.db)).some((x) => x.name.toLowerCase() === name.toLowerCase())) return err("Există deja o fișă cu acest nume.");
  const assets = cleanAssets(b.assets);
  // a blank sheet takes the built-in type of the first asset type it is for (rooms, required photos, CRM columns)
  const [cat, type] = (assets.find((x) => x !== "*") ?? "").split("|");
  const base: SheetType = SHEET_TYPES.some(([t]) => t === b.base) ? (b.base as SheetType) : assets.length ? guessSheetType(cat || null, type || null) : "apartament";
  const made = await createTemplate(a.db, name, typeof b.from === "string" ? b.from : "blank", base, assets, a.user.id);
  if (!made) return err("Alege fișa de la care pornești.");
  await audit(a.db, `user:${a.user.id}`, "insp.template", "insp_template", made.key, `Fișă nouă: ${name}`);
  if ((await inspChannel(a.db)) === "uvalo") await later(syncTemplates(a.db, made.key));
  const cur = await templateOf(a.db, made.key, made.base);
  return NextResponse.json({ ok: true, key: made.key, base: made.base, name, assets, tpl: cur.tpl, model: baseTemplate(made.base) });
}
