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

// PLACEHOLDER copy — Sam's words replace it. Said beside "Get the record — $29":
// what the price buys is the copy to hand over, never the sight of the record.
export const HANDOVER_SENTENCE = "The signed copy to hand over.";
