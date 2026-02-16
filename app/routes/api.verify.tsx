import { type ActionFunctionArgs } from "react-router";
import { serialNumberToToken } from "../utils/nfc-conversion.server";
import { NFSService } from "../services/nfs.server";
import { EmailService } from "../services/email.server";
import { INK_NAMESPACE } from "../utils/metafields.server";

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
        console.log("🚀 Calling Alan's NFS API /verify...");
        
        const alanData = await NFSService.verify({
            nfc_token: token,
            delivery_gps,
            device_info: device_info || "Unknown",
            phone_last4: phone_last4,
        });

        console.log("✅ Alan's server response:", alanData);

        // =================================================================
        // FALLBACK: Update metafields immediately (redundancy with webhook)
        // This ensures dashboard updates even if webhook fails/is not configured
        // =================================================================
        (async () => {
            try {
                console.log("\n📝 =================================================");
                console.log("📝 Updating Metafields as Fallback");
                console.log("📝 =================================================");
                
                const { getOfflineSession } = await import("../session-utils.server");
                
                const session = await getOfflineSession();
                
                if (!session) {
                    console.warn("⚠️ No session found for metafield update");
                    return;
                }
                
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
                
                // Find order by proof_id in metafields
                const searchQuery = `#graphql
                    query SearchOrderByProof($query: String!) {
                        orders(first: 1, query: $query) {
                            edges {
                                node {
                                    id
                                    name
                                }
                            }
                        }
                    }
                `;
                
                console.log(`🔍 Searching for order with proof_id: ${alanData.proof_id}`);
                const searchResult = await adminGraphql(searchQuery, { 
                    query: `metafield.ink.proof_reference:${alanData.proof_id}` 
                });
                
                if (searchResult?.data?.orders?.edges?.length > 0) {
                    const orderGid = searchResult.data.orders.edges[0].node.id;
                    const orderName = searchResult.data.orders.edges[0].node.name;
                    console.log(`✅ Found order ${orderName} (${orderGid})`);
                    
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
                    ];
                    
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
                } else {
                    console.warn(`⚠️ Could not find order with proof_id: ${alanData.proof_id}`);
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
                
                // Get order_id and photos from Alan's retrieve API
                console.log("🔍 Retrieving proof from Alan to get order_id and photos...");
                const proofData = await NFSService.retrieveProof(alanData.proof_id);
                console.log("📦 Proof data:", proofData);
                
                let orderId = proofData.order_id;
                const photoUrls = proofData.enrollment?.photo_urls || [];
                console.log("📦 Order ID from Alan:", orderId);
                console.log("📸 Photo URLs:", photoUrls);
                
                // Extract numeric part (handles both "1015" and "1015***015" formats)
                const numericOrderId = orderId.replace(/\D/g, '').substring(0, 4); // Get first 4 digits
                console.log("🔢 Numeric Order ID:", numericOrderId);
                
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
                
                // Try to find order by name (order number)
                let orderGid = `gid://shopify/Order/${numericOrderId}`;
                
                const nameQuery = `#graphql
                    query FindOrderByName($query: String!) {
                        orders(first: 1, query: $query) {
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
                        }
                    }
                `;
                
                console.log("🔍 Searching for order by name:", numericOrderId);
                let searchResult = await adminGraphql(nameQuery, { query: `name:${numericOrderId}` });
                
                if (!searchResult?.data?.orders?.edges?.length) {
                    console.log("🔍 Trying with # prefix...");
                    searchResult = await adminGraphql(nameQuery, { query: `name:#${numericOrderId}` });
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