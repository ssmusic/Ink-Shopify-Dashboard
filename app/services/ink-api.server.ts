import { authenticate } from "../shopify.server";

const INK_API_URL = process.env.INK_API_URL || "https://us-central1-inink-c76d3.cloudfunctions.net/api";
const INK_ADMIN_SECRET = process.env.INK_ADMIN_SECRET || "ink_admin_aeb5c9d6e822a4e57d95a6a2224aada64230e48d89acad5782057fcb865548a2";

// Admin implementation - requires X-Admin-Secret
export const createMerchant = async (shopDomain: string, shopName: string, ownerEmail: string) => {
  try {
    const response = await fetch(`${INK_API_URL}/admin/merchants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": INK_ADMIN_SECRET,
      },
      body: JSON.stringify({
        shop_domain: shopDomain,
        shop_name: shopName,
        owner_email: ownerEmail,
      }),
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
export const enrollOrder = async (apiKey: string, orderId: string, nfcToken: string) => {
    const response = await fetch(`${INK_API_URL}/api/enroll`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ order_id: orderId, nfc_token: nfcToken }),
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
