// /app/record — THE RECORD'S DOOR, both flavors (services/record-door.server.ts).
//
//   POST intent=buy      the press on "Get the record — $X": re-reads the
//                        price and the kill switch, creates Shopify's
//                        one-time charge, answers its confirmation URL (the
//                        screen opens it at the top frame — Shopify's
//                        approval screen). Nothing is billed until the
//                        merchant approves there.
//   GET  ?charge_id=…    Shopify's return after the approval screen, framed
//                        by the admin. The charge is remembered (if the press
//                        did not already) and this shop's pending charges are
//                        SETTLED: each is read back from Shopify and ONLY an
//                        ACTIVE one mints its purchase (POST /admin/purchases);
//                        then the merchant is sent back where they pressed. The
//                        same settle runs on every screen that shows the door,
//                        so a paid charge mints even if this return is lost.
//   POST intent=outcome  "Did you win?" — the merchant's word, recorded
//                        (open · won · lost · unknown). Neither app can read
//                        Shopify's dispute status (no
//                        read_shopify_payments_disputes), so this is the
//                        only source, and the backend says so on the row.

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { readInkMerchant } from "../services/ink-merchant.server";
import { readRecordPrice, setRecordPurchaseOutcome, type RecordPurchase } from "../services/ink-api.server";
import { createRecordCharge, recordChargeGid, recordOffer, recordReturnUrl, safeReturnTo } from "../services/record-door.server";
import { rememberRecordCharge, settleRecordCharges } from "../services/record-charges.server";

const PROOF_ID = /^proof_[0-9a-f]{24}$/;
const OUTCOMES: RecordPurchase["outcome"][] = ["open", "won", "lost", "unknown"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("return_to"));
  const proofId = url.searchParams.get("proof_id") ?? "";
  const gid = recordChargeGid(url.searchParams.get("charge_id"));
  if (PROOF_ID.test(proofId) && gid) await rememberRecordCharge(session.shop, proofId, gid);
  // The kill switch is NOT read here: a charge already approved is paid for.
  const view = await readInkMerchant(session.shop);
  const settled = await settleRecordCharges(admin, session.shop, view.shopId);
  console.log(`[record] return for ${session.shop}: minted ${settled.minted}, closed ${settled.closed}, waiting ${settled.waiting}`);
  return redirect(returnTo);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "buy") {
    const proofId = String(form.get("proof_id") || "");
    const orderName = String(form.get("order_name") || "").slice(0, 60) || proofId;
    const returnTo = safeReturnTo(form.get("return_to"));
    if (!PROOF_ID.test(proofId)) return { ok: false, intent, confirmationUrl: null, note: "No record for this order." }; // PLACEHOLDER
    const view = await readInkMerchant(session.shop);
    const offer = recordOffer(await readRecordPrice(view.shopId));
    if (!offer) return { ok: false, intent, confirmationUrl: null, note: "The record isn't for sale here." }; // PLACEHOLDER
    const apiKey = process.env.SHOPIFY_API_KEY;
    if (!apiKey) return { ok: false, intent, confirmationUrl: null, note: "The app has no address to come back to." }; // PLACEHOLDER
    try {
      const { confirmationUrl, chargeId } = await createRecordCharge(admin, {
        orderName,
        price: offer,
        returnUrl: recordReturnUrl({ shop: session.shop, apiKey, proofId, returnTo }),
      });
      await rememberRecordCharge(session.shop, proofId, chargeId);
      return { ok: true, intent, confirmationUrl, note: null as string | null };
    } catch (err) {
      console.error("[record] charge create failed:", err);
      return { ok: false, intent, confirmationUrl: null, note: "Shopify didn't take the charge. Try again." }; // PLACEHOLDER
    }
  }

  if (intent === "outcome") {
    const purchaseId = String(form.get("purchase_id") || "");
    const outcome = String(form.get("outcome") || "") as RecordPurchase["outcome"];
    if (!/^pur_\d{1,20}$/.test(purchaseId) || !OUTCOMES.includes(outcome)) {
      return { ok: false, intent, confirmationUrl: null, note: "Unknown answer." }; // PLACEHOLDER
    }
    const view = await readInkMerchant(session.shop);
    if (!view.shopId) return { ok: false, intent, confirmationUrl: null, note: "This store is still being set up." }; // PLACEHOLDER
    try {
      await setRecordPurchaseOutcome(purchaseId, view.shopId, outcome);
      return { ok: true, intent, confirmationUrl: null, note: null };
    } catch (err) {
      console.error("[record] outcome refused:", err);
      return { ok: false, intent, confirmationUrl: null, note: "Couldn't save that. Try again." }; // PLACEHOLDER
    }
  }

  return { ok: false, intent, confirmationUrl: null, note: "Unknown action." }; // PLACEHOLDER
};
