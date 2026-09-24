// THE RITUALIST'S ROWS, READ THE WAY INK'S ARE — for the Shipments row's
// panel, which is ink's own (components/InkRecentOrders.tsx OrderPanel):
// the order's activity on the honest rail, the record's words, THE LAST OPEN
// and EVERY OPEN on their maps, the browser's check and every signed event.
//
// Nothing here is a second reader. Each order's record comes through the
// merchant audit door (services/ink-record.server.ts readRecord — the
// published keys read once for the screen), and its timeline through the
// proof and opens doors (services/ink-timeline.server.ts), with the
// merchant's own key — the key the Ritualist's order page already reads its
// proof with (services/merchant-doc.server.ts findMerchantDoc).
//
// EACH ROW STREAMS, as ink's Orders does (routes/app.ink.$section.tsx): the
// screen answers with Shopify's orders alone and each row's record side
// follows as that row's own promise, drawn as it lands. A record's whole read
// takes time in proportion to the record (0.5 s for a few opens, 5.4 s for 92
// on a test store, 2026-09-24); waiting for every record, then every timeline,
// kept a page blank for 10 to 15 s.
//
// WHAT MAKES THE RITUALIST'S ROW ITS OWN: the record is included — on the
// Ritualist's plan. A store with the app installed and no active plan
// (ink-backend #154) is priced by the backend; its row says the plan includes
// the record and links to Billing (ritualistDoorFor), never ink's price. The
// backend's price author returns null for a merchant on the Ritualist, so its
// audit door answers the whole record with no record block and its export
// door answers without a purchase. The door built here says so: it never
// offers the record, never names a price, and checks no purchase before a
// download — the files come from the same doors ink's Records library asks
// (routes/app.record.tsx, services/ink-billing.server.ts inkRecordAction).

import firestore from "../firestore.server";
import type { InkDoor } from "../components/InkRecordDoor";
import type { InkRowRecord } from "../components/InkRecentOrders";
import { findMerchantDoc } from "./merchant-doc.server";
import { PROOF_ID } from "./ink-reader.server";
import { readRecord } from "./ink-record.server";
import { readTimelineReads, timelineOfReads } from "./ink-timeline.server";
import type { Jwks } from "./record-check.server";
import { recordNeedsRitualistPlan } from "../lib/record-handover";

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

/** The door once the record has answered: a record the backend prices means
 *  this store has no active Ritualist plan (ink-backend #154 — an install
 *  alone no longer includes it), so the door says the plan includes it and
 *  offers no download the backend would refuse. */
export function ritualistDoorFor(door: InkDoor, record: unknown): InkDoor {
  return recordNeedsRitualistPlan(record) ? { ...door, downloadable: false, needsPlan: true } : door;
}

/** One row's record side, as ink's Orders reads its own (routes/app.ink.$section.tsx
 *  rowRecord): the record and the timeline's two reads side by side, then the
 *  timeline made from them with the record. `keys` is the published key set,
 *  read once for the screen. Fail-soft: a read that does not answer draws as
 *  a row without it, in the words each part already says for that. */
export async function ritualistRowRecord(
  apiKey: string | null,
  proofId: string | null,
  keys: Promise<Jwks | null> | null = null,
  fetchImpl: typeof fetch = fetch,
): Promise<InkRowRecord> {
  const door = includedRecordDoor(apiKey, proofId);
  if (!proofId || !PROOF_ID.test(proofId)) return { record: null, door, packet: null, timeline: null };
  try {
    const [record, reads] = await Promise.all([
      readRecord(proofId, fetchImpl, apiKey, keys).catch(() => null),
      apiKey ? readTimelineReads(apiKey, proofId, fetchImpl).catch(() => null) : Promise.resolve(null),
    ]);
    const timeline =
      apiKey && reads ? await timelineOfReads(apiKey, proofId, reads, record, fetchImpl).catch(() => null) : null;
    return { record, door: ritualistDoorFor(door, record), packet: null, timeline };
  } catch {
    return { record: null, door, packet: null, timeline: null };
  }
}
