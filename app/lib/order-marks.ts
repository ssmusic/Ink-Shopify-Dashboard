// THE MARKS INK LEAVES ON A MERCHANT'S SHOPIFY ORDER — and not one of them
// says a delivery was verified.
//
// Sam, 2026-09-24, shown the Ritualist's order tag "INK-Verified-Delivery",
// the metafield ink.verification_status = "verified", and the Shipments tab's
// green "Verified" badge: "wrong". With his rulings the same night ("we dont
// judge delivery", "we cant confirm at door"): ink never says a delivery was
// verified or confirmed, anywhere it writes, shows or sends.
//
// What changed, and what did not:
//   · the tag ink writes at enrolment, and the word the door notification
//     stores, are neutral from now on;
//   · orders written before this keep their old tag and value — Shopify never
//     rewrites them, and this app does not either — so every reader below
//     accepts the old values beside the new ones;
//   · the backend's wire word (`status: "verified"` on /ink/update) is data
//     between two services and stays; it is worded here, never shown.
//
// ⚠️ PLACEHOLDER COPY — every value a merchant can read here is Sam's to
// replace. The old values are quoted beside them.

import { kmOrM } from "./order-timeline";
import { DELIVERY_VERIFIED_TITLE } from "./record-words";

/** The tag on every order ink records, written at enrolment (orders/create),
 *  by both apps. It reuses the words ink already writes ("Recorded by ink."),
 *  because the tag goes on at enrolment, before any delivery: a tag naming a
 *  distance there would be untrue on the day it is written.
 *  ⚠️ PLACEHOLDER — Sam's word. Was, for the Ritualist: "INK-Verified-Delivery". */
export const ORDER_TAG = "Recorded by ink.";

/** Tags older orders carry and keep — the Ritualist's until 2026-09-24, and
 *  the premium add-on's before it. Read, never written. */
export const LEGACY_ORDER_TAGS: readonly string[] = ["INK-Verified-Delivery", "INK-Premium-Delivery"];

/** Does this order carry ink's tag, old or new? */
export function carriesInkTag(tags: readonly unknown[] | null | undefined): boolean {
  if (!Array.isArray(tags)) return false;
  return tags.some((t) => t === ORDER_TAG || (typeof t === "string" && LEGACY_ORDER_TAGS.includes(t)));
}

/** The ink.verification_status word stored when the backend's door
 *  notification arrives — an open within 100 m after the carrier's scan,
 *  signed as DELIVERY_VERIFIED, whose neutral title is "Distance recorded".
 *  ⚠️ PLACEHOLDER — Sam's word. Was: "verified". */
export const DISTANCE_RECORDED = "recorded";

/** What the same notification stored before 2026-09-24. Old orders keep it. */
export const LEGACY_DISTANCE_RECORDED = "verified";

/** Is this stored status the door notification's, old word or new? */
export function isDistanceRecorded(status: unknown): boolean {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  return s === DISTANCE_RECORDED || s === LEGACY_DISTANCE_RECORDED;
}

/** The word to store on the order for a status off the wire. The backend's
 *  door notification says "verified"; the order says DISTANCE_RECORDED.
 *  Every other wire word ("delivered", …) is stored as it came. */
export function storedStatusFor(wire: string): string {
  return wire === LEGACY_DISTANCE_RECORDED ? DISTANCE_RECORDED : wire;
}

/** The metafield the door's distance lands under: whole metres, from the
 *  notification's `distance_m` (ink-backend routes/verify.js notifyShopify),
 *  the measurement DELIVERY_VERIFIED signs. Orders from before it have none. */
export const OPEN_DISTANCE_KEY = "open_distance_m";

/** A stored distance, or null — positive and finite, or no measurement. */
export function openDistanceOf(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** THE BADGE, for an order the door notification reached: the distance as
 *  data — the record's own sentence, "Opened 40 m from the delivery address",
 *  as a label — or, when no distance was stored (every order from before
 *  2026-09-24), the event's neutral title. Never a tone: no green, nothing
 *  that reads as a pass. ⚠️ PLACEHOLDER — Sam's words; was "Verified". */
export function distanceBadgeWords(distanceM: unknown): string {
  const d = openDistanceOf(distanceM);
  return d != null ? `Opened ${kmOrM(d)} from the delivery address` : DELIVERY_VERIFIED_TITLE;
}

/** A filter tab or a count's name for these orders. ⚠️ PLACEHOLDER — Sam's
 *  word; was "Verified". */
export const DISTANCE_RECORDED_LABEL = DELIVERY_VERIFIED_TITLE;
