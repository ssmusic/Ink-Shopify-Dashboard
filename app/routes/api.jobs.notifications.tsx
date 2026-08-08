import { type LoaderFunctionArgs } from "react-router";
import firestore from "../firestore.server";
import { NotificationService, type NotificationType } from "../services/notifications.server";
import { findMerchantDoc } from "../services/merchant-doc.server";
import { INK_NAMESPACE } from "../utils/metafields.server";

/**
 * Background Polling Job: Notifications Worker
 * URL: GET /api/jobs/notifications
 *
 * NOTHING SCHEDULES THIS YET. There is no cron, Cloud Scheduler entry, or
 * workflow calling it in either repo (verified 2026-08-07) — so the
 * return-window reminders below have never sent, and the Notifications page
 * marks them "coming soon" for exactly that reason. Standing it up is its own
 * build; two things must be fixed in the same breath:
 *   · the reminder anchor. alanReturnExpiresAt is the proof's
 *     interaction_window_closed_at = delivered + INTERACTION_WINDOW_HOURS
 *     (48h, deliveryWindow.js) — NOT the merchant's return window. So
 *     "7 days before close" resolves to delivered−120h, always in the past.
 *     It must anchor on delivered_at + merchant.return_window_days.
 *   · verify_url. The backend's GET /api/proofs/:token does not emit that
 *     key, so alanVerifyUrl is undefined and every reminder would carry a
 *     broken link.
 * Tap reminders (hours4/24/48) were removed 2026-08-07 — NFC-era relics.
 */

// Cron auth — FAIL CLOSED. This used to default to the literal
// "cron_dev_secret": a published constant guarding a route that scans every
// store and messages their customers. No env, no run.
const CRON_SECRET = process.env.CRON_SECRET || "";

