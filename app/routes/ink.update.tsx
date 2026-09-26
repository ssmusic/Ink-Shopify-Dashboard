import { type ActionFunctionArgs } from "react-router";
import crypto from "crypto";

/** Constant-time comparison of two hex signatures of any length. */
export function signaturesMatch(received: unknown, expected: string): boolean {
  if (typeof received !== "string") return false;
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
import { INK_NAMESPACE } from "../utils/metafields.server";
import { OPEN_DISTANCE_KEY, openDistanceOf, storedStatusFor } from "../lib/order-marks";
import { FEATURE_NOTIFICATIONS } from "../flags";
import { isInk } from "../services/app-flavor.server";

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
    // The body is never logged: it is unverified here, and it carries GPS
    // and device data once verified (review pass 2026-09-26).

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

    if (!signaturesMatch(signature, expectedSignature)) {
      // Never log the expected value: it is a valid signature for this body.
      console.error("❌ Invalid HMAC signature");
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
      distance_m,
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

      const { withFreshTokens } = await import("../session-utils.server");
      const offlineSessions = await withFreshTokens(sessionSnapshot.docs.map(doc => doc.data()) as any[]);
      
    // 5. Look for the order in Shopify across ALL merchants' stores
    let foundOrderGid: string | null = null;
    let targetSession: any = null;

    const rawOrderId = order_id ? order_id.replace(/\D/g, '') : '';
    console.log(`🔍 Attempting to locate order (Raw ID: ${rawOrderId}, Proof ID: ${proof_ref || 'None'})`);

    const adminGraphqlForSession = async (session: any, query: string, variables?: any) => {
      const response = await fetch(`https://${session.shop}/admin/api/2026-07/graphql.json`, {
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

    // NO GUESSING (review pass 2026-09-26). Two fallbacks used to follow the
    // direct ID. One searched orders by the proof-reference metafield, a
    // filter Shopify's order search silently ignores, so it "found" the first
    // order of the first store: from 2026-09-18 to 09-21 every such event
    // wrote its metafields onto one unrelated corvara order. The other
    // searched order names across every connected store, so #1001 of one
    // store could take another store's event. Only an exact order ID is
    // written now, as api.verify already does; anything else answers 404 and
    // writes nothing.

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
        const response = await fetch(`https://${targetSession.shop}/admin/api/2026-07/graphql.json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": targetSession.accessToken,
          },
          body: JSON.stringify({ query, variables }),
        });
        return response.json();
      };

      // THE URL ARRIVES WEARING THE WRONG NAME, SO WE DO NOT TRUST ITS HOST.
      //
      // The backend builds `verify_url` from the myshopify domain, which for
      // Clare V is `taimoor1-2` — an internal store handle, not a brand. Real
      // order #1117, 2026-08-11:
      //
      //   sent:    https://taimoor1-2.in.ink/r/nfc_msov8f7f_zo0nma1c
      //   correct: https://clarev.in.ink/r/nfc_msov8f7f_zo0nma1c
      //
      // Measured against the worker: `clarev` IS claimed (→ her shop_id);
      // `taimoor1-2` returns 404. The *.in.ink wildcard still serves a page,
      // so nothing looked broken — it just put a stranger's handle on the one
      // link that is supposed to BE the brand. Sam, reading the email: "the
      // email i got didnt have her."
      //
      // The embed already resolves this correctly for the branded tracking
      // link (`resolveBrandPageUrl` → `brandSlugFromDoc`: backend merchant doc
      // merged over the embed's, brand_slug first). Rather than wait on a
      // gated backend deploy, the host is REBUILT here from that same author —
      // one resolver, so an email and a tracking button can never send the
      // same buyer to two different hosts (that file's founding law).
      //
      // Fail-soft both ways: no proof_ref, an unresolvable brand, or a throw
      // all keep exactly what the backend sent. This can only improve the
      // host — it can never blank the URL.
      let brandedVerifyUrl = verify_url || "";
      if (verify_url && proof_ref) {
        try {
          const { resolveBrandPageUrl } = await import("../services/brand-page-url.server");
          const { findMerchantDoc } = await import("../services/merchant-doc.server");
          const hit = await findMerchantDoc(firestore, targetSession.shop);
          const resolved = await resolveBrandPageUrl({
            merchantApiKey: hit?.data?.ink_api_key,
            proofId: proof_ref,
            shop: targetSession.shop,
            merchantData: hit?.data ?? {},
            label: "verify-url",
          });
          if (resolved.pageUrl) {
            if (resolved.pageUrl !== verify_url) {
              console.log(`🔗 verify_url rehosted: ${verify_url} -> ${resolved.pageUrl}`);
            }
            brandedVerifyUrl = resolved.pageUrl;
          }
        } catch (e: any) {
          console.warn(`🔗 verify_url rehost skipped (${e?.message}) — keeping the backend's URL.`);
        }
      }

      // THE ORDER SAYS THE FACT, NEVER "VERIFIED" (Sam, 2026-09-24: "wrong").
      // The wire's door word is "verified" (ink-backend routes/verify.js); the
      // order stores the neutral one (lib/order-marks.ts, ⚠️ PLACEHOLDER), and
      // the open's distance beside it when the notification carries one. Every
      // other wire word ("delivered") is stored as it came.
      const metafields = [
        {
          ownerId: orderGid,
          namespace: INK_NAMESPACE,
          key: "verification_status",
          type: "single_line_text_field",
          value: storedStatusFor(status),
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
          value: brandedVerifyUrl,
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

      // The door's own measurement, whole metres (the backend's `distance_m`,
      // what DELIVERY_VERIFIED signs). The Shipments list says it in place of a
      // verdict; absent on a notification that carries none.
      const openDistance = openDistanceOf(distance_m);
      if (openDistance != null) {
        metafields.push({
          ownerId: orderGid,
          namespace: INK_NAMESPACE,
          key: OPEN_DISTANCE_KEY,
          type: "number_integer",
          value: String(openDistance),
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

      // --- SEND NOTIFICATIONS (delivered / the door) ---
      // "verified" below is the WIRE's word for the door notification, read,
      // never shown; the messages themselves say no such thing.
      // Gate the read as well as dispatch: an inactive sender must not fetch
      // a customer's phone/email or put those fields in application logs.
      if (FEATURE_NOTIFICATIONS && !isInk() && ((status === "verified" && verify_url) || status === "delivered")) {
        console.log("\n📨 ================================================");
        console.log(`📨 STARTING IMMEDIATE NOTIFICATION PROCESS [${status.toUpperCase()}]`);
        console.log("📨 Order GID:", orderGid);
        console.log("📨 Verify URL:", brandedVerifyUrl);
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
          
          if (orderData?.data?.order?.customer) {
            const customerEmail = orderData.data.order.customer.email;
            const customerPhone = orderData.data.order.customer.phone;
            const customerName = orderData.data.order.customer.firstName || "Customer";
            const orderName = orderData.data.order.name;
            
            console.log("✅ Notification order context found");

            // Fetch Merchant Settings from Firestore.
            //
            // findMerchantDoc, NOT where("shopDomain"==…): no merchant doc
            // reliably carries that field — the embed keys its own docs by
            // shop domain as the DOCUMENT ID, the backend uses snake_case
            // shop_domain. The old query came back empty on both shapes, so
            // this branch logged "no settings" and skipped EVERY
            // delivery-confirmed notification (Bible §17.2, fourth appearance).
            const { default: firestore } = await import("../firestore.server");
            const { findMerchantDoc } = await import("../services/merchant-doc.server");
            const merchantHit = await findMerchantDoc(firestore, targetSession.shop);
            const merchantData = merchantHit?.data ?? null;
            const merchantName = merchantData?.shopName || targetSession.shop;
            const settings = merchantData?.notification_settings ?? null;

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
                   verifyUrl: brandedVerifyUrl,
                   returnWindowDays: settings.returnWindow ? parseInt(settings.returnWindow) : 30
                 }, settings, merchantData);
               }
            }
          } else {
            console.warn("⚠️ Order found but no customer context available");
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
