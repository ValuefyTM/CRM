// Server-only: the Apify actor apify/web-fetch, started asynchronously (the cron does not wait: it starts runs, and the
// next passes collect them). Token: secret APIFY_TOKEN.
const API = "https://api.apify.com/v2";
const ACTOR = "apify~web-fetch";

export type FetchItem = { url?: string; fetch?: { loadedUrl?: string; httpStatusCode?: number }; markdown?: string | null; raw?: string | null; html?: string | null };

function token() {
  const t = process.env.APIFY_TOKEN;
  if (!t) throw new Error("Lipsește APIFY_TOKEN (Settings → Variables and Secrets).");
  return t;
}
const H = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

/** Starts a run; returns its id and dataset, or throws (e.g. the account's limit of parallel runs → retried later). */
export async function startFetch(url: string, formats: string[]) {
  const r = await fetch(`${API}/acts/${ACTOR}/runs`, { method: "POST", headers: H(), body: JSON.stringify({ url, formats }) });
  if (!r.ok) throw new Error(`Apify ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = ((await r.json()) as { data: { id: string; defaultDatasetId: string } }).data;
  return { runId: d.id, datasetId: d.defaultDatasetId };
}

/** READY | RUNNING | SUCCEEDED | FAILED | ABORTED | TIMED-OUT (waits up to `wait` seconds for the end). */
export async function runStatus(runId: string, wait = 0) {
  const r = await fetch(`${API}/actor-runs/${runId}${wait ? `?waitForFinish=${wait}` : ""}`, { headers: H() });
  if (!r.ok) throw new Error(`Apify ${r.status}`);
  return ((await r.json()) as { data: { status: string } }).data.status;
}

export async function datasetItem(datasetId: string): Promise<FetchItem | null> {
  const r = await fetch(`${API}/datasets/${datasetId}/items?format=json&clean=true&limit=1`, { headers: H() });
  if (!r.ok) throw new Error(`Apify ${r.status}`);
  const items = (await r.json()) as FetchItem[];
  return items[0] ?? null;
}

export const apifyConfigured = () => !!process.env.APIFY_TOKEN;

/** Stops a run (cancelled from the control panel); errors are ignored. */
export async function abortRun(runId: string) {
  await fetch(`${API}/actor-runs/${runId}/abort`, { method: "POST", headers: H() }).catch(() => null);
}
