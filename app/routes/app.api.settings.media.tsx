import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import firestore from "../firestore.server";
import crypto from "crypto";
import { uploadMedia } from "../services/ink-api.server";

const JWT_SECRET =
  process.env.WAREHOUSE_JWT_SECRET ||
  process.env.SHOPIFY_API_SECRET ||
  "fallback-dev-secret";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
    ...init,
  });

function decodeToken(token: string): { shop?: string; merchant_id?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;

    // Try HMAC verify first
    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return { shop: payload.shop, merchant_id: payload.merchant_id };
  } catch {
    return null;
  }
}

async function getMerchantDoc(shopDomain?: string, merchantId?: string) {
  if (merchantId) {
    const doc = await firestore.collection("merchants").doc(merchantId).get();
    if (doc.exists) return doc;
  }
  if (shopDomain) {
    const snapshot = await firestore
      .collection("merchants")
      .where("shopDomain", "==", shopDomain)
      .limit(1)
      .get();
    if (!snapshot.empty) return snapshot.docs[0];
  }
  return null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let shopDomain = "";
  let merchantId = "";
  try {
      const { session } = await authenticate.admin(request);
      shopDomain = session.shop;
  } catch (err) {
      if (err instanceof Response) {
          // It's a Shopify App Bridge redirect or re-auth response!
          // We MUST throw it so the frontend App Bridge intercepts it natively!
          throw err;
      }
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }
      const tokenPayload = decodeToken(authHeader.slice(7));
      if (!tokenPayload) {
        return json({ error: "Invalid or expired token" }, { status: 401 });
      }
      shopDomain = tokenPayload.shop || "";
      merchantId = tokenPayload.merchant_id || "";
  }

  if (!shopDomain && !merchantId) {
      return json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[settings/media] GET request for domain: ${shopDomain}, merchantId: ${merchantId}`);

  try {
    const doc = await getMerchantDoc(shopDomain, merchantId);
    if (!doc) {
      console.log(`[settings/media] No merchant doc found for ${shopDomain || merchantId}`);
    }
    const data = doc?.data() ?? {};
    
    console.log(`[settings/media] GET success, found ${data.merchant_media?.length || 0} media items`);

    return json({
      media: data.merchant_media ?? [],
    });
  } catch (err: any) {
    console.error("[settings/media] GET error:", err.message);
    return json({ error: "Failed to fetch media settings" }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let shopDomain = "";
  let merchantId = "";
  try {
      const { session } = await authenticate.admin(request);
      shopDomain = session.shop;
  } catch (err) {
      if (err instanceof Response) {
          throw err; // Bubble Shopify Re-auth requests!
      }
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }
      const tokenPayload = decodeToken(authHeader.slice(7));
      if (!tokenPayload) {
        return json({ error: "Invalid or expired token" }, { status: 401 });
      }
      shopDomain = tokenPayload.shop || "";
      merchantId = tokenPayload.merchant_id || "";
  }

  if (!shopDomain && !merchantId) {
      return json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[settings/media] Processing action logic for domain: ${shopDomain}, merchantId: ${merchantId}`);

  try {
    const doc = await getMerchantDoc(shopDomain, merchantId);
    let merchantMedia = doc?.data()?.merchant_media || [];

    // POST: Upload Media
    if (request.method === "POST") {
      console.log(`[settings/media] Processing POST upload...`);
      const formData = await request.formData();
      const fileEntry = formData.get("file") as File | null;
      
      if (!fileEntry) {
          console.warn(`[settings/media] POST failed: No file payload found!`);
          return json({ error: "No file uploaded" }, { status: 400 });
      }
      
      console.log(`[settings/media] Sending file to Alan API: ${fileEntry.name} (${fileEntry.size} bytes)`);

      const apiKey = doc?.data()?.ink_api_key;
      if (!apiKey || apiKey === "sk_test_fallback") {
         console.warn(`[settings/media] Cannot route to Alan: Missing ink_api_key for merchant`);
         return json({ error: "Merchant API Key not configured" }, { status: 400 });
      }

      // Reconstruct FormData to ensure Node fetch uses proper form boundaries 
      // when passing it to Alan's external API
      const newForm = new FormData();
      newForm.append("media_type", "merchant_branding");
      newForm.append("proof_id", "merchant_" + (merchantId || shopDomain));
      newForm.append("file", fileEntry, fileEntry.name);
      if (formData.has("duration")) {
          newForm.append("duration", formData.get("duration") as string);
      }

      let uploadResult: any = {};
      try {
          uploadResult = await uploadMedia(apiKey, newForm);
          console.log(`[settings/media] Alan API Upload Success! Output URL expected:`, uploadResult);
      } catch (err: any) {
          console.error(`[settings/media] Error from Alan's API during uploadMedia:`, err.message);
          return json({ error: "Upstream upload to storage failed" }, { status: 500 });
      }

      // Now add it to Firestore so we know about it
      const finalUrl = uploadResult.media_url || uploadResult.url || uploadResult.fileUrl;
      
      if (!finalUrl) {
          console.error(`[settings/media] Alan's API response did not contain a valid URL field! Payload was:`, uploadResult);
          return json({ error: "Storage API returned successful status but no URL" }, { status: 500 });
      }

      const newItem = {
          id: uploadResult.id || crypto.randomUUID(),
          url: finalUrl,
          name: fileEntry.name,
          type: fileEntry.type.startsWith("video") ? "video" : "image",
          duration: formData.get("duration") || "5s",
          size: `${(fileEntry.size / 1024).toFixed(1)} KB`,
          uploadDate: new Date().toLocaleDateString(),
      };
      
      merchantMedia.push(newItem);
      
      if (doc) {
          console.log(`[settings/media] Saving new media array to Firestore (${merchantMedia.length} total items)`);
          await doc.ref.update({ merchant_media: merchantMedia, updatedAt: new Date() });
      } else {
          console.warn(`[settings/media] Unable to save to Firestore because doc was null!`);
      }
      return json({ success: true, item: newItem, media: merchantMedia });
    }
    
    // DELETE: Remove media
    else if (request.method === "DELETE") {
       const body = await request.json();
       const { id } = body;
       merchantMedia = merchantMedia.filter((m: any) => m.id !== id);
       if (doc) {
           await doc.ref.update({ merchant_media: merchantMedia, updatedAt: new Date() });
       }
       return json({ success: true, media: merchantMedia });
    }
    
    // PATCH: Reorder or update metadata
    else if (request.method === "PATCH") {
       const body = await request.json();
       if (body.reorderedIds) {
           const reorderedIds: string[] = body.reorderedIds;
           const newMedia = [];
           for (const rid of reorderedIds) {
               const item = merchantMedia.find((m: any) => m.id === rid);
               if (item) newMedia.push(item);
           }
           merchantMedia = newMedia;
       } else if (body.setPrimaryId) {
           const id = body.setPrimaryId;
           const idx = merchantMedia.findIndex((m: any) => m.id === id);
           if (idx > 0) {
              const [moved] = merchantMedia.splice(idx, 1);
              merchantMedia.unshift(moved);
           }
       } else if (body.updateMetadata) {
           // Duration, loop, etc.
           const { id, updates } = body.updateMetadata;
           const idx = merchantMedia.findIndex((m: any) => m.id === id);
           if (idx >= 0) {
               merchantMedia[idx] = { ...merchantMedia[idx], ...updates };
           }
       }
       
       if (doc) {
           await doc.ref.update({ merchant_media: merchantMedia, updatedAt: new Date() });
       }
       return json({ success: true, media: merchantMedia });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (err: any) {
    console.error("[settings/media] Action error:", err.message);
    return json({ error: "Failed to modify settings" }, { status: 500 });
  }
};
