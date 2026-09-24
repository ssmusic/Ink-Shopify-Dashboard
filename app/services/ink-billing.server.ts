// INK'S RECORD CHARGES — one reservation per shop and record, bound before
// Shopify's approval screen, settled only by the charge it reserved.
//
// THE $29 BUYS THE HAND-OVER (lib/record-handover.ts; Sam, 2026-09-23:
// "merchants need to see lots of compelling data — the 29 gets it signed" ·
// "they need to see all the info but not get the signed hash"). The merchant
// door answers the WHOLE record priced or not (ink-backend #129), so a whole
// read's `locked: false` never means bought: the record block's price does.
// While the hand-over is for sale, nothing here hands it over — not the PDF,
// the CSV, the signed JSON, nor the inspection's raw hashes and signatures.
import { createHash } from "node:crypto";
import firestore from "../firestore.server";
import { createRecordPurchase } from "./ink-api.server";
import { readRecord, recordFromBody } from "./ink-record.server";
import type { Jwks } from "./record-check.server";
import { handoverLocked, type HandoverPrice } from "../lib/record-handover";
import type { RecordRead } from "../lib/record-words";
import { buildInkRecordPdf } from "./ink-record-pdf.server";
import { pushOrderPaymentFacts, readOrderPaymentFacts } from "./order-payment-facts.server";
import { inspectionFromAudit } from "../lib/ink-record-inspection";
import { recordDownloadsAvailable } from "../lib/record-words";
import { EXPORT_READ_TIMEOUT_MS, merchantRead, PROOF_ID, RECORD_READ_TIMEOUT_MS } from "./ink-reader.server";
import {
  createRecordCharge,
  findRecordCharge,
  readRecordCharge,
  RecordChargeRefused,
  recordChargeName,
  recordOffer,
  recordPriceWords,
  recordReturnUrl,
} from "./record-door.server";

const collection = () => firestore.collection("ink_record_charges");
const chargeRef = (shop: string, proof: string) =>
  collection().doc(
    createHash("sha256").update(`${shop}\n${proof}`).digest("hex"),
  );
type Admin = Parameters<typeof createRecordCharge>[0];

// A reservation that never heard back from Shopify ("creating", no charge id)
// is asked about after this long: long past any create still in flight.
export const STUCK_AFTER_MS = 5 * 60 * 1000;
// States that hold no charge on Shopify: a new press may reserve again.
const RESERVABLE = ["declined", "expired", "refused", "released"];

export async function settleInkCharge(
  admin: Admin,
  shop: string,
  apiKey: string,
  proofId: string,
) {
  const ref = chargeRef(shop, proofId);
  const snap = await ref.get();
  const row = snap.exists ? snap.data() : null;
  if (!row || row.state === "minted" || RESERVABLE.includes(row.state)) return;
  // THE STUCK RESERVATION HEALS (2026-09-24, corvara #1013 sat at "creating"
  // after Shopify refused the charge): an old reservation with no answer asks
  // Shopify whether its charge exists. None → released, the press is offered
  // again; one → adopted, never charged twice; Shopify cannot say → left.
  if (row.state === "creating" && !row.chargeId) {
    const age = Date.now() - Date.parse(String(row.createdAt || ""));
    if (!(age > STUCK_AFTER_MS)) return;
    const found = await findRecordCharge(admin, {
      name: recordChargeName(String(row.orderName || proofId)),
      since: String(row.createdAt),
    });
    if (found === undefined) return;
    if (found === null) {
      await ref.update({ state: "released", releasedAt: new Date().toISOString() });
      return;
    }
    await ref.update({ chargeId: found, state: "pending" });
    row.chargeId = found;
    row.state = "pending";
  }
  if (row.state === "creating" || !row.chargeId) return;
  const charge = await readRecordCharge(admin, row.chargeId);
  if (!charge) return;
  // Shopify's response must match the charge and amount reserved before redirect.
  if (
    charge.id !== row.chargeId ||
    charge.price_cents !== row.price_cents ||
    charge.currency !== row.currency ||
    charge.test !== row.test
  )
    return;
  if (["DECLINED", "EXPIRED"].includes(charge.status)) {
    await ref.update({ state: charge.status.toLowerCase() });
    return;
  }
  if (charge.status !== "ACTIVE") return;
  // Shopify has approved the charge. Keep this state even if the backend
  // purchase is temporarily unavailable, so the merchant is never sent back
  // to an approval screen or offered a second charge for the same record.
  if (row.state !== "paid_pending_record")
    await ref.update({ state: "paid_pending_record" });
  const proof = await merchantRead(apiKey, `proofs/${proofId}`);
  if (!proof || proof.proof_id !== proofId || typeof proof.shop_id !== "string")
    return;
  const purchase = await createRecordPurchase({
    proof_id: proofId,
    shop_id: proof.shop_id,
    charge_id: charge.id,
    price_cents: charge.price_cents,
    currency: charge.currency,
    test: charge.test,
  });
  if (
    purchase.proof_id !== proofId ||
    purchase.shop_id !== proof.shop_id ||
    purchase.charge_id !== charge.id ||
    purchase.price_cents !== charge.price_cents ||
    purchase.currency !== charge.currency ||
    purchase.test !== charge.test
  )
    throw new Error("Purchase confirmation did not match the charge");
  await ref.update({ state: "minted", settledAt: new Date().toISOString() });
}

