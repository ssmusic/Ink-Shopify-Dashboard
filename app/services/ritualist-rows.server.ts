// THE RITUALIST'S ROWS, READ THE WAY INK'S ARE — for the Shipments row's
// panel, which is ink's own (components/InkRecentOrders.tsx OrderPanel):
// the order's activity on the honest rail, the record's words, THE LAST OPEN
// and EVERY OPEN on their maps, the browser's check and every signed event.
//
// Nothing here is a second reader. Each listed order's record comes through
// the merchant audit door (services/ink-record.server.ts readRecords — the
// published keys read once), and its timeline through the proof and opens
// doors (services/ink-timeline.server.ts readTimelines), with the merchant's
// own key — the key the Ritualist's order page already reads its proof with
// (services/merchant-doc.server.ts findMerchantDoc).
//
// WHAT MAKES THE RITUALIST'S ROW ITS OWN: the record is included. The
// backend's price author returns null for a merchant on the Ritualist, so its
// audit door answers the whole record with no record block and its export
// door answers without a purchase. The door built here says so: it never
// offers the record, never names a price, and checks no purchase before a
// download — the files come from the same doors ink's Records library asks
// (routes/app.record.tsx, services/ink-billing.server.ts inkRecordAction).

import firestore from "../firestore.server";
import type { InkDoor } from "../components/InkRecordDoor";
import type { OrderTimelineData } from "../components/OrderTimeline";
import type { RecordRead } from "../lib/record-words";
import { findMerchantDoc } from "./merchant-doc.server";
import { PROOF_ID } from "./ink-reader.server";
import { readRecords } from "./ink-record.server";
import { readTimelines } from "./ink-timeline.server";

/** The merchant's own key, as the Ritualist's order page resolves it; null
 *  while the install has not provisioned one. */
export async function ritualistApiKey(shop: string): Promise<string | null> {
  try {
    const hit = await findMerchantDoc(firestore, shop);
    const key = hit?.data?.ink_api_key;
    return typeof key === "string" && key ? key : null;
  } catch {
    return null;
  }
}

/** The row's door on the Ritualist: the record's files, free. Downloads stand
 *  whenever there is a record and a key to ask for it with. */
export function includedRecordDoor(apiKey: string | null, proofId: string | null): InkDoor {
  return {
    offerLine: null,
    pending: false,
    paidPendingRecord: false,
    resumeUrl: null,
    downloadable: Boolean(apiKey && proofId && PROOF_ID.test(proofId)),
    inHistory: false,
    purchase: null,
  };
}

export type ShipmentPanels = {
  records: Record<string, RecordRead>;
  timelines: Record<string, OrderTimelineData>;
};

/** Every listed order's record and timeline, read side by side. Fail-soft: a
 *  row whose reads do not answer opens onto what the panel says without them. */
export async function readShipmentPanels(
  apiKey: string | null,
  proofIds: Array<string | null>,
  fetchImpl: typeof fetch = fetch,
): Promise<ShipmentPanels> {
  const ids = proofIds.filter((p): p is string => typeof p === "string" && PROOF_ID.test(p));
  if (!ids.length) return { records: {}, timelines: {} };
  const records = await readRecords(ids, fetchImpl, apiKey).catch(() => ({}) as Record<string, RecordRead>);
  const timelines = await readTimelines(apiKey, ids, fetchImpl, records).catch(() => ({}) as Record<string, OrderTimelineData>);
  return { records, timelines };
}
