import { authenticate } from "../shopify.server";

const INK_API_URL = process.env.INK_API_URL || "https://us-central1-inink-c76d3.cloudfunctions.net/api";
const INK_ADMIN_SECRET = process.env.INK_ADMIN_SECRET || "ink_admin_aeb5c9d6e822a4e57d95a6a2224aada64230e48d89acad5782057fcb865548a2";

import crypto from "crypto";

// Admin implementation - requires X-Admin-Secret
export const createMerchant = async (
  shopDomain: string, 
  shopName: string, 
  ownerEmail: string,
  optionalParams?: {
    shopify_plan?: string;
    merchant_category?: string;
    merchant_region?: string;
    avg_order_value?: number;
    primary_carriers?: string[];
    monthly_order_volume?: number;
    pre_ink_dispute_rate?: number;
  }
) => {
  try {
    const payload: any = {
      shop_domain: shopDomain,
      shop_name: shopName,
      owner_email: ownerEmail,
      ...optionalParams
    };

    const response = await fetch(`${INK_API_URL}/admin/merchants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": INK_ADMIN_SECRET,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("INK API Error (createMerchant):", response.status, errorText);
        throw new Error(`Failed to create merchant: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data; // Expected { api_key: "..." }
  } catch (error) {
    console.error("INK API Exception:", error);
    throw error;
  }
};

export const getMerchants = async () => {
    const response = await fetch(`${INK_API_URL}/admin/merchants`, {
        headers: { "X-Admin-Secret": INK_ADMIN_SECRET },
    });
    if (!response.ok) throw new Error("Failed to list merchants");
    return await response.json();
};


// Merchant implementation - requires Bearer ink_api_key
export const enrollOrder = async (
    apiKey: string, 
    orderId: string, 
    nfcToken: string, 
    orderDetails?: any, 
    shippingAddress?: string
) => {
    const payload: any = { order_id: orderId, nfc_token: nfcToken };
    if (orderDetails) payload.order_details = orderDetails;
    if (shippingAddress) payload.shipping_address = shippingAddress;

    const response = await fetch(`${INK_API_URL}/api/enroll`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`Enrollment failed: ${await response.text()}`);
    }
    return await response.json();
};

export const getProof = async (apiKey: string, nfcToken: string) => {
    const response = await fetch(`${INK_API_URL}/api/proofs/${nfcToken}`, {
        headers: {
            "Authorization": `Bearer ${apiKey}`,
        },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Get proof failed: ${await response.text()}`);
    return await response.json();
};

export const uploadMedia = async (apiKey: string, formData: FormData) => {
    // Note: When forwarding FormData, we let fetch handle the Content-Type header (boundary)
    const response = await fetch(`${INK_API_URL}/api/media/upload`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
        },
        body: formData, 
    });

    if (!response.ok) {
        throw new Error(`Upload failed: ${await response.text()}`);
    }
    return await response.json();
};

export const healthCheck = async () => {
    try {
        const response = await fetch(`${INK_API_URL}/api/health`);
        return response.ok;
    } catch (e) {
        return false;
    }
};

/**
 * Implements cryptographic integrity check for a fetched proof record.
 * 
 * Fetches the Ed25519 public key from the INK API's /.well-known/jwks.json endpoint
 * and uses Node's native crypto module to verify the signature against the payload hash.
 */
export const verifyProofSignature = async (proof: any): Promise<boolean> => {
    try {
        if (!proof || !proof.signature || !proof.payload_hash || !proof.key_id) {
            console.warn("INK API: Proof is missing cryptographic signature fields.");
            return false;
        }

        // 1. Fetch public JWKS from the INK backend
        const jwksReq = await fetch(`${INK_API_URL}/.well-known/jwks.json`);
        if (!jwksReq.ok) {
            console.error("INK API: Failed to fetch JWKS for signature verification");
            return false;
        }
        const jwk = await jwksReq.json();

        // 2. Verify the key_id matches
        if (jwk.kid !== proof.key_id) {
            console.warn(`INK API: Key ID mismatch. Proof used ${proof.key_id}, Server provides ${jwk.kid}`);
            return false;
        }

        // 3. Create a public key object from the JWK
        const publicKey = crypto.createPublicKey({
            key: jwk,
            format: "jwk",
        });

        // 4. Verify the Ed25519 signature
        // Crypto verify: Node.js expects `null` for the algorithm when using EdDSA/Ed25519
        const isValid = crypto.verify(
            null,
            Buffer.from(proof.payload_hash, "hex"),
            publicKey,
            Buffer.from(proof.signature, "hex")
        );

        return isValid;
    } catch (error) {
        console.error("INK API Signature Verification Error:", error);
        return false;
    }
};
