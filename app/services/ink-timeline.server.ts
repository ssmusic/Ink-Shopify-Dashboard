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
//     words, from the proof, with no point on the map).
// Only what the screen draws reaches the browser: the lifecycle, the address
// and each open's position for the map (never printed), the distances, the
// words. No device field is ever read. Fail-soft and bounded.

import { deliveryWindow, lifecycle } from "../lib/order-timeline";
import type { OrderTimelineData, TimelineOpen } from "../components/OrderTimeline";

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
    // Before the opens door is live: the first open, in words, from the proof.
    const first = str(p.first_tap_at);
    opens = first
      ? [{ at: first, verdict: str(p.gps_verdict), distance_m: num(p.first_tap_distance_to_shipping_m), accuracy_m: null, lat: null, lng: null }]
      : [];
  }

  const window = deliveryWindow({
    delivered_at: str(p.delivered_at),
    interaction_window_end: str(p.interaction_window_closed_at),
    enrolled_at: str(p.enrolled_at),
    first_tap_at: str(p.first_tap_at),
    within_expected_window: typeof p.within_expected_window === "boolean" ? p.within_expected_window : null,
  });

  return { steps, address, opens, window };
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
