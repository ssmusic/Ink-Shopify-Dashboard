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
        // Find an API key from ANY connected merchant session
        // The INK API requires an api_key — get the first available one
        let apiKey: string | null = null;
        try {
            const { default: firestore } = await import("../firestore.server");
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
            return new Response(
                JSON.stringify({ error: "No INK API key available" }),
                { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
            );
        }

        // The `proofId` param holds the nfc_token (stored as proof_reference in metafields).
        // The new INK API uses GET /api/proofs/{nfc_token}
        console.log(`🚀 Calling INK API /api/proofs/${proofId}...`);
        
        const proofData = await getProof(apiKey, proofId);
        
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