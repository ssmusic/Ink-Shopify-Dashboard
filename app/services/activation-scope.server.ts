// THE SLICE, webhook side — does this order ACTIVATE for this merchant?
//
// Sam, 2026-08-27: a merchant runs their pilot on the piece of their
// business they are ready for ("might make it easier for them to commit -
// if it isnt their entire global sales"). Today that piece is the states
// they ship to.
//
// CAPTURE IS NOT ACTIVATION, and this file only decides the second one.
// ink's backend still records EVERY order the store sends — the enroll
// call is untouched ("we want all the data. Shopify doesn't have our
// data."). What a slice withholds is the ritual: the Shopify tag and the
// ink.* metafields, and therefore the buyer's page, the branded tracking
// link and every state email — all of which gate on ink.proof_reference
// downstream, so this is the one place the decision has to be made.
//
// A deliberately dumb mirror of the app's src/lib/activation-scope.ts.
// Same law, same tests, no imports across repos: the two must agree, so
// keep them boring enough to compare by eye.
//
// ABSENT CONFIG MEANS TODAY'S BEHAVIOUR. Every merchant on the platform
// has no scope, so every merchant activates everything, exactly as before
// (the Clare-V law — no hardcoded state, no default cohort anywhere).

/** USPS codes we understand. Mirrors the app's table (moments.ts). */
const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI",
  "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN",
  "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH",
  "OK", "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VI",
  "VT", "WA", "WI", "WV", "WY",
]);

const US_STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "puerto rico": "PR", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", "virgin islands": "VI",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

export interface ActivationScope {
  ship_to?: { country?: string; states?: string[] } | null;
}

/** "california" / "CA" / " Ca " → "CA". Unknown → null (never a guess). */
export function normalizeStateCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return null;
  const code =
    normalized.length === 2
      ? normalized.toUpperCase()
      : US_STATE_NAME_TO_CODE[normalized];
  return code && US_STATES.has(code) ? code : null;
}

/** A scope with something to say, or null for "not narrowed". Null is the
 *  answer for absent, empty, malformed, and a country we do not
 *  understand — a merchant is never darkened by data we cannot read. */
export function normalizeScope(raw: unknown): ActivationScope | null {
  if (!raw || typeof raw !== "object") return null;
  const shipTo = (raw as ActivationScope).ship_to;
  if (!shipTo || typeof shipTo !== "object") return null;
  const country =
    typeof shipTo.country === "string" ? shipTo.country.trim().toUpperCase() : "US";
  if (country !== "US") return null;
  const states = Array.isArray(shipTo.states)
    ? Array.from(
        new Set(
          shipTo.states
            .map(normalizeStateCode)
            .filter((s): s is string => s !== null),
        ),
      ).sort()
    : [];
  if (states.length === 0) return null;
  return { ship_to: { country: "US", states } };
}

/** The merchant's slice, off the Firestore merchants doc. */
export function scopeOfMerchant(merchantData: unknown): ActivationScope | null {
  if (!merchantData || typeof merchantData !== "object") return null;
  return normalizeScope((merchantData as Record<string, unknown>).activation_scope);
}

/** The state this RAW Shopify webhook body ships to, or null.
 *
 *  province_code first: Shopify's orders/create body already carries the
 *  two-letter code, so this costs no extra query and — crucially — no new
 *  field on ORDER_DETAIL_QUERY, where one unauthorized selection fails the
 *  whole query silently (order #1019). */
export function stateOfWebhookOrder(payload: unknown): string | null {
  const address = (payload as { shipping_address?: Record<string, unknown> } | null)
    ?.shipping_address;
  if (!address) return null;
  return (
    normalizeStateCode(address.province_code) ??
    normalizeStateCode(address.province) ??
    normalizeStateCode(address.state)
  );
}

/** Does this order get the ritual? Un-narrowed merchants: always yes.
 *
 *  FAIL-CLOSED when a slice is set and the order cannot say where it
 *  ships — the same law aim-audience.ts already rules for aims in the app.
 *  The order is still captured; it simply is not confirmed to be in the
 *  piece the merchant committed to, and we never guess in the direction
 *  that puts a page in a stranger's hands. */
export function orderActivates(
  payload: unknown,
  scope: ActivationScope | null,
): boolean {
  const normalized = normalizeScope(scope);
  if (!normalized) return true;
  const state = stateOfWebhookOrder(payload);
  if (!state) return false;
  return (normalized.ship_to?.states ?? []).includes(state);
}
