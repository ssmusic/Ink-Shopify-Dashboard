import { type ActionFunctionArgs } from "react-router";
import { NFSService } from "../services/nfs.server";
import { INK_NAMESPACE } from "../utils/metafields.server";
import { serialNumberToToken } from "../utils/nfc-conversion.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Requested-With, Origin",
};

// Handle OPTIONS preflight
export const loader = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { getOfflineSession } = await import("../session-utils.server");

  try {
    // Get offline session from Firestore (needed for Shopify API calls)
    const session = await getOfflineSession();

    if (!session) {
      return new Response(
        JSON.stringify({ error: "No session available" }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        }
      );
    }

    // Parse JSON payload
    const payload = await request.json();
    const { order_id, serial_number, photo_urls, photo_hashes, shipping_address_gps, warehouse_gps } = payload;
    let customer_phone_last4 = "";
    let orderData: any;

    console.log(`📦 Enrollment request for order ${order_id}, serial: ${serial_number}`);

    if (!order_id || !serial_number || !photo_urls || !photo_hashes) {
      console.error("❌ Missing required fields");
      return new Response(
        JSON.stringify({ error: "Missing required fields: order_id, serial_number, photo_urls, photo_hashes" }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        }
      );
    }

    // Convert serial number to UID and Token (deterministic)
    const { uid, token } = serialNumberToToken(serial_number);
    console.log(`✅ Converted serial to UID: ${uid}, Token: ${token.substring(0, 30)}...`);

    // Create admin client helper for Shopify API calls
    const admin = {
      graphql: async (query: string, options?: any) => {
        const response = await fetch(`https://${session.shop}/admin/api/2024-10/graphql.json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": session.accessToken,
          },
          body: JSON.stringify({
            query,
            variables: options?.variables || {},
          }),
        });

        return {
          json: async () => await response.json(),
        };
      },
    };

    // 1. Fetch customer phone AND Shop Name from Shopify
    console.log(`📞 Fetching customer phone and shop name for order ${order_id}...`);
    let merchantName = session.shop.replace('.myshopify.com', ''); // Fallback

    let validOrderGid: string = "";

    try {
      const numericOrderId = order_id.replace(/\D/g, '');
      const potentialGid = `gid://shopify/Order/${numericOrderId}`;
      const orderGid = potentialGid;

      const combinedQuery = `
        query getOrderAndShop($id: ID!) {
          shop {
            name
          }
          order(id: $id) {
            id
            name
            customer {
              phone
            }
            metafield(namespace: "ink", key: "customer_phone") {
              value
            }
            fulfillments {
              trackingInfo {
                company
                number
              }
            }
          }
        }
      `;

      let orderResponse;

      // Try fetching by ID first
      orderResponse = await admin.graphql(combinedQuery, { variables: { id: orderGid } });
      let responseJson = await orderResponse.json();

      // Extract Shop Name if available
      if (responseJson?.data?.shop?.name) {
        merchantName = responseJson.data.shop.name;
        console.log(`✅ Fetched Merchant Name: ${merchantName}`);
      }

      // If ID lookup failed (order is null), try finding by Name (Order Number)
      if (!responseJson?.data?.order) {
        console.warn(`⚠️ Direct ID lookup failed for ${orderGid}. Trying lookup by name...`);

        const nameQuery = `#graphql
          query FindOrderByName($query: String!) {
            orders(first: 1, query: $query) {
              edges {
                node {
                  id
                  name
                  customer {
                    phone
                  }
                  metafield(namespace: "ink", key: "customer_phone") {
                    value
                  }
                  fulfillments {
                    trackingInfo {
                      company
                      number
                    }
                  }
                }
              }
            }
          }
        `;

        const searchResponse = await admin.graphql(nameQuery, { variables: { query: `name:${numericOrderId}` } });
        const searchJson = await searchResponse.json();

        if (searchJson?.data?.orders?.edges?.length > 0) {
          const foundOrder = searchJson.data.orders.edges[0].node;
          console.log(`✅ Found order by name: ${foundOrder.name} (ID: ${foundOrder.id})`);
          orderData = { data: { order: foundOrder } };
        } else {
          // Try with #
          const searchResponse2 = await admin.graphql(nameQuery, { variables: { query: `name:#${numericOrderId}` } });
          const searchJson2 = await searchResponse2.json();
          if (searchJson2?.data?.orders?.edges?.length > 0) {
            const foundOrder = searchJson2.data.orders.edges[0].node;
            orderData = { data: { order: foundOrder } };
          }
        }
      } else {
        orderData = responseJson;
      }

      if (!orderData?.data?.order) {
        console.error(`❌ Order not found in Shopify: ${orderGid} or by name #${numericOrderId}`);
        return new Response(
          JSON.stringify({ error: `Order not found: ${order_id}. Please ensure the order exists in Shopify.` }),
          {
            status: 404,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          }
        );
      }

      // Update global ID variable for later use (Metafields)
      // Since orderGid is const, we'll extract the valid ID from data
      validOrderGid = orderData.data.order.id;

      // Extract phone: Priority 1 = Metafield (from webhook), Priority 2 = Customer object
      const metafieldPhone = orderData.data?.order?.metafield?.value;
      const customerObjectPhone = orderData.data?.order?.customer?.phone;
      const customerPhone = metafieldPhone || customerObjectPhone;

      console.log(`📞 Phone Details - Metafield: ${metafieldPhone || "N/A"}, Customer Object: ${customerObjectPhone || "N/A"}`);

      if (customerPhone) {
        // Extract last 4 digits (remove non-numeric characters)
        const phoneDigits = customerPhone.replace(/\D/g, '');
        customer_phone_last4 = phoneDigits.slice(-4);
        console.log(`✅ Using customer phone last 4: ${customer_phone_last4}`);
      } else {
        console.warn("⚠️ No customer phone found for order");
      }
    } catch (phoneError) {
      console.error("Error fetching customer phone:", phoneError);
      // If we can't context Shopify for some reason (e.g. auth error), we should probably fail safest
      // But adhering to 'resilience', maybe we continue? 
      // NO, if we can't talk to Shopify, we can't update metafields later. So we should fail.
      return new Response(
        JSON.stringify({ error: "Failed to validate order with Shopify." }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 2. Call Alan's NFS API to Enroll
    // Alan's API is the SINGLE SOURCE OF TRUTH - no local database save
    console.log("🚀 Calling Alan's NFS API /enroll...");

    const numericOrderId = String(order_id).replace(/\D/g, "");

    let carrier_name = null;
    let tracking_number = null;

    const fulfillments = orderData?.data?.order?.fulfillments || [];
    for (const fulfillment of fulfillments) {
      const trackingInfo = fulfillment?.trackingInfo;
      if (trackingInfo && trackingInfo.length > 0) {
        carrier_name = trackingInfo[0]?.company || null;
        tracking_number = trackingInfo[0]?.number || null;
        if (carrier_name || tracking_number) break;
      }
    }

    const enrollPayload: any = {
      order_id,
      nfc_token: token,
      nfc_uid: serial_number,
      shipping_address: "Not Provided", // Extracted later if Shopify webhook includes address blocks
      order_details: {
        order_number: numericOrderId,
        customer_email: orderData?.data?.order?.customer?.email || "unknown@example.com",
        customer_phone: customer_phone_last4 || "1234",
        product_details: [] // In a real flow, extract line items
      }
    };

    if (carrier_name) enrollPayload.carrier_name = carrier_name;
    if (tracking_number) enrollPayload.tracking_number = tracking_number;

    if (photo_urls && photo_urls.length > 0) {
      enrollPayload.photo_urls = photo_urls;
    }

    if (photo_hashes && photo_hashes.length > 0) {
      enrollPayload.photo_hashes = photo_hashes;
    }

    if (warehouse_gps && warehouse_gps.lat && warehouse_gps.lng) {
        enrollPayload.warehouse_location = warehouse_gps; // Renamed to warehouse_location per v1.2.0 spec
    }

    let nfsResponse;
    try {
      console.log(`📦 Payload to NFS:`, JSON.stringify(enrollPayload, null, 2));
      nfsResponse = await NFSService.enroll(enrollPayload);
      console.log(`✅ NFS enrollment successful: ${nfsResponse.proof_id}`);
    } catch (error: any) {
      console.error("❌ NFS enrollment failed:", error.message);
      return new Response(
        JSON.stringify({
          error: "Enrollment failed",
          details: error.message
        }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        }
      );
    }

    // 3. Update Shopify Metafields with proof_id for later retrieval
    // This is the ONLY place we store a reference to the proof
    console.log(`📝 Updating order metafields for ${validOrderGid}...`);
    try {
      // Use the Validated GID found earlier
      const metafields = [
        {
          ownerId: validOrderGid,
          namespace: INK_NAMESPACE,
          key: "proof_reference",
          type: "single_line_text_field",
          value: nfsResponse.proof_id,  // Store Alan's proof_id for retrieval
        },
        {
          ownerId: validOrderGid,
          namespace: INK_NAMESPACE,
          key: "verification_status",
          type: "single_line_text_field",
          value: "enrolled",
        },
        {
          ownerId: validOrderGid,
          namespace: INK_NAMESPACE,
          key: "nfc_uid",
          type: "single_line_text_field",
          value: serial_number,  // Store original serial for reference
        },
      ];

      if (warehouse_gps && warehouse_gps.lat && warehouse_gps.lng) {
          metafields.push({
              ownerId: validOrderGid,
              namespace: INK_NAMESPACE,
              key: "warehouse_gps",
              type: "json",
              value: JSON.stringify({ lat: warehouse_gps.lat, lng: warehouse_gps.lng }),
          });
      }

      if (shipping_address_gps && shipping_address_gps.lat && shipping_address_gps.lng) {
           metafields.push({
              ownerId: validOrderGid,
              namespace: INK_NAMESPACE,
              key: "shipping_address_gps",
              type: "json",
              value: JSON.stringify({ lat: shipping_address_gps.lat, lng: shipping_address_gps.lng }),
          });
      }

      const mutation = `
        mutation SetEnrollmentMetafields($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            userErrors { field message }
          }
        }
      `;

      const metaResult = await admin.graphql(mutation, { variables: { metafields } });
      const metaData = await metaResult.json();

      if (metaData.data?.metafieldsSet?.userErrors?.length > 0) {
        console.warn("⚠️ Metafield errors:", metaData.data.metafieldsSet.userErrors);
      } else {
        console.log("✅ Metafields updated successfully");
      }
    } catch (metaError) {
      console.error("⚠️ Metafield update failed:", metaError);
      // Don't fail the request - enrollment is already saved in Alan's API
    }



    // Return success with proof_id from Alan's API and token for NFC writing
    return new Response(
      JSON.stringify({
        success: true,
        proof_id: nfsResponse.proof_id,
        enrollment_status: nfsResponse.enrollment_status,
        key_id: nfsResponse.key_id,
        token: token,  // Add token for frontend NFC writing
      }),
      {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      }
    );

  } catch (error: any) {
    console.error("❌ Enrollment Error:", error);

    return new Response(
      JSON.stringify({ error: error.message || "Enrollment failed" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      }
    );
  }
};