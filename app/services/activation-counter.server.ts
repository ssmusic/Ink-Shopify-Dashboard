// THE CAP — "run it on my next 200 orders" (Sam, 2026-08-27: the cheapest
// yes of all, because the merchant chooses nothing about their catalogue).
//
// A cap is different in kind from every other way a pilot can be narrowed.
// A state or a product is a PROPERTY of an order: any reader can answer it
// from the order alone, forever, and two readers always agree. A cap is a
// RUNNING TALLY: the answer depends on what came before, so exactly one
// thing may keep it, and that thing is this file.
//
// Two properties it must have, or it lies to a merchant:
//
//   1. IT MUST NOT DOUBLE-COUNT. Shopify webhooks are at-least-once and
//      this handler deliberately returns 500 to ask for a redelivery, so
//      the SAME order arrives more than once as a matter of routine. A
//      marker doc keyed on (shop, order) makes counting idempotent: the
//      second delivery is told the same answer as the first and spends
//      nothing.
//   2. IT MUST NOT OVERSHOOT UNDER LOAD. Two orders landing together must
//      not both read "199 used" and both activate. The read, the decision
//      and the write happen in one Firestore transaction.
//
// The tally lives BESIDE the merchant's choice, never inside it
// (`activation_count`, not `activation_scope`): the choice is theirs and the
// count is ours, and a settings save must never be able to reset the count
// — nor a count clobber the choice.

import type { DocumentReference, Firestore } from "firebase-admin/firestore";

export interface CapDecision {
  /** May this order have a page? */
  ok: boolean;
  /** The cap in force, for the log line. */
  cap: number;
  /** How many have been spent AFTER this decision. */
  used: number;
  /** True when this delivery had already been counted — a redelivery. */
  replay: boolean;
}

/** A deterministic id, so the same order always finds its own marker.
 *  Slashes are illegal in a Firestore document id and order names carry
 *  them (`#1001/2`), which is the same escaping the backend's enroll lock
 *  already does. */
export function activationMarkerId(shop: string, orderId: string | number): string {
  return `${shop}__${String(orderId).replace(/\//g, "_")}`;
}

/**
 * Spend one from the merchant's cap for this order, if there is one to
 * spend. Returns the decision; never throws for the ordinary cases.
 *
 * Call this ONLY for an order that has already passed every other part of
 * the slice — a cap should not be spent on an order that was never going to
 * get a page for another reason.
 */
export async function spendFromCap(
  firestore: Firestore,
  merchantRef: DocumentReference,
  shop: string,
  orderId: string | number,
  cap: number,
): Promise<CapDecision> {
  const markerRef = firestore
    .collection("activation_counted")
    .doc(activationMarkerId(shop, orderId));

  return firestore.runTransaction(async (tx) => {
    // Both reads first — Firestore requires every read in a transaction to
    // precede every write.
    const [markerSnap, merchantSnap] = await Promise.all([
      tx.get(markerRef),
      tx.get(merchantRef),
    ]);

    const data = merchantSnap.data() ?? {};
    const used = Number(data?.activation_count?.activated) || 0;

    // A REDELIVERY IS NOT A SECOND ORDER. It already spent its one, so it
    // gets the same answer it got the first time and the tally is untouched.
    if (markerSnap.exists) {
      const grantedBefore = markerSnap.data()?.activated === true;
      return { ok: grantedBefore, cap, used, replay: true };
    }

    if (used >= cap) {
      // Spent. Remember the refusal too, so a redelivery of THIS order is
      // answered from the marker rather than re-deciding at a later tally.
      tx.set(markerRef, {
        shop,
        order_id: String(orderId),
        activated: false,
        at: new Date().toISOString(),
      });
      return { ok: false, cap, used, replay: false };
    }

    tx.set(markerRef, {
      shop,
      order_id: String(orderId),
      activated: true,
      at: new Date().toISOString(),
    });
    tx.set(
      merchantRef,
      {
        activation_count: {
          // `since` is stamped by whoever sets the cap; preserve whatever is
          // there rather than restarting the clock on every order.
          ...(data?.activation_count?.since ? { since: data.activation_count.since } : {}),
          activated: used + 1,
        },
        updatedAt: new Date(),
      },
      { merge: true },
    );
    return { ok: true, cap, used: used + 1, replay: false };
  });
}
