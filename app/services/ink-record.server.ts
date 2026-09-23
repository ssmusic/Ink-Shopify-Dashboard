// EACH RECENT ORDER'S RECORD — read for the screen, so the record is shown
// inside the app instead of linked out to (Sam, 2026-09-23: "we're doing
// everything inside this shopify app" · "we need to be showing the record").
//
// THE MERCHANT SEES THE WHOLE RECORD (Sam, 2026-09-23: "merchants need to see
// lots of compelling data — the 29 gets it signed — they need to build their
// case with and decide if our data is helping — so they need to see it";
// ink-backend #129). With the shop's OWN key (the merchant doc's ink_api_key:
// the shop is the key's, and another shop's proof answers 404) the read is the
// merchant door, GET {INK_API_URL}/proofs/:proofId/audit — the whole record.
// Each signed event is checked here (services/record-check.server.ts) against
// the published key, read once per screen from its own door
// ({INK_API_URL}/.well-known/jwks.json), never from the packet it checks. Only
// WORDS reach the screen: the elements, the checks, and each event's place,
// kind, time and check — never a signed byte, a hash or a coordinate. What the
// price buys is the hand-over (lib/record-handover.ts), said as `forSale`.
//
// No key yet (a fresh install), or the merchant door refused: the public read,
// GET {INK_API_URL}/verify/:proofId — the words projection every record serves
// to anyone holding its id (ink-backend #124), exactly as before.
//
// Fail-soft and bounded: a slow or refused read is a row without its record,
// never a slow or broken screen.

import { checkRecord, type Jwks, type WholePacket } from "./record-check.server";
import { handoverPrice } from "../lib/record-handover";
import { checkoutFromBody } from "../lib/checkout-words";
import {
  NOT_CHECKED,
  SIGNATURE_WORDS,
  UNCHECKED,
  checkWords,
  eventWords,
  type RecordBrowsers,
  type RecordElement,
  type RecordEvent,
  type RecordRead,
  type RecordSummary,
} from "../lib/record-words";

const INK_API_URL = process.env.INK_API_URL || "https://us-central1-inink-c76d3.cloudfunctions.net/api";
const PROOF_ID = /^proof_[0-9a-f]{24}$/;
const READ_BUDGET_MS = 6_000; // five side-by-side reads can meet cold backend instances (measured 2026-09-23: a 0.4 s read timed out at 3 s)

const base = () => (INK_API_URL.endsWith("/") ? INK_API_URL.slice(0, -1) : INK_API_URL);
const verifyUrl = (proofId: string) => `${base()}/verify/${encodeURIComponent(proofId)}`;
const auditUrl = (proofId: string) => `${base()}/proofs/${encodeURIComponent(proofId)}/audit`;
const jwksUrl = () => `${base()}/.well-known/jwks.json`;

