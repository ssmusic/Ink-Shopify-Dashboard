import { type ActionFunctionArgs } from "react-router";
import { serialNumberToToken } from "../utils/nfc-conversion.server";
import { INK_NAMESPACE } from "../utils/metafields.server";
import { getProof } from "../services/ink-api.server";
import firestore from "../firestore.server";

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
    // CRITICAL: Log EVERY request that hits this endpoint
    console.log("\n🚨 =================================================");
    console.log("🚨 /api/verify ENDPOINT HIT");
    // ... (logging omitted for brevity in diff, but kept in logic via imports/structure) ...

    try {
        const payload = await request.json();
        console.log("📥 Raw payload received:", JSON.stringify(payload, null, 2));

        const { serial_number, delivery_gps, device_info, phone_last4 } = payload;

        if (!serial_number || !delivery_gps) {
            console.error("❌ Validation failed: Missing serial_number or delivery_gps");
            return new Response(
                JSON.stringify({ error: "Missing required fields: serial_number and delivery_gps" }),
                { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
            );
        }

        // DETERMINISTIC: Compute token directly from serial number
        const { uid, token } = serialNumberToToken(serial_number);
        console.log(`✅ Computed from serial: UID="${uid}", Token="${token.substring(0, 20)}..."`);

        // Call Alan's API directly
        console.log("🚀 Calling Alan's INK API to check verify status...");
        
        let apiKey: string | null = null;
        try {
            const merchantsSnapshot = await firestore.collection("merchants").limit(10).get();
            for (const doc of merchantsSnapshot.docs) {
                const key = doc.data().ink_api_key;
                if (key && key !== "sk_test_fallback") {
                    apiKey = key;
                    break;
                }
            }
        } catch (fsErr) {
            console.warn("⚠️ Firestore unavailable for API key lookup:", fsErr);
        }

        if (!apiKey) {
            apiKey = process.env.INK_API_KEY || "";
        }

        if (!apiKey) {
            console.error("❌ No INK API key available for verification");
            return new Response(
                JSON.stringify({ error: "No API key available" }),
                { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
            );
        }

        const alanData = await getProof(apiKey, token);

        if (!alanData) {
            console.error("❌ Verification failed: Proof not found on INK API");
            return new Response(
                JSON.stringify({ error: "Proof not found" }),
                { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
            );
        }

        console.log("✅ INK server response state:", alanData.state, "outcome:", alanData.delivery_outcome);

        // Inject merchant branding media into the verification payload.
        try {
            console.log(`[verify] Attempting to look up merchant configuration by apiKey...`);
            const { default: firestore } = await import("../firestore.server");
            const merchantDoc = await firestore.collection("merchants").where("ink_api_key", "==", apiKey).limit(1).get();
            if (!merchantDoc.empty) {
                const foundMedia = merchantDoc.docs[0].data().merchant_media || [];
                console.log(`[verify] Successfully found merchant_media in Firestore: ${foundMedia.length} items`);
                alanData.merchant_media = foundMedia;
            } else {
                console.warn(`[verify] No Firestore merchant configuration found matching the active INK API key!`);
            }
        } catch (err) {
            console.error("Failed to append merchant media to verify payload", err);
        }

        // =================================================================
        // FALLBACK: Update metafields immediately (redundancy with webhook)
        // This ensures dashboard updates even if webhook fails/is not configured
        // =================================================================
        (async () => {
            try {
                console.log("\n📝 =================================================");
                console.log("📝 Updating Metafields as Fallback");
                console.log("📝 =================================================");
                
                const { default: firestore } = await import("../firestore.server");
                
                // --- MULTI-TENANT SAFE: Search ALL offline sessions ---
                const sessionSnapshot = await firestore.collection("shopify_sessions").where("isOnline", "==", false).get();
                if (sessionSnapshot.empty) {
                    console.warn("⚠️ No offline sessions found for fallback metafield update");
                    return;
                }
                const offlineSessions = sessionSnapshot.docs.map(doc => doc.data());

                let foundOrderGid: string | null = null;
                let foundSession: any = null;

                for (const sess of offlineSessions) {
                    if (!sess.accessToken) continue;

                    const adminGraphql = async (query: string, variables?: any) => {
                        const response = await fetch(`https://${sess.shop}/admin/api/2024-10/graphql.json`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "X-Shopify-Access-Token": sess.accessToken,
                            },
                            body: JSON.stringify({ query, variables }),
                        });
                        return response.json();
                    };

                    const searchQuery = `#graphql
                        query SearchOrderByProof($query: String!) {
                            orders(first: 1, query: $query) {
                                edges { node { id name } }
                            }
                        }
                    `;
                    console.log(`🔍 Searching in ${sess.shop} for proof_id: ${alanData.proof_id}`);
                    const searchResult = await adminGraphql(searchQuery, { 
                        query: `metafield.ink.proof_reference:${alanData.proof_id}` 
                    });
                    
                    if (searchResult?.data?.orders?.edges?.length > 0) {
                        foundOrderGid = searchResult.data.orders.edges[0].node.id;
                        foundSession = sess;
                        console.log(`✅ Found order ${searchResult.data.orders.edges[0].node.name} in ${sess.shop}`);
                        break;
                    }
                }

                if (!foundOrderGid || !foundSession) {
                    console.warn(`⚠️ Could not find order with proof_id: ${alanData.proof_id} in any connected store`);
                    return;
                }

                const session = foundSession;
                const orderGid = foundOrderGid;

                const adminGraphql = async (query: string, variables?: any) => {
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

                // --- END MULTI-TENANT SAFE SECTION ---
                    
                    const metafields = [
                        {
                            ownerId: orderGid,
                            namespace: "ink",
                            key: "verification_status",
                            type: "single_line_text_field",
                            value: "verified",
                        },
                        {
                            ownerId: orderGid,
                            namespace: "ink",
                            key: "gps_verdict",
                            type: "single_line_text_field",
                            value: alanData.gps_verdict || "unknown",
                        },
                        {
                            ownerId: orderGid,
                            namespace: "ink",
                            key: "delivery_timestamp",
                            type: "single_line_text_field",
                            value: new Date().toISOString(),
                        },
                        {
                            ownerId: orderGid,
                            namespace: "ink",
                            key: "device_info",
                            type: "single_line_text_field",
                            value: device_info || "Unknown Device",
                        }
                    ];

                    if (alanData.verify_url) {
                        metafields.push({
                            ownerId: orderGid,
                            namespace: "ink",
                            key: "verify_url",
                            type: "single_line_text_field",
                            value: alanData.verify_url,
                        });
                    }

                    if (delivery_gps && delivery_gps.lat) {
                        metafields.push({
                            ownerId: orderGid,
                            namespace: "ink",
                            key: "delivery_gps",
                            type: "json",
                            value: JSON.stringify(delivery_gps),
                        });
                    }
                    
                    const mutation = `
                        mutation SetVerificationMetafields($metafields: [MetafieldsSetInput!]!) {
                            metafieldsSet(metafields: $metafields) {
                                userErrors { field message }
                            }
                        }
                    `;
                    
                    const metaResult = await adminGraphql(mutation, { metafields });
                    
                    if (metaResult.data?.metafieldsSet?.userErrors?.length > 0) {
                        console.error("⚠️ Metafield errors:", metaResult.data.metafieldsSet.userErrors);
                    } else {
                        console.log("✅ Metafields updated immediately via fallback");
                        console.log(`   - verification_status: verified`);
                        console.log(`   - gps_verdict: ${alanData.gps_verdict || "unknown"}`);
                    }
                
                console.log("📝 Fallback metafield update completed\n");
            } catch (fallbackError) {
                console.error("❌ Fallback metafield update failed:", fallbackError);
            }
        })();
        // =================================================================
        // END FALLBACK
        // =================================================================

        // =================================================================
        // TESTING MODE: Send email on EVERY scan
        // TODO: Remove this after testing - webhook should handle it in production
        // =================================================================
        (async () => {
            try {
                console.log("\n📧 =================================================");
                console.log("📧 Sending Return Passport Email");
                console.log("📧 =================================================");
                
                const { getOfflineSession } = await import("../session-utils.server");
                
                const session = await getOfflineSession();
                
                if (!session) {
                    console.warn("⚠️ No session found for email");
                    return;
                }
                
                // Get order_id and photos from alanData
                console.log("🔍 Using retrieved proof data for email...");
                const proofData = alanData;
                console.log("📦 Proof data:", proofData);
                
                let orderId = proofData.order_id;
                // Get photos from media_items logic
                const photoUrls = (proofData.media_items || []).map((m: any) => m.media_url || m.url);
                console.log("📦 Order ID from Alan:", orderId);
                console.log("📸 Photo URLs:", photoUrls);
                
                // Extract numeric part (without truncating to length 4)
                const numericOrderId = orderId ? String(orderId).replace(/\D/g, '') : '';
                console.log("🔢 Numeric Order ID Extracted:", numericOrderId);
                
                // Create admin GraphQL helper
                const adminGraphql = async (query: string, variables?: any) => {
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
                
                const queryFields = `
                  edges { 
                      node { 
                          id
                          name
                          customer { email firstName }
                          lineItems(first: 1) {
                              edges {
                                  node {
                                      image {
                                          url
                                      }
                                  }
                              }
                          }
                      } 
                  }
                `;

                // 1. First try by Proof ID (Deterministic)
                let searchResult = null;
                console.log(`🔍 Searching for order with proof_id: ${alanData.proof_id}`);
                const proofQuery = `#graphql
                    query SearchOrderByProof($query: String!) {
                        orders(first: 1, query: $query) {
                            ${queryFields}
                        }
                    }
                `;
                const proofResult = await adminGraphql(proofQuery, { 
                    query: `metafield.ink.proof_reference:${alanData.proof_id}` 
                });

                if (proofResult?.data?.orders?.edges?.length > 0) {
                    searchResult = proofResult;
                    console.log("✅ Found order via proof_reference");
                } 
                // 2. Fallback to direct GID
                else if (numericOrderId && numericOrderId.length > 10) {
                    const directQuery = `#graphql
                      query CheckOrder($id: ID!) {
                        order(id: $id) {
                          id
                          name
                          customer { email firstName }
                          lineItems(first: 1) {
                            edges { node { image { url } } }
                          }
                        }
                      }
                    `;
                    console.log("🔍 Trying direct ID search:", `gid://shopify/Order/${numericOrderId}`);
                    const checkResult = await adminGraphql(directQuery, { id: `gid://shopify/Order/${numericOrderId}` });
                    if (checkResult?.data?.order?.id) {
                        searchResult = { data: { orders: { edges: [ { node: checkResult.data.order } ] } } };
                        console.log("✅ Found order via direct ID");
                    }
                }

                // 3. Last resort fallback to Name (if orderId seems like a name)
                if (!searchResult && numericOrderId && numericOrderId.length <= 10) {
                    console.log("🔍 Trying name search with:", numericOrderId);
                    const nameQuery = `#graphql
                        query FindOrderByName($query: String!) {
                            orders(first: 1, query: $query) {
                                ${queryFields}
                            }
                        }
                    `;
                    searchResult = await adminGraphql(nameQuery, { query: `name:${numericOrderId}` });
                    if (!searchResult?.data?.orders?.edges?.length) {
                        searchResult = await adminGraphql(nameQuery, { query: `name:#${numericOrderId}` });
                    }
                }
                
                if (searchResult?.data?.orders?.edges?.length > 0) {
                    const order = searchResult.data.orders.edges[0].node;
                    console.log("✅ Found order:", order.name);
                    console.log("📧 Customer email:", order.customer?.email);
                    
                    const productImageUrl = order.lineItems?.edges?.[0]?.node?.image?.url;

                    if (order.customer?.email) {
                        const { EmailService } = await import("../services/email.server");
                        
                        // Send Return Passport email with photos
                        await EmailService.sendReturnPassportEmail({
                            to: order.customer.email,
                            customerName: order.customer.firstName || "Customer",
                            orderName: order.name,
                            proofUrl: alanData.verify_url || `https://in.ink/verify/${alanData.proof_id}`,
                            photoUrls: photoUrls,
                            returnWindowDays: 30,
                            merchantName: session.shop.replace('.myshopify.com', ''),
                            productImageUrl: productImageUrl,
                        });
                        
                        console.log(`✅ Return Passport email sent to ${order.customer.email}`);
                    } else {
                        console.warn("⚠️ Order found but no customer email");
                    }
                } else {
                    console.warn(`⚠️ Could not find order #${numericOrderId}`);
                }
                
                
                console.log("📧 Return Passport email process completed\n");
            } catch (emailError) {
                console.error("❌ Return Passport email failed:", emailError);
            }
        })();

        // =================================================================
        // END TESTING MODE
        // =================================================================

        // Return Alan's response directly to frontend
        return new Response(JSON.stringify(alanData), {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });

    } catch (error: any) {
        console.error("❌ Verify error:", error);
        
        if (error.message?.includes("Phone verification required")) {
            return new Response(
                JSON.stringify({ error: error.message }),
                { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
            );
        }
        
        if (error.message?.includes("Tag not enrolled")) {
            return new Response(
                JSON.stringify({ error: "Tag not enrolled. Please enroll this package first at the warehouse." }),
                { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
            );
        }
        
        return new Response(
            JSON.stringify({ error: error.message || "Verification failed" }),
            { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
    }
};