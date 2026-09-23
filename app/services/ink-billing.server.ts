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
import { buildInkRecordCsv } from "./ink-record-csv.server";
import { inspectionFromAudit } from "../lib/ink-record-inspection";
import { merchantRead, PROOF_ID } from "./ink-reader.server";
import {
  createRecordCharge,
  readRecordCharge,
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

export async function settleInkCharge(
  admin: Admin,
  shop: string,
  apiKey: string,
  proofId: string,
) {
  const ref = chargeRef(shop, proofId);
  const snap = await ref.get();
  const row = snap.exists ? snap.data() : null;
  if (
    !row ||
    row.state === "minted" ||
    row.state === "declined" ||
    row.state === "expired"
  )
    return;
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
  const forSale = record.forSale ?? null;
  return { forSale, downloadable: forSale === null };
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
        ? `Get the record (${recordPriceWords(offer)} ${offer.currency})`
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
  if (intent === "download") {
    // The signed JSON is the hand-over itself: never while it is for sale.
    const audit = await merchantRead(apiKey, `proofs/${proofId}/audit`);
    if (audit?.proof_id !== proofId || handoverClosed(audit?.record))
      return no("The record is unavailable. Check record access and try again.");
    const bundle = await merchantRead(apiKey, `proofs/${proofId}/export`);
    if (!bundle?.manifest || !bundle?.files)
      return no("The record could not be downloaded. Try again.");
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
  if (intent === "pdf" || intent === "csv" || intent === "inspect") {
    const audit = await merchantRead(apiKey, `proofs/${proofId}/audit`);
    const record = recordFromBody(audit);
    if (audit?.proof_id !== proofId || audit?.audience !== "merchant" || !record || record.locked || handoverClosed(audit?.record))
      return no("The record is unavailable. Check record access and try again.");
    const opens = await merchantRead(apiKey, `proofs/${proofId}/opens`);
    const inspection = inspectionFromAudit(audit, opens);
    if (!inspection || inspection.proofId !== proofId) return no("The record is unavailable. Try again.");
    if (intent === "inspect") return {
      ok: true as const, note: null, confirmationUrl: null, download: null as unknown,
      pdfBase64: null, csvText: null, inspection, filename: null,
    };
    if (intent === "csv") return {
      ok: true as const, note: null, confirmationUrl: null, download: null as unknown,
      pdfBase64: null, csvText: buildInkRecordCsv(record, inspection), inspection: null,
      filename: `ink-record-${proofId}.csv`,
    };
    const pdf = buildInkRecordPdf(audit, record, inspection);
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
    if (state && !["declined", "expired"].includes(state)) return false;
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
        returnTo: "/app/ink?view=records",
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
  } catch {
    return no(
      "The payment status could not be confirmed. Contact support before trying again.",
    );
  }
}
