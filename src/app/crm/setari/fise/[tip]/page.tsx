import { redirect } from "next/navigation";
import { staffPage } from "@/lib/guard";

/** The old address of one sheet: the editor is on Setări → Fișe de inspecție now. */
export default async function SheetTemplatePage({ params }: { params: Promise<{ tip: string }> }) {
  const { base } = await staffPage("templates");
  redirect(`${base}/setari/fise?tip=${encodeURIComponent((await params).tip)}`);
}
