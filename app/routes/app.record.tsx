import { isInk } from "../services/app-flavor.server";
import { inkRecordAction, settleInkCharge } from "../services/ink-billing.server";
import { data } from "react-router";
// /app/record — THE RECORD'S DOOR, both flavors (services/record-door.server.ts).
//
//   POST intent=buy      Only Ink can create a Shopify one-time charge. The
//                        Ritualist includes its record in the plan and refuses
//                        this intent even if a purchase flag is enabled.
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
import { setRecordPurchaseOutcome, type RecordPurchase } from "../services/ink-api.server";
import { recordChargeGid, safeReturnTo } from "../services/record-door.server";
import { rememberRecordCharge, settleRecordCharges } from "../services/record-charges.server";
import { ritualistApiKey } from "../services/ritualist-rows.server";
import { ritualistActionPlanError } from "../services/ritualist-action-plan.server";

const PROOF_ID = /^proof_[0-9a-f]{24}$/;
const OUTCOMES: RecordPurchase["outcome"][] = ["open", "won", "lost", "unknown"];
/** What the Ritualist's included record answers here: the inspection and the
 *  three files. Nothing that buys. */
const INCLUDED_RECORD_INTENTS = new Set(["inspect", "pdf", "download"]);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  const url = new URL(request.url);
  if (isInk()) {
    const proofId = url.searchParams.get("proof_id") || "";
    const view = await readInkMerchant(session.shop);
    if (PROOF_ID.test(proofId) && view.doc?.ink_api_key) await settleInkCharge(admin, session.shop, view.doc.ink_api_key, proofId).catch(() => console.error("[ink billing] return settlement pending"));
    return redirect("/app/ink/records");
  }

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
  // ink's door is services/ink-billing.server.ts — except "Did you win?", the
  // merchant's word on a bought record, which is the same for both flavors.
  if (isInk() && intent !== "outcome") {
    const view = await readInkMerchant(session.shop);
    const result = await inkRecordAction(admin, session.shop, view.doc?.ink_api_key, form).catch(() => ({ ok: false, note: "The record is unavailable. Try again.", confirmationUrl: null, download: null, filename: null }));
    return data(result, { headers: { "Cache-Control": "private, no-store" } });
  }

  // THE RITUALIST'S RECORD IS INCLUDED: its Shipments row draws ink's panel
  // (components/OrderExpandedRow.tsx), whose inspection and downloads ask this
  // door. They are answered by the doors ink's Records library asks — the
  // merchant audit door for the inspection, the export door for the PDF, the
  // signed JSON (services/ink-billing.server.ts inkRecordAction) —
  // with the merchant's own key. The backend answers a Ritualist merchant's
  // record whole and its export without a purchase, so nothing here is sold
  // and no purchase is asked for. Only these three words take this path;
  // a purchase is refused below.
  if (INCLUDED_RECORD_INTENTS.has(intent)) {
    const planError = await ritualistActionPlanError(admin);
    if (planError) return data({ ok: false, note: planError, confirmationUrl: null, download: null, filename: null }, { headers: { "Cache-Control": "private, no-store" } });
    const apiKey = await ritualistApiKey(session.shop);
    const result = await inkRecordAction(admin, session.shop, apiKey, form).catch(() => ({ ok: false, note: "The record is unavailable. Try again.", confirmationUrl: null, download: null, filename: null }));
    return data(result, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (intent === "buy") {
    // The Ritualist includes the record in its plan. Never create a one-time
    // Shopify charge there, even if a purchase flag is enabled by mistake.
    return { ok: false, intent, confirmationUrl: null, note: "The record is included with your plan." };
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
