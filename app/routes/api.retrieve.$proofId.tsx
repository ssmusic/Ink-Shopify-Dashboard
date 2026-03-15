import { type LoaderFunctionArgs } from "react-router";
import { getProof } from "../services/ink-api.server";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Requested-With, Origin",
};

// Handle OPTIONS preflight
export const action = async () => {
    return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
    });
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    console.log("\n🔍 =================================================");
    console.log("🔍 /api/retrieve ENDPOINT HIT");
    console.log("🔍 Time:", new Date().toISOString());
    console.log("🔍 Proof ID / NFC Token:", params.proofId);
    console.log("🔍 =================================================\n");

    const { proofId } = params;

    if (!proofId) {
        return new Response(
            JSON.stringify({ error: "Missing proof_id" }),
            { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
    }

    try {
        // Extract shop domain from the request URL or headers (App Bridge adds `shop` to the referring URL)
        let shopDomain: string | null = null;
        try {
            const referer = request.headers.get("Referer");
            if (referer) {
                const url = new URL(referer);
                shopDomain = url.searchParams.get("shop");
            }
        } catch (e) { /* ignore */ }

        let apiKey: string | null = null;
        try {
            const { default: firestore } = await import("../firestore.server");
            
            // Strategy 1: Look up by exact shop domain (most common — App Bridge adds ?shop= to referer)
            if (shopDomain) {
                console.log(`🔍 [KeyLookup] Strategy 1: by domain → ${shopDomain}`);
                const merchantDoc = await firestore.collection("merchants").doc(shopDomain).get();
                if (merchantDoc.exists) {
                    apiKey = merchantDoc.data()?.ink_api_key || null;
                    if (apiKey) console.log(`✅ [KeyLookup] Found key for ${shopDomain}`);
                }
            }

            // Strategy 2: Resolve merchant from the proof's chain_of_custody_events.
            // Alan stores the shop as an internal `shop_id` (e.g. `shop_a66c...`).
            // We look up the event for this proof, get its shop_id, then find the API key
            // for that merchant by matching across all merchant docs.
            if (!apiKey && proofId && proofId.startsWith("proof_")) {
                console.log(`🔍 [KeyLookup] Strategy 2: resolve via chain_of_custody_events for ${proofId}`);
                const evSnap = await firestore
                    .collection("chain_of_custody_events")
                    .where("proof_id", "==", proofId)
                    .limit(1)
                    .get();
                if (!evSnap.empty) {
                    const shopId = evSnap.docs[0].data().shop_id as string | undefined;
                    if (shopId) {
                        console.log(`  → shop_id from event: ${shopId}`);
                        // Try direct doc ID first
                        const directDoc = await firestore.collection("merchants").doc(shopId).get();
                        if (directDoc.exists && directDoc.data()?.ink_api_key) {
                            apiKey = directDoc.data()!.ink_api_key;
                            console.log(`✅ [KeyLookup] Found key via direct shop_id doc`);
                        } else {
                            // Search all merchants for one whose shop_url / shopDomain matches
                            // (Alan shop_id is opaque; merchants docs use the myshopify domain as ID)
                            const allMerchants = await firestore.collection("merchants").get();
                            for (const doc of allMerchants.docs) {
                                const data = doc.data();
                                if ((data.shop_id === shopId || data.ink_shop_id === shopId) && data.ink_api_key) {
                                    apiKey = data.ink_api_key;
                                    console.log(`✅ [KeyLookup] Found key via shop_id match in merchant ${doc.id}`);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            
            // Strategy 3: Last resort — scan merchants for any valid key.
            // This can be wrong in multi-tenant scenarios, but prevents a hard 500.
            if (!apiKey) {
                console.warn(`⚠️ [KeyLookup] Strategy 3: scanning all merchants for any valid key`);
                const merchantsSnapshot = await firestore.collection("merchants")
                    .where("ink_api_key", "!=", "sk_test_fallback")
                    .limit(1).get();
                for (const doc of merchantsSnapshot.docs) {
                    const key = doc.data().ink_api_key;
                    if (key && key !== "sk_test_fallback" && key !== "undefined") {
                        apiKey = key;
                        console.warn(`  → Using fallback key from ${doc.id} — may cause 401 in multi-tenant`);
                        break;
                    }
                }
            }
        } catch (fsErr) {
            console.warn("⚠️ Firestore unavailable for API key lookup:", fsErr);
        }

        if (!apiKey) {
            apiKey = process.env.INK_API_KEY || "";
        }

        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: "No INK API key available" }),
                { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
            );
        }

        // The `proofId` param might be a proof_id (proof_...), an nfc_token, or a raw NFC UID (53:42:...)
        let actualTokenToFetch = proofId;
        const isMacAddress = proofId.includes(":");
        const isProofId = proofId.startsWith("proof_");
        
        let proofData;
        if (isMacAddress) {
            console.log(`🚀 Finding proof_id for NFC UID ${proofId} via Firestore...`);
            try {
                const { default: firestore } = await import("../firestore.server");
                const tagSnap = await firestore.collection("nfc_tags").where("uid", "==", proofId).limit(1).get();
                if (!tagSnap.empty) {
                    const tagData = tagSnap.docs[0].data();
                    if (tagData.token) actualTokenToFetch = tagData.token;
                    else if (tagData.order_id) {
                         const orderSnap = await firestore.collection("orders").doc(tagData.order_id).get();
                         if (orderSnap.exists && orderSnap.data()?.nfc_token) {
                             actualTokenToFetch = orderSnap.data()!.nfc_token;
                         }
                    }
                }
            } catch (err) { }
        } else if (isProofId) {
            // ALAN API DOCS: GET /api/proofs/{nfc_token}
            // Our Firestore `chain_of_custody_events` collection stores nfc_token keyed by proof_id.
            // Documentation search confirmed: chain_of_custody_events/{doc}.proof_id + chain_of_custody_events/{doc}.nfc_token
            console.log(`🚀 Finding nfc_token for Proof ID ${proofId} via Firestore chain_of_custody_events collection...`);
            try {
                const { default: firestore } = await import("../firestore.server");
                
                // 1. Check chain_of_custody_events (most recent system)
                const eventSnap = await firestore.collection("chain_of_custody_events").where("proof_id", "==", proofId).limit(1).get();
                if (!eventSnap.empty) {
                    const doc = eventSnap.docs[0].data();
                    const found = doc.nfc_token || doc.event_data?.nfc_token;
                    if (found) {
                        actualTokenToFetch = found;
                        console.log(`✅ Mapped Proof ID ${proofId} → NFC Token ${actualTokenToFetch.substring(0, 20)}...`);
                    }
                }
                
                // 2. Fallback: check legacy events collection
                if (actualTokenToFetch === proofId) {
                    const legacySnap = await firestore.collection("events").where("proof_id", "==", proofId).limit(1).get();
                    if (!legacySnap.empty) {
                        const doc = legacySnap.docs[0].data();
                        const found = doc.nfc_token || doc.event_data?.nfc_token;
                        if (found) {
                            actualTokenToFetch = found;
                        }
                    }
                }

                // 3. Fallback: check orders collection
                if (actualTokenToFetch === proofId) {
                    const orderSnap = await firestore.collection("orders").where("proof_id", "==", proofId).limit(1).get();
                    if (!orderSnap.empty) {
                        const od = orderSnap.docs[0].data();
                        const found = od.nfc_token || od.event_data?.nfc_token;
                        if (found) {
                            actualTokenToFetch = found;
                        }
                    }
                }

                if (actualTokenToFetch === proofId) {
                    console.warn(`⚠️ Could not resolve nfc_token for Proof ID ${proofId} — passing proof_id directly (will likely 404)`);
                }
            } catch (err) {
                console.warn(`⚠️ Failed to map Proof ID to nfc_token in Firestore:`, err);
            }
        }
        
        // Final fallback: if it doesn't look like an nfc_token, the INK API will likely 404 it.
        // We pass whatever token we resolved to Alan's standard endpoint
        console.log(`🚀 Calling INK API /api/proofs/{token}...`);
        const { getProof } = await import("../services/ink-api.server");
        proofData = await getProof(apiKey, actualTokenToFetch);
        
        if (!proofData) {
            return new Response(
                JSON.stringify({ error: "Proof not found" }),
                { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
            );
        }
        
        console.log("✅ Proof data retrieved from INK API");
        console.log(`   - state: ${proofData.state}`);
        console.log(`   - delivery_outcome: ${proofData.delivery_outcome}`);
        console.log(`   - media_items count: ${proofData.media_items?.length || 0}`);

        // Normalize the response so both old and new field names work seamlessly
        const normalized = {
            ...proofData,
            // dashboard PackagePhotos reads media_items[].url — map from INK API's media_url
            media_items: (proofData.media_items || []).map((m: any) => ({
                ...m,
                url: m.media_url || m.url, // Support both field names
            })),
        };

        return new Response(JSON.stringify(normalized), {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });

    } catch (error: any) {
        console.error("❌ Retrieve error:", error);
        
        if (error.message?.includes("not found") || error.message?.includes("404")) {
            return new Response(
                JSON.stringify({ error: "Proof not found" }),
                { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
            );
        }
        
        return new Response(
            JSON.stringify({ error: error.message || "Retrieve failed" }),
            { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
    }
};