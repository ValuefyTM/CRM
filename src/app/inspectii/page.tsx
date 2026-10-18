import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { basePath } from "@/lib/site";
import { InspApp } from "./app/InspApp";

export const dynamic = "force-dynamic";

/** The app shell. Everything else runs on the phone (works offline once loaded). */
export default async function InspectiiHome() {
  const base = await basePath("insp");
  const db = await getDb();
  const user = db ? await currentUser(db, "insp") : null;
  if (!user) redirect(`${base}/login`);
  return (
    <>
      {/* Its own install only on its own address; opened from the CRM it is part of the CRM app (one icon). */}
      {!base && <link rel="manifest" href="/manifest.webmanifest" />}
      <InspApp base={base} me={{ id: user.id, name: user.name || user.email, email: user.email, role: user.role }} />
    </>
  );
}