async function readJson(url: string, fetchImpl: typeof fetch, headers?: Record<string, string>): Promise<unknown | null> {
  try {
    const res = await fetchImpl(url, { ...(headers ? { headers } : {}), signal: AbortSignal.timeout(READ_BUDGET_MS) });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[ink] record read failed for ${url.replace(base(), "")}:`, (err as Error)?.message ?? err);
    return null;
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** The browsers the opens came from, as the screen may carry them — an
 *  allowlist, so no browser's id (which the proof layer does serve — the
 *  merchant door's whole record included) ever reaches the app's page. Null
 *  when the read has none. */
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

type Body = {
  summary?: RecordSummary;
  verdict?: { elements?: unknown[] };
  record?: { locked?: unknown };
  checkout_vs_opens?: unknown;
  browsers?: unknown;
  chain?: unknown;
  legacy_events?: unknown;
};

function elementsOf(b: Body): RecordElement[] {
  const elements: RecordElement[] = [];
  for (const e of b.verdict?.elements ?? []) {
    const el = e as Partial<RecordElement> | null;
    if (!el || typeof el.element !== "string" || typeof el.label !== "string") continue;
    elements.push({
      element: el.element,
      label: el.label,
      status: typeof el.status === "string" ? el.status : "missing",
      value: el.value && typeof el.value === "object" ? (el.value as Record<string, unknown>) : null,
    });
  }
  return elements;
}

type RawEvent = { event_id?: string | null; seq?: number | null; event_type?: string | null; timestamp?: string | null };

/** The record a door answered, in words — the whole record when the door
 *  answered its chain (checked against `jwks` when the key loaded), else the
 *  words. Null when the body is not a record. */
export function recordFromBody(body: unknown, jwks: Jwks | null = null): RecordRead | null {
  const b = body as Body | null;
  if (!b || typeof b !== "object" || !Array.isArray(b.verdict?.elements)) return null;
  // The checkout beside the opens rides the same read, only when the backend's
  // switch put it there; the browsers, only when the record names one. Absent,
  // the record is exactly what it was.
  const checkout = checkoutFromBody(b.checkout_vs_opens);
  const browsers = browsersFromBody(b.browsers);
  const words: RecordRead = {
    summary: b.summary ?? {},
    elements: elementsOf(b),
    locked: b.record?.locked === true,
    ...(checkout ? { checkout } : {}),
    ...(browsers ? { browsers } : {}),
  };
  if (!Array.isArray(b.chain)) return words;

  let events: RecordEvent[];
  let checks;
  if (jwks) {
    const check = checkRecord(b as WholePacket, jwks);
    events = check.events.map((e) => ({ seq: e.seq, event_id: e.event_id, type: eventWords(e.event_type), at: e.timestamp, check: SIGNATURE_WORDS[e.signature] ?? e.signature, legacy: e.legacy }));
    checks = checkWords(check);
  } else {
    // The key did not load: every event is listed, and none is said checked.
    const chain = [...(b.chain as RawEvent[])].sort((x, y) => (x.seq ?? 0) - (y.seq ?? 0));
    const legacy = Array.isArray(b.legacy_events) ? (b.legacy_events as RawEvent[]) : [];
    events = [
      ...chain.map((e) => ({ seq: e.seq ?? null, event_id: e.event_id ?? null, type: eventWords(e.event_type), at: e.timestamp ?? null, check: NOT_CHECKED, legacy: false })),
      ...legacy.map((e) => ({ seq: null, event_id: e.event_id ?? null, type: eventWords(e.event_type), at: e.timestamp ?? null, check: NOT_CHECKED, legacy: true })),
    ];
    checks = UNCHECKED;
  }
  return { ...words, locked: false, whole: true, events, checks, forSale: handoverPrice(b.record) };
}

/** The published keys, read from their own door; null when they did not load. */
async function readJwks(fetchImpl: typeof fetch): Promise<Jwks | null> {
  const body = (await readJson(jwksUrl(), fetchImpl)) as Jwks | null;
  return body && Array.isArray(body.keys) ? body : null;
}

/** One order's record: whole through the merchant door with the shop's own
 *  key, else its public words. `keys` is the published key set's read. */
export async function readRecord(
  proofId: string,
  fetchImpl: typeof fetch = fetch,
  apiKey: string | null = null,
  keys: Promise<Jwks | null> | null = null,
): Promise<RecordRead | null> {
  if (!PROOF_ID.test(proofId)) return null;
  if (apiKey) {
    const [body, jwks] = await Promise.all([
      readJson(auditUrl(proofId), fetchImpl, { Authorization: `Bearer ${apiKey}` }),
      keys ?? readJwks(fetchImpl),
    ]);
    const read = body ? recordFromBody(body, jwks) : null;
    if (read) return read;
  }
  const words = await readJson(verifyUrl(proofId), fetchImpl);
  return words ? recordFromBody(words) : null;
}

/** Every listed order's record, read side by side — the published key once. */
export async function readRecords(
  proofIds: Array<string | null>,
  fetchImpl: typeof fetch = fetch,
  apiKey: string | null = null,
): Promise<Record<string, RecordRead>> {
  const ids = [...new Set(proofIds.filter((p): p is string => typeof p === "string" && PROOF_ID.test(p)))];
  const keys = apiKey && ids.length ? readJwks(fetchImpl) : null;
  const reads = await Promise.all(ids.map(async (id) => [id, await readRecord(id, fetchImpl, apiKey, keys)] as const));
  const out: Record<string, RecordRead> = {};
  for (const [id, r] of reads) if (r) out[id] = r;
  return out;
}
