// EACH LISTED ORDER'S TIMELINE — read with the merchant's own key.
//
// Sam, 2026-09-23: "map — and the distance between the delivery address and
// taps within each order along with your delivery information widget". Two
// MERCHANT-SCOPED doors per order (the key decides the shop; another shop's
// proof answers 404; the admin secret is never sent):
//   · GET {api}/proofs/:id        — the proof: enrolment, the carrier's
//     journey, delivery, first open and its distance, the delivery window,
//     the ship-to's position (routes/api/proofs.js);
//   · GET {api}/proofs/:id/opens  — every open with its verdict, distance,
//     accuracy and fix (ink-backend routes/api/merchantOpens.js, #126 — until
//     it is deployed this answers 404 and the order shows its first open in
//     words, with no point on the map).
// Without the opens door, the first open's words come from the proof door's
// own reading of that open (`open_location`, ink-backend #132 — app/lib/
// open-location.ts) and, above it, from THE RECORD (the backend's words
// projection, read beside this for the same row — withRecordOpen below).
// Never from the proof's raw rollups side by side: gps_verdict carried the
// pre-#99 default 'pass' stamped on opens that shared nothing, and
// first_tap_distance_to_shipping_m is a distance a LATER measurement may have
// written (ink-backend utils/auditPacket.js "honest, not hopeful" · #122 "one
// measurement, one line"). The record reads them honestly; the app says what
// the record says.
// Only what the screen draws reaches the browser: the lifecycle, the address
// and each open's position for the map (never printed), the distances, the
// words. No device field is ever read. Fail-soft and bounded.

import { deliveryWindow, lifecycle } from "../lib/order-timeline";
import type { OrderTimelineData, TimelineOpen } from "../components/OrderTimeline";
import type { RecordRead } from "../lib/record-words";
import { openLocationOf } from "../lib/open-location";

const INK_API_URL = process.env.INK_API_URL || "https://us-central1-inink-c76d3.cloudfunctions.net/api";
const PROOF_ID = /^proof_[0-9a-f]{24}$/;
const READ_BUDGET_MS = 6_000; // five side-by-side reads can meet cold backend instances (measured 2026-09-23: a 0.4 s read timed out at 3 s)

const base = () => (INK_API_URL.endsWith("/") ? INK_API_URL.slice(0, -1) : INK_API_URL);

async function readJson(url: string, apiKey: string, fetchImpl: typeof fetch): Promise<any | null> {
  try {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(READ_BUDGET_MS) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function point(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = num(lat);
  const b = num(lng);
  if (a == null || b == null || (a === 0 && b === 0) || a < -90 || a > 90 || b < -180 || b > 180) return null;
  return { lat: a, lng: b };
}

/** The screen's timeline from the two reads; the opens read may be absent. */
export function timelineFrom(proofBody: any, opensBody: any | null): OrderTimelineData | null {
  const p = proofBody?.proof ?? proofBody;
  if (!p || typeof p !== "object") return null;

  const steps = lifecycle({
    enrolled_at: str(p.enrolled_at),
    delivered_at: str(p.delivered_at),
    first_tap_at: str(p.first_tap_at),
    return_started_at: str(p.return_initiated_at) ?? str(p.return_started_at),
    carrier_journey: p.carrier_journey && Array.isArray(p.carrier_journey.events) ? { events: p.carrier_journey.events } : null,
  });

  const address = point(opensBody?.address?.lat, opensBody?.address?.lng) ?? point(p.shipping_geocode_lat, p.shipping_geocode_lng);

  let opens: TimelineOpen[];
  if (opensBody && Array.isArray(opensBody.opens)) {
    opens = opensBody.opens
      // An open the record calls not a person's (a link preview, a bot) is not drawn.
      .filter((o: any) => String(o?.outcome ?? "").toLowerCase() !== "proxy")
      .map((o: any) => {
        const fix = point(o?.lat, o?.lng);
        return {
          at: str(o?.at),
          verdict: str(o?.gps_verdict),
          distance_m: num(o?.distance_m),
          accuracy_m: num(o?.accuracy_m),
          lat: fix?.lat ?? null,
          lng: fix?.lng ?? null,
        };
      });
  } else {
    // Without the opens door: the first open, from the proof — its time, and
    // its words from the door's own reading of THAT open (open_location): its
    // word, its own distance and radius. A door without that reading says no
    // word here, and the record's words fill it (withRecordOpen) — never
    // gps_verdict beside first_tap_distance_to_shipping_m.
    const first = str(p.first_tap_at);
    const own = openLocationOf(p.open_location);
    opens = first ? [{ at: first, verdict: own?.verdict ?? null, distance_m: own?.distance_m ?? null, accuracy_m: own?.accuracy_m ?? null, lat: null, lng: null }] : [];
  }

  const window = deliveryWindow({
    delivered_at: str(p.delivered_at),
    interaction_window_end: str(p.interaction_window_closed_at),
    enrolled_at: str(p.enrolled_at),
    first_tap_at: str(p.first_tap_at),
    within_expected_window: typeof p.within_expected_window === "boolean" ? p.within_expected_window : null,
  });

  return { steps, address, opens, window, opensFrom: opensBody && Array.isArray(opensBody.opens) ? "opens" : "proof" };
}

/** A timeline built without the opens door takes its first open's location
 *  words from the order's record — the same words the record prints above
 *  it in the accordion. With the opens door, or without a record, it is
 *  returned as it was. */
export function withRecordOpen(t: OrderTimelineData | null, record: RecordRead | null | undefined): OrderTimelineData | null {
  if (!t || t.opensFrom !== "proof" || !record || t.opens.length === 0) return t;
  const open = record.elements.find((e) => e.element === "the_open")?.value as { location?: { verdict?: unknown; distance_m?: unknown } | null } | null | undefined;
  const loc = open?.location;
  if (!loc || typeof loc.verdict !== "string") return t;
  const [first, ...rest] = t.opens;
  return {
    ...t,
    opens: [{ ...first, verdict: loc.verdict, distance_m: num(loc.distance_m) }, ...rest],
  };
}

export async function readTimeline(apiKey: string, proofId: string, fetchImpl: typeof fetch = fetch): Promise<OrderTimelineData | null> {
  if (!apiKey || !PROOF_ID.test(proofId)) return null;
  const id = encodeURIComponent(proofId);
  const [proof, opens] = await Promise.all([
    readJson(`${base()}/proofs/${id}`, apiKey, fetchImpl),
    readJson(`${base()}/proofs/${id}/opens`, apiKey, fetchImpl),
  ]);
  return proof ? timelineFrom(proof, opens) : null;
}

/** Every listed order's timeline, read side by side. */
export async function readTimelines(apiKey: string | null | undefined, proofIds: Array<string | null>, fetchImpl: typeof fetch = fetch): Promise<Record<string, OrderTimelineData>> {
  const out: Record<string, OrderTimelineData> = {};
  if (!apiKey) return out;
  const ids = [...new Set(proofIds.filter((p): p is string => typeof p === "string" && PROOF_ID.test(p)))];
  const reads = await Promise.all(ids.map(async (id) => [id, await readTimeline(apiKey, id, fetchImpl)] as const));
  for (const [id, t] of reads) if (t) out[id] = t;
  return out;
}
