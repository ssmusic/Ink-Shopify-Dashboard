// EACH RECENT ORDER'S RECORD — read for the screen, so the record is shown
// inside the app instead of linked out to (Sam, 2026-09-23: "we're doing
// everything inside this shopify app" · "we need to be showing the record").
//
// One public read per order: GET {INK_API_URL}/verify/:proofId — the words
// projection every record already serves to anyone holding its id (ink-backend
// #124). No key, no secret: a priced record answers `record.locked: true` and
// still carries its words. Fail-soft and bounded: a slow or refused read is a
// row without its record, never a slow or broken screen.

import type { RecordBrowsers, RecordElement, RecordRead, RecordSummary } from "../lib/record-words";
import { checkoutFromBody } from "../lib/checkout-words";

const INK_API_URL = process.env.INK_API_URL || "https://us-central1-inink-c76d3.cloudfunctions.net/api";
const PROOF_ID = /^proof_[0-9a-f]{24}$/;
const READ_BUDGET_MS = 6_000; // five side-by-side reads can meet cold backend instances (measured 2026-09-23: a 0.4 s read timed out at 3 s)

function verifyUrl(proofId: string): string {
  const base = INK_API_URL.endsWith("/") ? INK_API_URL.slice(0, -1) : INK_API_URL;
  return `${base}/verify/${encodeURIComponent(proofId)}`;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** The browsers the opens came from, as the screen may carry them — an
 *  allowlist, so no browser's id (which a free record's proof layer does
 *  serve) ever reaches the app's page. Null when the read has none. */
export function browsersFromBody(raw: unknown): RecordBrowsers | null {
  const b = raw as { count?: unknown; unknown_opens?: unknown; list?: unknown } | null;
  if (!b || typeof b !== "object" || !Array.isArray(b.list)) return null;
  const list = b.list
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      label: str(x.label) ?? "",
      device: str(x.device),
      opens: typeof x.opens === "number" && Number.isFinite(x.opens) ? x.opens : 0,
      first_open_at: str(x.first_open_at),
      last_open_at: str(x.last_open_at),
      first_seen_after_delivered_scan: typeof x.first_seen_after_delivered_scan === "boolean" ? x.first_seen_after_delivered_scan : null,
    }));
  return {
    count: list.length,
    unknown_opens: typeof b.unknown_opens === "number" && Number.isInteger(b.unknown_opens) ? b.unknown_opens : 0,
    list,
  };
}

/** The words of one record, or null. */
export function recordFromBody(body: unknown): RecordRead | null {
  const b = body as { summary?: RecordSummary; verdict?: { elements?: unknown[] }; record?: { locked?: unknown }; checkout_vs_opens?: unknown; browsers?: unknown } | null;
  if (!b || typeof b !== "object" || !Array.isArray(b.verdict?.elements)) return null;
  const elements: RecordElement[] = [];
  for (const e of b.verdict!.elements!) {
    const el = e as Partial<RecordElement> | null;
    if (!el || typeof el.element !== "string" || typeof el.label !== "string") continue;
    elements.push({
      element: el.element,
      label: el.label,
      status: typeof el.status === "string" ? el.status : "missing",
      value: el.value && typeof el.value === "object" ? (el.value as Record<string, unknown>) : null,
    });
  }
  // The checkout beside the opens rides the same read, only when the backend's
  // switch put it there; the browsers, only when the record names one. Absent,
  // the record is exactly what it was.
  const checkout = checkoutFromBody(b.checkout_vs_opens);
  const browsers = browsersFromBody(b.browsers);
  return { summary: b.summary ?? {}, elements, locked: b.record?.locked === true, ...(checkout ? { checkout } : {}), ...(browsers ? { browsers } : {}) };
}

export async function readRecord(proofId: string, fetchImpl: typeof fetch = fetch): Promise<RecordRead | null> {
  if (!PROOF_ID.test(proofId)) return null;
  try {
    const res = await fetchImpl(verifyUrl(proofId), { signal: AbortSignal.timeout(READ_BUDGET_MS) });
    if (!res.ok) return null;
    return recordFromBody(await res.json());
  } catch (err) {
    console.warn(`[ink] record read failed for ${proofId}:`, (err as Error)?.message ?? err);
    return null;
  }
}

/** Every listed order's record, read side by side. */
export async function readRecords(proofIds: Array<string | null>, fetchImpl: typeof fetch = fetch): Promise<Record<string, RecordRead>> {
  const ids = [...new Set(proofIds.filter((p): p is string => typeof p === "string" && PROOF_ID.test(p)))];
  const reads = await Promise.all(ids.map(async (id) => [id, await readRecord(id, fetchImpl)] as const));
  const out: Record<string, RecordRead> = {};
  for (const [id, r] of reads) if (r) out[id] = r;
  return out;
}