function isAuthorized(request: Request) {
  if (!CRON_SECRET) {
    console.warn("[CRON - Notifications] refused: CRON_SECRET is not set.");
    return false;
  }
  const url = new URL(request.url);
  const authHeader = request.headers.get("Authorization");
  if (url.searchParams.get("secret") === CRON_SECRET) return true;
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;
  return false;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  console.log("\n🔄 [CRON - Notifications] Starting scheduled polling iteration...");

  const sessionSnapshot = await firestore.collection("shopify_sessions").where("isOnline", "==", false).get();
  if (sessionSnapshot.empty) {
    console.log("No active offline Shopify sessions found.");
    return new Response(JSON.stringify({ triggered: 0, status: "no_sessions" }), { headers: { "Content-Type": "application/json" } });
  }

  let totalDispatched = 0;

  for (const sessionDoc of sessionSnapshot.docs) {
    const session = sessionDoc.data();
    if (!session.accessToken) continue;

    console.log(`\n🏪 [Store: ${session.shop}] Checking for pending notifications...`);

    // Fetch Merchant Notification Settings — findMerchantDoc, not
    // where("shopDomain"==…). That query matches neither the embed's own
    // doc-id shape nor the backend's snake_case shop_domain, so this job
    // skipped every store it ever scanned (Bible §17.2, fourth appearance).
    const merchantHit = await findMerchantDoc(firestore, session.shop);
    const merchantData = merchantHit?.data ?? null;
    const settings = merchantData?.notification_settings ?? null;
    const merchantName = merchantData?.shopName || session.shop;

    if (!settings) {
      console.log(`⚠️ Disabled: Merchant ${session.shop} has no notification settings configured.`);
      continue;
    }

    // 1. Fetch all orders tagged with INK that are fulfilled
    // We fetch their metafields to check our internal Notification Ledger
    const query = `#graphql
      query GetActiveInkOrders {
        orders(first: 50, query: "tag:INK AND fulfillment_status:shipped") {
          edges {
            node {
              id
              name
              email
              phone
              customer {
                firstName
                email
                phone
              }
              statusMetafield: metafield(namespace: "${INK_NAMESPACE}", key: "verification_status") { value }
              proofMetafield: metafield(namespace: "${INK_NAMESPACE}", key: "proof_reference") { value }
              ledgerMetafield: metafield(namespace: "${INK_NAMESPACE}", key: "notification_ledger") { value }
            }
          }
        }
      }
    `;

    try {
      const response = await fetch(`https://${session.shop}/admin/api/2025-10/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({ query }),
      });

      const json = await response.json();
      const orders = json.data?.orders?.edges || [];

      if (orders.length === 0) {
         console.log(`   No active shipped INK orders found.`);
         continue;
      }

      for (const edge of orders) {
        const order = edge.node;
        const proofRef = order.proofMetafield?.value;
        const status = order.statusMetafield?.value;
        const ledgerValue = order.ledgerMetafield?.value;
        const ledger = ledgerValue ? JSON.parse(ledgerValue) : {};

        // If verified, we stop all tap reminders (but check return warnings if applicable)
        const isVerified = status === "verified" || status === "valid";

        if (!proofRef) continue;

        // Fetch the absolute freshest state from Alan's DB via API
        const ALAN_API = process.env.INK_API_URL || "https://us-central1-inink-c76d3.cloudfunctions.net/api";
        let alanVerifyUrl = "";
        let alanDeliveredAt: Date | null = null;
        let alanReturnExpiresAt: Date | null = null;

        try {
          // You need the API Key of the merchant to call Alan's API safely.
          // findMerchantDoc already picked the doc that CARRIES the key when
          // several matched — reuse its answer rather than re-reading one.
          const apiKey = merchantHit?.apiKey;
          if (!apiKey) continue;

          // GET /api/proofs/{proofRef}
          const alanResp = await fetch(`${ALAN_API}/proofs/${proofRef}`, {
            headers: { "Authorization": `Bearer ${apiKey}` }
          });
          
          if (alanResp.ok) {
            const alanData = await alanResp.json();
            alanVerifyUrl = alanData.verify_url;
            if (alanData.delivered_at) alanDeliveredAt = new Date(alanData.delivered_at);
            if (alanData.interaction_window_closed_at) alanReturnExpiresAt = new Date(alanData.interaction_window_closed_at);
          }
        } catch (e) {
          console.warn(`Could not sync Alan state for ${proofRef}`);
        }

        // --- MATH AND DISPATCH CALCULATION ---
        const now = new Date();
        const customerEmail = order.customer?.email || order.email;
        const customerPhone = order.customer?.phone || order.phone;
        const customerName = order.customer?.firstName || "Customer";
        const returnWindowDays = settings.returnWindow ? parseInt(settings.returnWindow) : 30;

        const dispatchIfReady = async (type: NotificationType, timeRequired: Date) => {
          if (ledger[type]) return; // Already sent! Prevent spam.
          if (now >= timeRequired) {
            console.log(`   ⏰ Triggering [${type}] for ${order.name}`);
            const sent = await NotificationService.dispatch({
              type,
              toEmail: customerEmail,
              toPhone: customerPhone,
              customerName,
              orderName: order.name,
              merchantName,
              verifyUrl: alanVerifyUrl,
              returnWindowDays
            }, settings, merchantData);

            if (sent) {
              ledger[type] = new Date().toISOString();
              // Update Shopify Ledger Metafield
              const mutation = `#graphql
                mutation UpdateLedger($metafields: [MetafieldsSetInput!]!) {
                  metafieldsSet(metafields: $metafields) { userErrors { message } }
                }
              `;
              await fetch(`https://${session.shop}/admin/api/2025-10/graphql.json`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": session.accessToken },
                body: JSON.stringify({
                  query: mutation,
                  variables: {
                    metafields: [{
                      ownerId: order.id,
                      namespace: INK_NAMESPACE,
                      key: "notification_ledger",
                      type: "json",
                      value: JSON.stringify(ledger)
                    }]
                  }
                })
              });
              totalDispatched++;
            }
          }
        };

        // Tap reminders (4h/24h/48h after delivery) lived here until
        // 2026-08-07. They were written for the NFC-tag era — "tap" meant
        // touching a chip — and nothing ever scheduled them, so not one was
        // sent. Removed with their toggles and their NotificationTypes;
        // `git log -S "hours4"` has the original if it is ever wanted back.

        // If VERIFIED, check RETURN WARNING Reminders
        if (isVerified && alanReturnExpiresAt) {
          const days7Time = new Date(alanReturnExpiresAt.getTime() - 7 * 24 * 60 * 60 * 1000);
          const hours48PriorTime = new Date(alanReturnExpiresAt.getTime() - 48 * 60 * 60 * 1000);

          await dispatchIfReady("return7d", days7Time);
          await dispatchIfReady("return48h", hours48PriorTime);
        }
      }
    } catch (e: any) {
      console.error(`❌ Error scanning store ${session.shop}:`, e.message);
    }
  }

  console.log(`\n✅ [CRON - Notifications] Iteration complete. Dispatched ${totalDispatched} alerts.`);
  return new Response(JSON.stringify({ success: true, dispatched: totalDispatched }), { headers: { "Content-Type": "application/json" } });
};
