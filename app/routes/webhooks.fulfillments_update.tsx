import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { NotificationService } from "../services/notifications.server";
import { NFSService } from "../services/nfs.server";
import firestore from "../firestore.server";

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

    // Is it an INK order?
    if (!order.tags.includes("INK")) {
      console.log(`ℹ️ Order ${order.name} is not tagged with INK. Skipping.`);
      return new Response("OK", { status: 200 });
    }

    // 2. Fetch the Merchant doc (ink_api_key + notification settings) from Firestore
    console.log(`📦 Fetching Merchant for ${shop}...`);
    const merchantSnap = await firestore.collection("merchants").where("shopDomain", "==", shop).limit(1).get();

    if (merchantSnap.empty) {
      console.log(`⚠️ No merchant document found for ${shop}. Exiting.`);
      return new Response("OK", { status: 200 });
    }

    const merchantDoc = merchantSnap.docs[0].data();
    const merchantApiKey: string | null = merchantDoc.ink_api_key || null;
    const settings = merchantDoc.notification_settings;
    const merchantName = merchantDoc.shopName || shop;
    const proofReference: string | null = order.proofMetafield?.value || null;

    // 2a. SOURCE OF TRUTH for delivery. When Shopify's carrier tracking reports
    //     shipment_status === "delivered", stamp delivered_at on the proof. This
    //     replaces the premature stamp that orders/fulfilled (ship time) used to
    //     do. The return window starts here, sourced from Shopify (which already
    //     aggregates every carrier). markProofDelivered is idempotent
    //     (first-write-wins), so a later Shippo-tracker event is a safe no-op.
    if (shipmentStatus === "delivered" && proofReference && merchantApiKey) {
      try {
        const deliveredAt = fulfillment.updated_at || new Date().toISOString();
        const carrier = fulfillment.tracking_company || undefined;
        const trackingNumber =
          fulfillment.tracking_number || fulfillment.tracking_numbers?.[0] || undefined;
        const trackingUrl =
          fulfillment.tracking_url || fulfillment.tracking_urls?.[0] || undefined;

        await NFSService.markDelivered(proofReference, merchantApiKey, {
          delivered_at: deliveredAt,
          carrier,
          tracking_number: trackingNumber,
          tracking_url: trackingUrl,
        });
        console.log(`✅ delivered_at stamped from Shopify DELIVERED for proof ${proofReference}`);
      } catch (deliveryErr: any) {
        // Best-effort: a delivery-mark failure must not block notifications or
        // cause Shopify to retry the whole webhook.
        console.error(`❌ Failed to stamp delivered_at for ${proofReference}:`, deliveryErr.message);
      }
    } else if (shipmentStatus === "delivered" && proofReference && !merchantApiKey) {
      console.log(`⚠️ DELIVERED for ${shop} but no ink_api_key on merchant — cannot stamp delivered_at.`);
    }

    if (!settings) {
      console.log(`ℹ️ Merchant has no Notification Settings configured. Delivery handled; skipping notification.`);
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
