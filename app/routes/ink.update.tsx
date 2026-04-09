import { type ActionFunctionArgs } from "react-router";
import crypto from "crypto";
import { INK_NAMESPACE } from "../utils/metafields.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-INK-Signature, Authorization, Accept",
};

// Handle OPTIONS preflight
export const loader = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

/**
 * Webhook endpoint for Alan's NFS system
 * Receives verification events after /verify completes
 * 
 * NOTE: No local database update - Alan's API is the single source of truth
 * We only update Shopify Order metafields for display purposes
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("\n🔔 =================================================");
  console.log("🔔 WEBHOOK /ink/update RECEIVED");
  console.log("🔔 Time:", new Date().toISOString());
  console.log("🔔 Method:", request.method);
  console.log("🔔 =================================================\n");

  // Get offline session from Firestore (for Shopify auth)
  const { getOfflineSession } = await import("../session-utils.server");

  try {
    // 1. Read raw body for HMAC verification
    const rawBody = await request.text();
    console.log("📥 Raw webhook body:", rawBody);

    // 2. Verify HMAC signature
    const signature = request.headers.get("X-INK-Signature");
    const HMAC_SECRET = process.env.NFS_HMAC_SECRET;

    if (!HMAC_SECRET) {
      console.error("❌ NFS_HMAC_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    if (!signature) {
      console.error("❌ Missing X-INK-Signature header");
      return new Response(
        JSON.stringify({ error: "Missing signature" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Verify HMAC
    const expectedSignature = crypto
      .createHmac("sha256", HMAC_SECRET)
      .update(rawBody)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("❌ Invalid HMAC signature");
      console.error("Expected:", expectedSignature);
      console.error("Received:", signature);
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    console.log("✅ HMAC signature verified");

    // 3. Parse webhook payload
    const payload = JSON.parse(rawBody);
    const {
      order_id,
      status,
      delivery_gps,
      gps_verdict,
      proof_ref,
      timestamp,
      verify_url,
      device_info,
    } = payload;

    console.log("📦 Webhook data:", {
      order_id,
      status,
      gps_verdict,
      proof_ref,
    });

    if (!order_id || !status) {
      console.error("❌ Missing required fields in webhook");
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // NOTE: No local database update needed
    // Alan's API is the single source of truth for all proof data
    console.log("ℹ️ Skipping local DB update - Alan's API is source of truth");

    // 4. Update Shopify order metafields
    console.log("📝 Updating Shopify order metafields...");
    try {
      // Get ALL Shopify offline sessions from database since we don't know the exact shop
      const { default: firestore } = await import("../firestore.server");
      const sessionSnapshot = await firestore.collection("shopify_sessions").where("isOnline", "==", false).get();

      if (sessionSnapshot.empty) {
        console.error("❌ No offline sessions found");
        return new Response(
          JSON.stringify({ error: "No session available" }),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      const offlineSessions = sessionSnapshot.docs.map(doc => doc.data());
      
    // 5. Look for the order in Shopify across ALL merchants' stores
    let foundOrderGid: string | null = null;
    let targetSession: any = null;

    const rawOrderId = order_id ? order_id.replace(/\D/g, '') : '';
    console.log(`🔍 Attempting to locate order (Raw ID: ${rawOrderId}, Proof ID: ${proof_ref || 'None'})`);

    const adminGraphqlForSession = async (session: any, query: string, variables?: any) => {
      const response = await fetch(`https://${session.shop}/admin/api/2024-10/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });
      return response.json();
    };

    // PASS 1: Check direct ID (Most accurate, globally unique across Shopify)
    if (rawOrderId && rawOrderId.length > 10) { 
      const initialGid = `gid://shopify/Order/${rawOrderId}`;
      const checkOrderQuery = `#graphql
        query CheckOrder($id: ID!) {
          order(id: $id) { id }
        }
      `;
      for (const session of offlineSessions) {
        if (!session.accessToken) continue;
        const checkResult = await adminGraphqlForSession(session, checkOrderQuery, { id: initialGid });
        if (checkResult?.data?.order?.id) {
          foundOrderGid = checkResult.data.order.id;
          targetSession = session;
          console.log(`✅ Found order ${foundOrderGid} via direct ID in store ${session.shop}`);
          break;
        }
      }
    }

    // PASS 2: Check by proof_reference (Deterministic, but could conflict in test environments)
    if (!foundOrderGid && proof_ref) {
      const proofQuery = `#graphql
        query SearchOrderByProof($query: String!) {
          orders(first: 1, query: $query) {
            edges { node { id } }
          }
        }
      `;
      for (const session of offlineSessions) {
        if (!session.accessToken) continue;
        const proofResult = await adminGraphqlForSession(session, proofQuery, { query: `metafield.ink.proof_reference:${proof_ref}` });
        if (proofResult?.data?.orders?.edges?.length > 0) {
          foundOrderGid = proofResult.data.orders.edges[0].node.id;
          targetSession = session;
          console.log(`✅ Found order ${foundOrderGid} via proof_reference in store ${session.shop}`);
          break;
        }
      }
    }

    // PASS 3: Fallback search by name if it resembles a name
    if (!foundOrderGid && order_id && order_id.length <= 10) {
      const numericPart = order_id.replace(/\D/g, '');
      const nameQuery = `#graphql
        query FindOrderByName($query: String!) {
          orders(first: 2, query: $query) {
            edges { node { id } }
          }
        }
      `;
      for (const session of offlineSessions) {
        if (!session.accessToken) continue;
        const searchResult = await adminGraphqlForSession(session, nameQuery, { query: `name:${numericPart}` });
        if (searchResult?.data?.orders?.edges?.length > 0) {
          foundOrderGid = searchResult.data.orders.edges[0].node.id;
          targetSession = session;
          console.log(`✅ Found order via name search '${numericPart}' in store ${session.shop}`);
          break;
        }
        const searchResult2 = await adminGraphqlForSession(session, nameQuery, { query: `name:#${numericPart}` });
        if (searchResult2?.data?.orders?.edges?.length > 0) {
          foundOrderGid = searchResult2.data.orders.edges[0].node.id;
          targetSession = session;
          console.log(`✅ Found order via name search '#${numericPart}' in store ${session.shop}`);
          break;
        }
      }
    }
      if (!foundOrderGid || !targetSession) {
         console.error(`❌ Could not find order ${order_id} in ANY connected Shopify store.`);
         return new Response(
            JSON.stringify({ error: "Order not found in any connected store" }),
            { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
         );
      }

      let orderGid = foundOrderGid;

      // Re-create the adminGraphql wrapper for the correct target session so the rest of the code works
      const adminGraphql = async (query: string, variables?: any) => {
        const response = await fetch(`https://${targetSession.shop}/admin/api/2024-10/graphql.json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": targetSession.accessToken,
          },
          body: JSON.stringify({ query, variables }),
        });
        return response.json();
      };

      const metafields = [
        {
          ownerId: orderGid,
          namespace: INK_NAMESPACE,
          key: "verification_status",
          type: "single_line_text_field",
          value: status,
        },
        {
          ownerId: orderGid,
          namespace: INK_NAMESPACE,
          key: "gps_verdict",
          type: "single_line_text_field",
          value: gps_verdict || "unknown",
        },
        {
          ownerId: orderGid,
          namespace: INK_NAMESPACE,
          key: "delivery_timestamp",
          type: "single_line_text_field",
          value: timestamp || new Date().toISOString(),
        },
        {
          ownerId: orderGid,
          namespace: INK_NAMESPACE,
          key: "verify_url",
          type: "single_line_text_field",
          value: verify_url || "",
        },
      ];

      if (proof_ref) {
        metafields.push({
          ownerId: orderGid,
          namespace: INK_NAMESPACE,
          key: "proof_reference",
          type: "single_line_text_field",
          value: proof_ref,
        });
      }

      if (delivery_gps) {
        metafields.push({
          ownerId: orderGid,
          namespace: INK_NAMESPACE,
          key: "delivery_gps",
          type: "json",
          value: JSON.stringify(delivery_gps),
        });
      }

      if (device_info) {
        metafields.push({
          ownerId: orderGid,
          namespace: INK_NAMESPACE,
          key: "device_info",
          type: "single_line_text_field",
          value: device_info,
        });
      }

      const mutation = `
        mutation SetVerificationMetafields($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
              namespace
              key
              value
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const data = await adminGraphql(mutation, { metafields });

      if (data.data?.metafieldsSet?.userErrors?.length > 0) {
        console.error("⚠️ Shopify metafield errors:", data.data.metafieldsSet.userErrors);
      } else {
        console.log("✅ Shopify metafields updated successfully");
      }

      // --- SEND NOTIFICATIONS (Delivered / Verified) ---
      if ((status === "verified" && verify_url) || status === "delivered") {
        console.log("\n📨 ================================================");
        console.log(`📨 STARTING IMMEDIATE NOTIFICATION PROCESS [${status.toUpperCase()}]`);
        console.log("📨 Order GID:", orderGid);
        console.log("📨 Verify URL:", verify_url);
        console.log("📨 ================================================\n");
        
        try {
          // Fetch customer email from the order
          const orderQuery = `#graphql
            query GetOrderForNotification($id: ID!) {
              order(id: $id) {
                name
                customer {
                  email
                  phone
                  firstName
                }
              }
            }
          `;
          
          console.log("📨 Fetching order details for notification...");
          console.log("📨 GraphQL Query:", orderQuery);
          console.log("📨 Variables:", { id: orderGid });
          
          const orderData = await adminGraphql(orderQuery, { id: orderGid });
          
          console.log("📨 Shopify Response:", JSON.stringify(orderData, null, 2));
          
          if (orderData?.data?.order?.customer) {
            const customerEmail = orderData.data.order.customer.email;
            const customerPhone = orderData.data.order.customer.phone;
            const customerName = orderData.data.order.customer.firstName || "Customer";
            const orderName = orderData.data.order.name;
            
            console.log("✅ Order context found:");
            console.log("   - Order Name:", orderName);
            console.log("   - Customer Name:", customerName);
            console.log("   - Phone:", customerPhone);
            console.log("   - Email:", customerEmail);

            // Fetch Merchant Settings from Firestore
            const { default: firestore } = await import("../firestore.server");
            const settingsSnap = await firestore.collection("merchants").where("shopDomain", "==", targetSession.shop).limit(1).get();
            const merchantName = settingsSnap.empty ? targetSession.shop : (settingsSnap.docs[0].data().shopName || targetSession.shop);
            const settings = settingsSnap.empty ? null : settingsSnap.docs[0].data().notification_settings;

            if (!settings) {
               console.warn(`⚠️ No Notification Settings found for merchant ${targetSession.shop}. Skipping notifications.`);
            } else {
               const { NotificationService } = await import("../services/notifications.server");
               
               // Map Alan's status to our NotificationType
               let notificationType: any = null;
               if (status === "delivered") notificationType = "delivered";
               if (status === "verified") notificationType = "deliveryConfirmed";

               if (notificationType) {
                 console.log(`📨 Dispatching immediate [${notificationType}] notification via NotificationService...`);
                 
                 await NotificationService.dispatch({
                   type: notificationType,
                   toEmail: customerEmail,
                   toPhone: customerPhone,
                   customerName,
                   orderName,
                   merchantName,
                   verifyUrl: verify_url,
                   returnWindowDays: settings.returnWindow ? parseInt(settings.returnWindow) : 30
                 }, settings);
               }
            }
          } else {
            console.warn("⚠️ Order found but no customer context available");
            console.warn("⚠️ Order data:", JSON.stringify(orderData, null, 2));
          }
        } catch (notifError: any) {
          console.error("❌ Failed to send notification:", notifError.message);
          console.error("❌ Full error:", notifError);
          // Don't fail the webhook if notification fails
        }
        
        console.log("📨 Immediate notification process completed\n");
      } else {
        console.log(`ℹ️ Skipping immediate notification (status: ${status}, verify_url: ${verify_url ? "present" : "missing"})`);
      }
    } catch (shopifyError: any) {
      console.error("❌ Shopify update failed:", shopifyError.message);
      // Don't fail the webhook - we got the data
    }



    console.log("✅ Webhook processed successfully\n");

    // Return success to Alan
    return new Response(
      JSON.stringify({ success: true, message: "Webhook processed" }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("❌ Webhook processing error:", error);

    return new Response(
      JSON.stringify({ error: error.message || "Webhook processing failed" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
};
