// THE CHARGES THIS APP CREATED FOR RECORDS — remembered so a paid charge
// always mints its key (services/record-door.server.ts).
//
// Shopify's return after the approval screen is the fast path; it is not a
// guarantee (the merchant can close the tab, the admin can drop a query
// param). So every charge is written here the moment it is created, and every
// screen that shows the door SETTLES this shop's pending charges first: an
// ACTIVE charge mints its purchase (the backend keys purchases by the charge's
// own number, so settling twice can never mint twice); a DECLINED or EXPIRED
// one is closed; a PENDING one waits. Fail-soft throughout — a settle that
// cannot finish leaves the charge pending for the next screen, never an error
// page.
//
// Collection `record_charges` (this app's own; the backend never reads it),
// one doc per charge: { shop, proof_id, charge_id, created_at, state,
// settled_at }.

import firestore from "../firestore.server";
import { createRecordPurchase, InkApiError, listRecordPurchases, readRecordPrice } from "./ink-api.server";
import { readRecordCharge, recordDoorRow, recordOffer, recordPriceWords, RECORD_DOOR_LABEL } from "./record-door.server";
import type { InkMerchantView } from "./ink-merchant.server";

const COLLECTION = "record_charges";

type AdminGraphql = Parameters<typeof readRecordCharge>[0];

function docId(shop: string, chargeGid: string): string {
  const digits = chargeGid.split("/").pop() || chargeGid;
  return `${shop}__${digits}`;
}

/** Remember a charge once; a second remember (the return path re-telling a
 *  charge the press already wrote) never overwrites what was written first. */
export async function rememberRecordCharge(shop: string, proofId: string, chargeGid: string): Promise<void> {
  try {
    await firestore.collection(COLLECTION).doc(docId(shop, chargeGid)).create({
      shop,
      proof_id: proofId,
      charge_id: chargeGid,
      created_at: new Date().toISOString(),
      state: "pending",
      settled_at: null,
    });
  } catch (err: unknown) {
    if ((err as { code?: unknown } | null)?.code === 6) return; // ALREADY_EXISTS — remembered at the press.
    console.warn(`[record] could not remember charge ${chargeGid} for ${shop}:`, err);
  }
}

export type SettleResult = { minted: number; closed: number; waiting: number };

/** Mint every ACTIVE charge this shop left pending; close the declined. */
export async function settleRecordCharges(admin: AdminGraphql, shop: string, shopId: string): Promise<SettleResult> {
  const result: SettleResult = { minted: 0, closed: 0, waiting: 0 };
  if (!shopId) return result;
  let docs: Array<{ id: string; data: () => Record<string, unknown> }> = [];
  try {
    const snap = await firestore.collection(COLLECTION).where("shop", "==", shop).where("state", "==", "pending").get();
    docs = snap.docs as unknown as typeof docs;
  } catch (err) {
    console.warn(`[record] pending charges unreadable for ${shop}:`, err);
    return result;
  }
  for (const d of docs) {
    const row = d.data() || {};
    const gid = typeof row.charge_id === "string" ? row.charge_id : "";
    const proofId = typeof row.proof_id === "string" ? row.proof_id : "";
    if (!gid || !proofId) continue;
    const charge = await readRecordCharge(admin, gid);
    if (!charge || charge.status === "PENDING") { result.waiting += 1; continue; }
    const ref = firestore.collection(COLLECTION).doc(d.id);
    if (charge.status !== "ACTIVE") {
      await ref.update({ state: charge.status.toLowerCase(), settled_at: new Date().toISOString() }).catch(() => undefined);
      result.closed += 1;
      continue;
    }
    try {
      await createRecordPurchase({
        proof_id: proofId,
        shop_id: shopId,
        charge_id: gid,
        price_cents: charge.price_cents,
        currency: charge.currency,
        test: charge.test,
      });
      await ref.update({ state: "minted", settled_at: new Date().toISOString() }).catch(() => undefined);
      result.minted += 1;
    } catch (err) {
      // A refusal the backend will keep giving (4xx: no price any more, the
      // charge already used for another order) closes the charge and says so
      // in the log for Sam; a blip (5xx, network) leaves it for next time.
      const status = err instanceof InkApiError ? err.status : 0;
      if (status >= 400 && status < 500) {
        console.error(`[record] ACTIVE charge ${gid} for ${proofId}: REFUSED by the backend (${status}) — a paid charge with no key:`, err);
        await ref.update({ state: "refused", refused_status: status, settled_at: new Date().toISOString() }).catch(() => undefined);
        result.closed += 1;
      } else {
        console.error(`[record] ACTIVE charge ${gid} for ${proofId}: the backend did not answer (left pending):`, err);
        result.waiting += 1;
      }
    }
  }
  return result;
}

// ── What each order row draws ──────────────────────────────────────────────

export type RecordDoorView = {
  /** The record is priced and this order's is not bought: the proof is
   *  behind the purchase (the export and the PDF answer 402). */
  locked: boolean;
  /** "Get the record — $15", or null (no price, or the switch is off). */
  offerLine: string | null;
  purchase: { id: string; packet_url: string | null; outcome: "open" | "won" | "lost" | "unknown" } | null;
};

const NO_DOOR: RecordDoorView = { locked: false, offerLine: null, purchase: null };

/** Settle this shop's pending charges, then say what each order's door is.
 *  No price on the merchant and no purchase ever made → every row draws
 *  nothing, and nothing but the settle's one query is spent. Fail-soft. */
export async function readRecordDoors(
  admin: AdminGraphql,
  view: Pick<InkMerchantView, "shop" | "shopId">,
  proofIds: Array<string | null>,
): Promise<Record<string, RecordDoorView>> {
  const out: Record<string, RecordDoorView> = {};
  if (!view.shopId) return out;
  const settled = await settleRecordCharges(admin, view.shop, view.shopId);
  // The backend's resolved price — never the raw field, never a default here.
  const priced = await readRecordPrice(view.shopId);
  // A purchase can exist only where a price once did; skip the read otherwise.
  if (!priced && settled.minted === 0) return out;
  const offer = recordOffer(priced);
  const purchases = await listRecordPurchases(view.shopId);
  for (const proofId of proofIds) {
    if (!proofId) continue;
    const row = recordDoorRow(proofId, offer, purchases);
    out[proofId] = {
      locked: !!priced && !row.purchase,
      offerLine: row.offer ? `${RECORD_DOOR_LABEL} — ${recordPriceWords(row.offer)}` : null,
      purchase: row.purchase,
    };
  }
  return out;
}

export function recordDoorFor(doors: Record<string, RecordDoorView>, proofId: string | null | undefined): RecordDoorView {
  return (proofId && doors[proofId]) || NO_DOOR;
}
