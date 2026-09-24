// THE $29 BUYS THE HAND-OVER (Sam, 2026-09-23: "merchants need to see lots of
// compelling data — the 29 gets it signed — they need to build their case with
// and decide if our data is helping — so they need to see it"; ink-backend #129).
//
// The merchant's own audit door answers the WHOLE record, priced or not. What
// a price locks is the HAND-OVER: the printed report, the export, the dispute
// packet, and the public link's proof layer. The `record` block a door answers
// says which:
//   { locked: true, price_cents, currency }          the public words (an older
//                                                     backend's merchant door too)
//   { locked: false, purchased: false, price_cents } the merchant's whole view,
//                                                     the hand-over for sale
//   { locked: false, purchased: true, ... }          bought
//   absent                                           free (priced at 0)
// Pure: the loaders, the doors and the screens ask the same question here.

export type HandoverPrice = { price_cents: number; currency: string };

type RecordBlock = { locked?: unknown; purchased?: unknown; price_cents?: unknown; currency?: unknown };

function blockOf(record: unknown): RecordBlock | null {
  return record && typeof record === "object" ? (record as RecordBlock) : null;
}

/** The hand-over's price while it is still for sale, else null (bought, or free). */
export function handoverPrice(record: unknown): HandoverPrice | null {
  const r = blockOf(record);
  if (!r || r.purchased === true) return null;
  if (typeof r.price_cents !== "number") return null;
  if (r.locked !== true && r.purchased !== false) return null;
  return { price_cents: r.price_cents, currency: typeof r.currency === "string" ? r.currency : "USD" };
}

/** True while the hand-over (the PDF, the export, the dispute packet, the
 *  public link's proof) is for sale. */
export function handoverLocked(record: unknown): boolean {
  return handoverPrice(record) !== null;
}

// THE RITUALIST WITHOUT A PLAN (Sam, 2026-09-24; ink-backend #154). The
// backend includes the record on the Ritualist's plan (absent included), or
// when the Ritualist is installed AND its plan is active, or by Sam's dial.
// A store with the app installed and no active plan is priced like any ink
// store, so the Ritualist's downloads would answer 402. The Ritualist never
// sells the record and never names ink's price: it says so in one line and
// links to Billing. PLACEHOLDER copy — Sam's words replace it.
export const RITUALIST_PLAN_SENTENCE = "The record is included with a Ritualist plan.";
export const RITUALIST_BILLING_PATH = "/app/billing";

/** The Ritualist is looking at a record the backend prices: the store has no
 *  active Ritualist plan. A bought record is the merchant's, so it does not
 *  count; a free one never carries a price. */
export function recordNeedsRitualistPlan(record: unknown): boolean {
  const r = blockOf(record) as (RecordBlock & { forSale?: unknown }) | null;
  if (!r) return false;
  if (r.forSale && typeof r.forSale === "object") return true;
  return handoverLocked(r) || r.locked === true;
}

// PLACEHOLDER copy — Sam's words replace it. Said beside "Get the record — $29":
// what the price buys is the copy to hand over, never the sight of the record.
export const HANDOVER_SENTENCE = "The signed copy to hand over.";
