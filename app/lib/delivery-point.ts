/** WHICH FACT THE DELIVERY POINT IS (2026-09-24, Sam on the Alo demo's
 *  #TOWELS: "also is this a problem") — the record page's words
 *  (the-ritualist src/lib/delivery-point.ts), sentence for sentence.
 *
 *  THE OPEN measures an open against one point: the order's shipping
 *  address, geocoded. Two different facts leave a record without it, and
 *  the block said both with one sentence ("the delivery address is not
 *  geocoded on this row"):
 *    none        — the order has NO shipping address: a pickup, a digital
 *                  order, a parcel enrolled by hand without one. There is
 *                  nothing to measure an open against, ever.
 *    ungeocoded  — the address is on file but has no map point yet. The
 *                  backend geocodes it again on the order's next open.
 *  The backend is the one author (ink-backend utils/deliveryPoint.js
 *  addressStateOf), served as the record's `summary.address_state`
 *  (services/ink-record.server.ts keeps it, and only its words); this reads
 *  it and says it. A point on the row is a point, whatever the word says. A
 *  record from before the word existed says nothing new: the caller keeps
 *  the sentence it had.
 *
 *  Either way the block draws the open alone — its fix, no rings, no line —
 *  as it always has; nothing here invents an address or a point.
 *
 *  PLACEHOLDER copy: the two sentences — Sam's words replace them. */

export type AddressState = "none" | "ungeocoded" | "geocoded";

export const ADDRESS_STATES: readonly AddressState[] = ["none", "ungeocoded", "geocoded"];

/** PLACEHOLDER — the order has no shipping address. */
export const NO_SHIPPING_ADDRESS = "No shipping address on this order.";
/** PLACEHOLDER — the address is on file, with no map point yet. */
export const NO_MAP_POINT_YET = "The address is on file but has no map point yet.";

/** The backend's word, when it is one of the three; else null. */
export function addressStateWord(v: unknown): AddressState | null {
  return typeof v === "string" && (ADDRESS_STATES as readonly string[]).includes(v) ? (v as AddressState) : null;
}

/** The fact, or null when the record does not say (an older backend). */
export function addressStateOf(
  record: { summary?: { address_state?: AddressState | null } | null } | null | undefined,
  address: { lat: number; lng: number } | null | undefined,
): AddressState | null {
  if (address) return "geocoded";
  const word = addressStateWord(record?.summary?.address_state);
  return word === "none" || word === "ungeocoded" ? word : null;
}

/** The diagram's caption for the fact (PLACEHOLDER, from the sentences), or
 *  null when there is a point or the record does not say. */
export function noPointCaption(state: AddressState | null): string | null {
  if (state === "none") return "no shipping address";
  if (state === "ungeocoded") return "no map point yet";
  return null;
}

/** The sentence for a record with no point, or null when there is a point or
 *  the record does not say which fact it is. */
export function noPointSentence(state: AddressState | null): string | null {
  if (state === "none") return NO_SHIPPING_ADDRESS;
  if (state === "ungeocoded") return NO_MAP_POINT_YET;
  return null;
}
