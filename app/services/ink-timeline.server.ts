import type { RecordRead } from "../lib/record-words";
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
//
// Without the opens door, the first open's words come from THE RECORD (the
// backend's words projection, read for the same row) and, when the record has
// none, from the proof door's own reading of that open (`open_location`,
// ink-backend #132 — app/lib/open-location.ts): each word with its own
// distance, one source at a time. Never from the proof's raw rollups side by
// side: its verdict carried the pre-#99 default 'pass' stamped on opens that
// shared nothing, and its first measured distance may be a LATER open's
// (ink-backend utils/auditPacket.js "honest, not hopeful" · #122 "one
// measurement, one line").

import { deliveryWindow, lifecycle } from "../lib/order-timeline";
import type {
  OrderTimelineData,
  TimelineOpen,
} from "../components/OrderTimeline";

import { merchantRead, PROOF_ID } from "./ink-reader.server";
import { inspectionFromAudit } from "../lib/ink-record-inspection";
import { openLocationOf } from "../lib/open-location";
import { everyOpenRows, type DoorOpen } from "../lib/every-open";

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const nonnegative = (v: unknown) => {
  const n = num(v);
  return n != null && n >= 0 ? n : null;
};
const str = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

function point(
  lat: unknown,
  lng: unknown,
): { lat: number; lng: number } | null {
  const a = num(lat);
  const b = num(lng);
  if (
    a == null ||
    b == null ||
    (a === 0 && b === 0) ||
    a < -90 ||
    a > 90 ||
    b < -180 ||
    b > 180
  )
    return null;
  return { lat: a, lng: b };
}

/** The screen's timeline from the two reads; the opens read may be absent. */
export function timelineFrom(
  proofBody: any,
  opensBody: any | null,
  record?: RecordRead | null,
): OrderTimelineData | null {
  const p = proofBody?.proof ?? proofBody;
  if (!p || typeof p !== "object") return null;

  // The first open's moment: the record's own, else the proof's.
  const firstOpenAt = str(record?.summary.first_open_at) ?? str(p.first_tap_at);
  // Who said delivered: the record's own word for its delivery date (the
  // signed carrier event's source when it verifies), else the proof's.
  const deliveryWords = record?.elements.find((e) => e.element === "delivery_date")?.value as
    | { source?: unknown }
    | null
    | undefined;
  const steps = lifecycle({
    enrolled_at: str(p.enrolled_at),
    delivered_at: str(p.delivered_at),
    delivered_source: str(deliveryWords?.source) ?? str(p.delivery_source),
    first_tap_at: firstOpenAt,
    return_started_at: str(p.return_initiated_at) ?? str(p.return_started_at),
    carrier_journey:
      p.carrier_journey && Array.isArray(p.carrier_journey.events)
        ? { events: p.carrier_journey.events }
        : null,
  });

  const address =
    point(opensBody?.address?.lat, opensBody?.address?.lng) ??
    point(p.shipping_geocode_lat, p.shipping_geocode_lng);

  let opens: TimelineOpen[];
  if (opensBody && Array.isArray(opensBody.opens)) {
    opens = opensBody.opens
      // An open the record calls not a person's (a link preview, a bot) is not drawn.
      .filter(
        (o: any) =>
          !["proxy", "stale"].includes(String(o?.outcome ?? "").toLowerCase()),
      )
      .map((o: any) => {
        const fix = point(o?.lat, o?.lng);
        return {
          at: str(o?.at),
          verdict: str(o?.gps_verdict),
          distance_m: nonnegative(o?.distance_m),
          accuracy_m: nonnegative(o?.accuracy_m),
          lat: fix?.lat ?? null,
          lng: fix?.lng ?? null,
        };
      });
  } else {
    // Without the opens door: the first open — its words the record's, else
    // the proof door's own reading of that open; each word with its own
    // distance and radius, never one source's word beside another's number.
    const element = record?.elements.find(
      (e) => e.element === "the_open",
    )?.value;
    const location = element?.location as any;
    const own = openLocationOf(p.open_location);
    const words = str(location?.verdict)
      ? { verdict: str(location?.verdict), distance_m: num(location?.distance_m), accuracy_m: num(location?.accuracy_m) }
      : own
        ? { verdict: own.verdict, distance_m: own.distance_m, accuracy_m: own.accuracy_m }
        : { verdict: null, distance_m: null, accuracy_m: null };
    opens = firstOpenAt
      ? [{ at: firstOpenAt, ...words, lat: null, lng: null }]
      : [];
  }

  // EVERY OPEN (lib/every-open.ts): each open the door answered — a reload's
  // fire and a link scanner's visit included, each said as what it was —
  // joined to its signed open in the record; the signed opens no row
  // describes follow in words. Without the door, the record's signed opens
  // alone, in words, with no point for a map.
  const doorRows: DoorOpen[] | null =
    opensBody && Array.isArray(opensBody.opens)
      ? opensBody.opens.map((o: any) => {
          const fix = point(o?.lat, o?.lng);
          return {
            at: str(o?.at),
            outcome: str(o?.outcome),
            verdict: str(o?.gps_verdict),
            distance_m: nonnegative(o?.distance_m),
            accuracy_m: nonnegative(o?.accuracy_m),
            lat: fix?.lat ?? null,
            lng: fix?.lng ?? null,
          };
        })
      : null;
  const rows = everyOpenRows(doorRows, record?.opens ?? null);

  const window = deliveryWindow({
    delivered_note: steps.find((s) => s.key === "delivered")?.note ?? null,
    delivered_at: str(p.delivered_at),
    interaction_window_end: str(p.interaction_window_closed_at),
    enrolled_at: str(p.enrolled_at),
    first_tap_at: firstOpenAt,
    within_expected_window:
      typeof p.within_expected_window === "boolean"
        ? p.within_expected_window
        : null,
  });

  return {
    steps,
    address,
    opens,
    window,
    opensAvailable: Array.isArray(opensBody?.opens),
    opensCapped: opensBody?.capped === true,
    rows,
  };
}