/** What the hand-over is, for one record read: its price while it is for
 *  sale, and whether the files may be handed over (bought, or free). Only a
 *  whole read — the merchant door — can say either; the public words of a
 *  priced record hand nothing over and offer nothing (their price is not
 *  read here). */
export function handoverOf(record: RecordRead | null | undefined): { forSale: HandoverPrice | null; downloadable: boolean } {
  if (!record?.whole) return { forSale: null, downloadable: false };
  return { forSale: record.forSale ?? null, downloadable: recordDownloadsAvailable(record) };
}

/** The door's own word on the hand-over: closed while it is for sale, or
 *  while the door says locked (an older backend's answer), price or not. */
export function handoverClosed(block: unknown): boolean {
  return handoverLocked(block) || (block as { locked?: unknown } | null)?.locked === true;
}

export async function inkDoor(
  admin: Admin,
  shop: string,
  apiKey: string | null | undefined,
  proofId: string | null,
  keys: Promise<Jwks | null> | null = null,
) {
  const none = {
    record: null as RecordRead | null,
    offerLine: null as string | null,
    pending: false,
    paidPendingRecord: false,
    resumeUrl: null as string | null,
    downloadable: false,
    inHistory: false,
  };
  if (!proofId || !PROOF_ID.test(proofId)) return none;
  // No key yet (a fresh install): the record's public words, and no door.
  if (!apiKey) return { ...none, record: await readRecord(proofId, fetch, null) };
  await settleInkCharge(admin, shop, apiKey, proofId).catch(() =>
    console.error("[ink billing] settlement pending"),
  );
  const record = await readRecord(proofId, fetch, apiKey, keys);
  const saved = await chargeRef(shop, proofId).get();
  const savedRow = saved.exists ? saved.data() : null;
  const state = savedRow?.state;
  const { forSale, downloadable } = handoverOf(record);
  const inHistory = state === "minted";
  const paidPendingRecord =
    !downloadable && (state === "paid_pending_record" || state === "minted");
  const pending =
    !downloadable &&
    (state === "creating" || state === "pending" || paidPendingRecord);
  const offer = forSale ? recordOffer(forSale) : null;
  return {
    record,
    pending,
    paidPendingRecord,
    resumeUrl:
      state === "pending" && typeof savedRow?.confirmationUrl === "string"
        ? savedRow.confirmationUrl
        : null,
    downloadable,
    inHistory,
    offerLine:
      offer && !pending
        ? `Buy the record (${recordPriceWords(offer)} ${offer.currency})`
        : null,
  };
}

