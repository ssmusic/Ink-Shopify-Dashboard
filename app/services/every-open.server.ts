// EVERY OPEN'S SIGNED SIDE — the whole record (the merchant door, GET
// {api}/proofs/:id/audit, read with the shop's own key) projected to what the
// Every open table prints of each signed open: its event id and time, whether
// a person made it (the open's own signed word: a reload's fire, a link
// scanner's visit), its browser's name and device word, the network it
// signed, its own measurement (else its late share's), and the server's check
// of its signature against the published key.
//
// The record page reads the same things off the same packet (the-ritualist
// src/lib/audit-packet.ts openLog, openBrowserWords, signedMeasurement,
// lateShareOf). Here they are read on the server, and only the words leave:
// NEVER a hash, a signature, a signed byte, a tap id, a browser's id or a
// coordinate (the map's points come from the opens door's rows). The device
// word is the one the record itself carries per browser (ink-backend
// utils/auditPacket.js browsers — the row's user agent in the record's one
// device word); an open with no browser id has none, and the merchant's doors
// carry no other.

import type { RecordOpen } from "../lib/every-open";
import { NOT_CHECKED } from "../lib/record-words";

type RawEvent = {
  event_id?: unknown;
  event_type?: unknown;
  timestamp?: unknown;
  legacy?: unknown;
  signed_bytes?: unknown;
};

// The browser id the buyer's page signs (ink-backend utils/tapOpenContext.js BROWSER_ID_RE).
const BROWSER_ID = /^[0-9a-f]{32}$/;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** The event's own signed data, parsed from its exact bytes; null when withheld or unreadable. */
function dataOf(e: RawEvent | null | undefined): Record<string, unknown> | null {
  if (!e || typeof e.signed_bytes !== "string") return null;
  try {
    const parsed = JSON.parse(e.signed_bytes) as { event_data?: unknown };
    return parsed && typeof parsed.event_data === "object" && parsed.event_data !== null ? (parsed.event_data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type Measurement = { verdict: string | null; distance_m: number | null; accuracy_m: number | null };

function measurementOf(data: Record<string, unknown> | null): Measurement | null {
  if (!data) return null;
  const verdict = str(data.gps_verdict)?.toLowerCase() ?? null;
  if (!verdict) return null;
  return { verdict, distance_m: num(data.distance_m), accuracy_m: num(data.accuracy_m) };
}

const NON_HUMAN = new Set(["stale", "proxy"]);

/** Every signed open of a whole record, oldest first, in words. `checks`:
 *  each event's signature check in words, by event id. */
export function signedOpensFromBody(body: unknown, checks: Map<string, string> | null): RecordOpen[] {
  const b = body && typeof body === "object" ? (body as { chain?: unknown; legacy_events?: unknown; browsers?: unknown }) : null;
  if (!b || !Array.isArray(b.chain)) return [];
  const chained = (b.chain as RawEvent[]).filter((e) => !!e && typeof e === "object").map((e) => ({ e, legacy: e.legacy === true }));
  const legacy = (Array.isArray(b.legacy_events) ? (b.legacy_events as RawEvent[]) : []).filter((e) => !!e && typeof e === "object").map((e) => ({ e, legacy: true }));
  const all = [...chained, ...legacy];

  // A late share is signed as its own event against the open's tap (LOCATION_SHARED, 2026-09-21).
  const shares = new Map<string, RawEvent>();
  for (const { e } of all) {
    if (e.event_type !== "LOCATION_SHARED") continue;
    const tap = str(dataOf(e)?.tap_id);
    if (tap && !shares.has(tap)) shares.set(tap, e);
  }

  // The record's browsers: each id's short name and device word. The ids stay here.
  const list = (b.browsers as { list?: unknown } | null)?.list;
  const browsers = new Map<string, { label: string; device: string | null }>();
  for (const raw of Array.isArray(list) ? list : []) {
    const x = raw as { browser_id?: unknown; label?: unknown; device?: unknown } | null;
    const id = str(x?.browser_id);
    const label = str(x?.label);
    if (id && label && !browsers.has(id)) browsers.set(id, { label, device: str(x?.device) });
  }

  const out: RecordOpen[] = [];
  for (const { e, legacy: isLegacy } of all) {
    const eventId = str(e.event_id);
    const at = str(e.timestamp);
    if (e.event_type !== "TAP_RECORDED" || !eventId || !at || !Number.isFinite(Date.parse(at))) continue;
    const data = dataOf(e);
    const own = measurementOf(data);
    const share = shares.get(str(data?.tap_id) ?? "") ?? null;
    const late = share ? measurementOf(dataOf(share)) : null;
    // The open's own measurement, unless it shared nothing and its late share did.
    const useLate = !!late && (!own || own.verdict === "not_shared");
    const m = useLate ? late : own;
    const id = str(data?.browser_id);
    const known = id && BROWSER_ID.test(id) ? browsers.get(id) ?? null : null;
    const outcome = str(data?.tap_outcome)?.toLowerCase() ?? null;
    out.push({
      event_id: eventId,
      at,
      legacy: isLegacy,
      outcome: outcome && NON_HUMAN.has(outcome) ? outcome : null,
      browser: !id || !BROWSER_ID.test(id) ? "browser unknown" : known ? `browser ${known.label}` : "not counted",
      device: known?.device ?? null,
      network: str(data?.network_type),
      verdict: m?.verdict ?? null,
      distance_m: m?.distance_m ?? null,
      accuracy_m: m?.accuracy_m ?? null,
      shared_later: useLate,
      share_event_id: useLate ? str(share?.event_id) : null,
      check: checks?.get(eventId) ?? NOT_CHECKED,
    });
  }
  return out.sort((x, y) => Date.parse(x.at as string) - Date.parse(y.at as string));
}
