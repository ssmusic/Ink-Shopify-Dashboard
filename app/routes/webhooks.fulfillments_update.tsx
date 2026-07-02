import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { NotificationService } from "../services/notifications.server";
import { NFSService } from "../services/nfs.server";
import firestore from "../firestore.server";
import { findMerchantDoc } from "../services/merchant-doc.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("\n📦 ================================================");
  console.log("📦 WEBHOOK RECEIVED: FULFILLMENTS_UPDATE");

  try {
    const { payload, shop, topic, admin } = await authenticate.webhook(request);

    // admin can be undefined for webhooks that don't carry an admin context
    if (!admin) {
      console.log(`📦 No admin context available for this webhook delivery. Exiting.`);
      console.log("📦 ================================================\n");
      return new Response("OK", { status: 200 });
    }

    const fulfillment = payload as any;
    const shipmentStatus = fulfillment.shipment_status;
    const orderId = fulfillment.order_id;
    const orderGid = `gid://shopify/Order/${orderId}`;

    console.log(`📦 Store: ${shop}`);
    console.log(`📦 Order ID: ${orderId}`);
    console.log(`📦 Shipment Status: ${shipmentStatus || "None/Unknown"}`);

    // If it's not one of our targeted statuses, we ignore it.
    if (shipmentStatus !== "out_for_delivery" && shipmentStatus !== "delivered") {
      console.log(`📦 Status is not actionable for notifications. Exiting.`);
      console.log("📦 ================================================\n");
      return new Response("OK", { status: 200 });
    }

    // 1. Fetch the Order to check if it's an INK order and get customer info
    const orderQuery = `#graphql
      query GetOrderForFulfillmentEvent($id: ID!) {
        order(id: $id) {
          name
          tags
          customer {
            email
            phone
            firstName
          }
          proofMetafield: metafield(namespace: "ink", key: "proof_reference") { value }
        }
      }
    `;

    console.log(`📦 Querying Shopify for Order details...`);
    const orderData = await admin.graphql(orderQuery, { variables: { id: orderGid } });
    const orderJson = await orderData.json();
    const order = orderJson.data?.order;

    if (!order) {
      console.log(`❌ Order not found in Shopify. Exiting.`);
      return new Response("OK", { status: 200 });
    }

    // Is it an INK order? The proof_reference metafield is the enrollment
    // marker — the old exact-tag check (`tags.includes("INK")`) failed on
    // every real enrollment, which tags orders "INK-Verified-Delivery", so
    // delivered events were silently skipped (Phase-1 rehearsal finding #4,
    // order #1015, 2026-07-02).
    if (!order.proofMetafield?.value) {
      console.log(`ℹ️ Order ${order.name} has no ink.proof_reference — not an enrolled order. Skipping.`);
      return new Response("OK", { status: 200 });
    }

    // 2. Fetch Merchant Notification Settings — convention-proof resolver.
    //    The old shopDomain-only query silently exited here on shop/shop_domain
    //    docs, which meant REAL CARRIER DELIVERIES never marked proofs
    //    delivered on those shops (Phase-1 rehearsal finding, 2026-07-02).
    console.log(`📦 Fetching Merchant Settings for ${shop}...`);
    const merchantHit = await findMerchantDoc(firestore, shop);

    if (!merchantHit) {
      console.log(`⚠️ No merchant document found for ${shop}. Exiting.`);
      return new Response("OK", { status: 200 });
    }

    const merchantData = merchantHit.data;
    const settings = merchantData.notification_settings;
    const merchantName = merchantData.shopName || shop;

    // ── Mark the proof DELIVERED at the REAL carrier-delivered moment. This is
    // now the authoritative delivered_at (orders/fulfilled no longer marks at
    // ship time). Runs BEFORE the notification-settings gate so delivery is
    // recorded even for merchants with no notifications configured. Best-effort:
    // a failure must never block the notification or the 200. ──
    if (shipmentStatus === "delivered" && order.proofMetafield?.value) {
      const merchantApiKey = merchantData.ink_api_key;
      if (merchantApiKey) {
        try {
          const deliveredAt = fulfillment.updated_at || new Date().toISOString();
          await NFSService.markDelivered(order.proofMetafield.value, merchantApiKey, {
            delivered_at: deliveredAt,
            carrier: fulfillment.tracking_company || undefined,
          });
          console.log(`✅ Marked proof ${order.proofMetafield.value} delivered at REAL carrier delivery (${deliveredAt}).`);
        } catch (e: any) {
          console.error(`❌ mark-delivered failed (non-fatal):`, e?.message);
        }
      } else {
        console.log(`⚠️ No ink_api_key for ${shop}; cannot mark proof delivered.`);
      }

      // The ARRIVAL email belongs to this moment — the carrier said
      // delivered — not to page-open (api.verify), which used to claim
      // arrival whenever it fired. Gated + deduped inside; never blocks
      // the 200. Sent even if our mark-delivered write hiccuped above:
      // the carrier event, not our ledger, makes the claim true.
      try {
        const { sendStateEmailOnce } = await import("../services/state-email.server");
        await sendStateEmailOnce({
          state: "delivered",
          admin,
          shop,
          orderGid,
          orderName: order.name,
          customerEmail: order.customer?.email,
          customerName: order.customer?.firstName || "Customer",
          proofId: order.proofMetafield.value,
          merchantData,
        });
      } catch (e: any) {
        console.error(`❌ arrival email failed (non-fatal):`, e?.message);
      }
    }

    if (!settings) {
      console.log(`⚠️ Merchant has no Notification Settings configured. Exiting.`);
      return new Response("OK", { status: 200 });
    }

    // 3. Map to our NotificationType
    let notificationType: "outForDelivery" | "delivered" | null = null;
    if (shipmentStatus === "out_for_delivery") notificationType = "outForDelivery";
    if (shipmentStatus === "delivered") notificationType = "delivered";

    if (notificationType) {
      const customerEmail = order.customer?.email;
      const customerPhone = order.customer?.phone;
      const customerName = order.customer?.firstName || "Customer";
      const verifyUrl = order.proofMetafield?.value ? `https://shop.in.ink/t/${order.proofMetafield.value}` : undefined;

      console.log(`\n📨 Dispatching immediate [${notificationType}] notification via NotificationService...`);
      console.log(`   - To: ${customerName}`);
      console.log(`   - Phone: ${customerPhone}`);
      
      const sent = await NotificationService.dispatch({
        type: notificationType,
        toEmail: customerEmail,
        toPhone: customerPhone,
        customerName: customerName,
        orderName: order.name,
        merchantName: merchantName,
        verifyUrl: verifyUrl,
      }, settings);

      if (sent) {
        console.log(`✅ Successfully dispatched ${notificationType} notification.`);
      } else {
        console.log(`ℹ️ Notification skipped or failed (perhaps channel disabled).`);
      }
    }

  } catch (error: any) {
    console.error("❌ Error processing FULFILLMENTS_UPDATE webhook:", error.message);
  }

  console.log("📦 Webhook processing complete.");
  console.log("📦 ================================================\n");
  
  return new Response("OK", { status: 200 });
};