/** Only a POST may create a charge. Returns accept no charge/proof binding. */
export async function inkRecordAction(
  admin: Admin,
  shop: string,
  apiKey: string | null | undefined,
  form: FormData,
) {
  const proofId = String(form.get("proof_id") || "");
  const intent = String(form.get("intent") || "");
  const no = (note: string) => ({
    ok: false as const,
    note,
    confirmationUrl: null,
    download: null as unknown,
    pdfBase64: null as string | null,
    csvText: null as string | null,
    inspection: null as ReturnType<typeof inspectionFromAudit>,
    filename: null as string | null,
  });
  if (!apiKey || !PROOF_ID.test(proofId))
    return no("The record is unavailable. Refresh and try again.");
  // The merchant audit can be viewable before purchase. Only the export door
  // authorizes handing over files; this also covers genuinely free records.
  // What the intent needs is read side by side, each with its own time: the
  // export alone took 14 s for a busy record, and the three reads used to
  // follow one another (2026-09-24).
  const files = ["download", "pdf"].includes(intent);
  const [bundle, audit, opens, proof]: any[] = await Promise.all([
    files ? merchantRead(apiKey, `proofs/${proofId}/export`, fetch, EXPORT_READ_TIMEOUT_MS) : null,
    files || intent === "inspect" ? merchantRead(apiKey, `proofs/${proofId}/audit`, fetch, RECORD_READ_TIMEOUT_MS) : null,
    intent === "pdf" || intent === "inspect" ? merchantRead(apiKey, `proofs/${proofId}/opens`) : null,
    // The carrier's scans for the PDF (the merchant's proof door serves the
    // journey; the audit does not). A failed read leaves the scans out.
    intent === "pdf" || intent === "inspect" ? merchantRead(apiKey, `proofs/${proofId}`, fetch, RECORD_READ_TIMEOUT_MS).catch(() => null) : null,
  ]);
  // Shopify's payment facts beside the record (order-payment-facts.server.ts):
  // read with the order scope the app holds and pushed before the record is
  // read again, so the texts and the next PDF carry them. Fail-open.
  if ((intent === "pdf" || intent === "inspect") && proof?.proof_id === proofId && proof.order_id) {
    const facts = await readOrderPaymentFacts(admin as never, proof.order_id).catch(() => null);
    if (facts && (await pushOrderPaymentFacts(apiKey, proofId, facts)) && audit?.summary) audit.summary.payment_facts = facts;
  }
  if (files) {
    if (
      bundle?.manifest?.proof_id !== proofId ||
      !bundle.files ||
      typeof bundle.files !== "object" ||
      Array.isArray(bundle.files)
    )
      return no("Downloads are unavailable. Check record access and try again.");
  }
  if (intent === "download") {
    // The signed JSON is the hand-over itself: never while it is for sale —
    // the export door must answer for this record (above), and the audit's
    // record block must say the hand-over is the merchant's.
    if (audit?.proof_id !== proofId || handoverClosed(audit?.record))
      return no("The record is unavailable. Check record access and try again.");
    return {
      ok: true as const,
      note: null,
      confirmationUrl: null,
      download: bundle as unknown,
      pdfBase64: null,
      csvText: null,
      inspection: null,
      filename: `ink-record-${proofId}.json`,
    };
  }
  if (intent === "pdf" || intent === "inspect") {
    const record = recordFromBody(audit);
    if (audit?.proof_id !== proofId || audit?.audience !== "merchant" || !record || record.locked)
      return no("The record is unavailable. Check record access and try again.");
    // On screen is not the hand-over; the files are (orchestrator, relaying
    // Sam's ruling, 2026-09-23): the merchant inspects the whole record —
    // events, hashes, signatures — before buying. The PDF and the CSV are
    // files, so they wait for the hand-over like the signed JSON.
    if (intent !== "inspect" && handoverClosed(audit?.record))
      return no("The record is unavailable. Check record access and try again.");
    const inspection = inspectionFromAudit(audit, opens);
    if (!inspection || inspection.proofId !== proofId) return no("The record is unavailable. Try again.");
    if (intent === "inspect") return {
      ok: true as const, note: null, confirmationUrl: null, download: null as unknown,
      pdfBase64: null, csvText: null, inspection, filename: null,
    };
    const journey = proof?.proof_id === proofId ? proof.carrier_journey ?? null : null;
    const pdf = buildInkRecordPdf(audit, record, inspection, { journey });
    return {
      ok: true as const,
      note: null,
      confirmationUrl: null,
      download: null as unknown,
      pdfBase64: Buffer.from(pdf).toString("base64"),
      csvText: null,
      inspection: null,
      filename: `ink-record-${proofId}.pdf`,
    };
  }
  if (intent !== "buy") return no("Unknown action.");
  await settleInkCharge(admin, shop, apiKey, proofId).catch(() =>
    console.error("[ink billing] settlement pending"),
  );
  const record = await readRecord(proofId, fetch, apiKey);
  const { forSale, downloadable } = handoverOf(record);
  if (downloadable)
    return no("This record is already available. Refresh to download it.");
  const ref = chargeRef(shop, proofId);
  const existing = await ref.get();
  if (["paid_pending_record", "minted"].includes(existing.data()?.state))
    return no(
      "Shopify approved the charge, but the record is not available yet. Check record access or contact support.",
    );
  if (existing.data()?.state === "creating")
    return no(
      "The charge status could not be confirmed. Contact support before trying again.",
    );
  if (existing.data()?.state === "pending")
    return no(
      "A Shopify approval is already in progress. Check payment status before trying again.",
    );
  const offer = forSale ? recordOffer(forSale) : null;
  if (!offer) return no("This record is not available to purchase.");
  const appKey = process.env.SHOPIFY_API_KEY;
  if (!appKey) return no("Billing is unavailable. Try again later.");
  const reserved = await firestore.runTransaction(async (tx) => {
    const previous = await tx.get(ref);
    const state = previous.exists ? previous.data()?.state : null;
    if (state && !RESERVABLE.includes(state)) return false;
    tx.set(ref, {
      shop,
      proofId,
      orderName: record!.summary.order_number || null,
      state: "creating",
      ...offer,
      test: process.env.RECORD_PURCHASE_TEST === "true",
      createdAt: new Date().toISOString(),
    });
    return true;
  });
  if (!reserved)
    return no("A payment is already in progress. Refresh to check its status.");
  // An uncertain network result remains reserved. Retrying a create could bill twice.
  try {
    const charge = await createRecordCharge(admin, {
      orderName: record!.summary.order_number || proofId,
      price: offer,
      returnUrl: recordReturnUrl({
        shop,
        apiKey: appKey,
        proofId,
        returnTo: "/app/ink/records",
      }),
    });
    await ref.update({
      chargeId: charge.chargeId,
      confirmationUrl: charge.confirmationUrl,
      state: "pending",
    });
    return {
      ok: true as const,
      note: null,
      confirmationUrl: charge.confirmationUrl,
      download: null as unknown,
      pdfBase64: null,
      csvText: null,
      inspection: null,
      filename: null,
    };
  } catch (err) {
    // Shopify said no and created nothing: release the reservation and say
    // Shopify's reason (PLACEHOLDER wording). Anything else stays reserved —
    // a retried create could bill twice — until the heal above asks Shopify.
    if (err instanceof RecordChargeRefused) {
      await ref.update({ state: "refused", refusal: err.shopifySays, refusedAt: new Date().toISOString() });
      console.error(`[ink billing] ${shop}: Shopify refused the record charge: ${err.shopifySays}`);
      return no(`Shopify refused the charge: ${err.shopifySays}`);
    }
    return no(
      "The payment status could not be confirmed. Contact support before trying again.",
    );
  }
}