export async function readTimeline(
  apiKey: string,
  proofId: string,
  fetchImpl: typeof fetch = fetch,
  record?: RecordRead | null,
): Promise<OrderTimelineData | null> {
  if (!apiKey || !PROOF_ID.test(proofId)) return null;
  const id = encodeURIComponent(proofId);
  const [proof, opens] = await Promise.all([
    merchantRead(apiKey, `proofs/${id}`, fetchImpl),
    merchantRead(apiKey, `proofs/${id}/opens`, fetchImpl),
  ]);
  let availableOpens = opens;
  if (!availableOpens && proof && record && !record.locked) {
    const audit = await merchantRead(apiKey, `proofs/${id}/audit`, fetchImpl);
    const inspection = inspectionFromAudit(audit, null);
    if (inspection?.opens)
      availableOpens = {
        opens: inspection.opens.map((item) => ({
          at: item.at,
          distance_m: item.distanceM,
          accuracy_m: item.accuracyM,
          gps_verdict: item.verdict,
          lat: item.location?.lat,
          lng: item.location?.lng,
        })),
      };
  }
  return proof ? timelineFrom(proof, availableOpens, record) : null;
}

/** Every listed order's timeline, read side by side. */
export async function readTimelines(
  apiKey: string | null | undefined,
  proofIds: Array<string | null>,
  fetchImpl: typeof fetch = fetch,
  records?: Record<string, RecordRead>,
): Promise<Record<string, OrderTimelineData>> {
  const out: Record<string, OrderTimelineData> = {};
  if (!apiKey) return out;
  const ids = [
    ...new Set(
      proofIds.filter(
        (p): p is string => typeof p === "string" && PROOF_ID.test(p),
      ),
    ),
  ];
  const reads = await Promise.all(
    ids.map(
      async (id) =>
        [id, await readTimeline(apiKey, id, fetchImpl, records?.[id])] as const,
    ),
  );
  for (const [id, t] of reads) if (t) out[id] = t;
  return out;
}
