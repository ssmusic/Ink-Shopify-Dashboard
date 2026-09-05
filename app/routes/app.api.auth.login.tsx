import { type ActionFunctionArgs } from "react-router";
import firestore from "../firestore.server";
import { createMerchant, loginUser } from "../services/ink-api.server";
import { findMerchantDocRef } from "../services/merchant-doc.server";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      // Allow the Firebase-hosted warehouse app to call this endpoint
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    ...init,
  });

const COLLECTION = "warehouse_users";
// No dev-secret fallback: a token signed with a published constant would
// fail verification anyway (services/token-verify.server.ts) — better to
// fail loudly at mint time than mint tokens that 401 downstream.
const JWT_SECRET =
  process.env.WAREHOUSE_JWT_SECRET || process.env.SHOPIFY_API_SECRET;

// Simple JWT-like token using HMAC-SHA256
function createToken(payload: object): string {
  if (!JWT_SECRET) throw new Error("WAREHOUSE_JWT_SECRET / SHOPIFY_API_SECRET not configured — cannot mint tokens");
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

// Handle CORS preflight
export const loader = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email, password } = body;

  if (!email || !password) {
    return json({ error: "Email and password are required" }, { status: 400 });
  }

  // ==========================================
  // 1. INK v1.3.0 Primary Authentication Path
  // ==========================================
  try {
    console.log(`[Auth] Attempting INK v1.3.0 login for ${email}...`);
    const inkResponse = await loginUser(email, password);
    const inkUser = inkResponse.user;
    const merchantId = inkUser.merchant_id; // This is the shop_domain from Alan

    console.log(`[Auth] INK Login successful for ${email}, merchant: ${merchantId}`);

    // Proactively cache/refresh the merchant's ink_api_key in Firestore.
    // This ensures the warehouse proxies can always look it up without failing.
    if (merchantId) {
      try {
        // Try to get or create the merchant on Alan's side (handles both new + reinstall)
        const inkMerchantRes = await createMerchant(merchantId, merchantId, email);
        const freshApiKey = inkMerchantRes.api_key;

        if (freshApiKey) {
          // Cache the key in the document every reader opens — findMerchantDocRef,
          // the resolver the fulfillment webhooks and the notification senders
          // use. This carried its own lookup (doc-id, then `where("shopDomain")`)
          // and on a store holding two merchant docs it wrote the key into the
          // doc-id document while every reader took the one already carrying a
          // key: a re-login refreshed a key nothing would ever read.
          const hit = await findMerchantDocRef(firestore, merchantId);
          if (hit) {
            await hit.ref.update({ ink_api_key: freshApiKey, updatedAt: new Date() });
          } else {
            // Nothing exists yet — create it keyed by merchantId, and name the
            // shop under every convention the resolver looks for.
            await firestore.collection("merchants").doc(merchantId).set({
              shop: merchantId,
              shopDomain: merchantId,
              ink_api_key: freshApiKey,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          console.log(`[Auth] Cached ink_api_key for merchant ${merchantId}`);
        }
      } catch (cacheErr: any) {
        // Non-fatal: if caching fails, the proxy self-heal will handle it
        console.warn(`[Auth] Could not cache ink_api_key for ${merchantId}:`, cacheErr.message);
      }
    }

    return json({
      token: inkResponse.token,
      userId: inkUser.user_id,
      name: inkUser.name,
      email: inkUser.email,
      role: inkUser.role || 'merchant',
      user: inkUser,
    });
  } catch (error: any) {
    console.warn(`[Auth] INK login failed: ${error.message}. Falling back to legacy Firestore auth...`);
    // If the error is definitively "wrong password" for an INK user, we might want to fail hard here.
    // But for a smooth rollout, we gracefully fall back to checking the legacy db.
  }

  // ==========================================
  // 2. Legacy Firestore Auth Path
  // ==========================================
  // Look up the user by email
  const snapshot = await firestore
    .collection(COLLECTION)
    .where("email", "==", email.toLowerCase())
    .limit(1)
    .get();

  if (snapshot.empty) {
    // Return same error to prevent email enumeration
    return json({ error: "Invalid email or password" }, { status: 401 });
  }

  const userDoc = snapshot.docs[0];
  const userData = userDoc.data();

  // Verify password
  const isValid = await bcrypt.compare(password, userData.passwordHash);
  if (!isValid) {
    return json({ error: "Invalid email or password" }, { status: 401 });
  }

  // Ensure the merchant configuration document exists and has a real INK API key
  // (heal from sk_test_fallback). Same resolver as the embedded path above and
  // as every reader — a `where("shopDomain")` of its own could heal a document
  // the webhooks never open.
  const merchantHit = await findMerchantDocRef(firestore, userData.shopDomain);

  let apiKey = merchantHit?.data?.ink_api_key ?? null;

  if (!apiKey || apiKey === "sk_test_fallback") {
    console.log(`[Auth] Key missing or fallback for ${userData.shopDomain}. Calling INK Admin API...`);
    try {
      const inkRes = await createMerchant(userData.shopDomain, userData.shopDomain, userData.email || email);
      apiKey = inkRes.api_key;

      if (merchantHit) {
        await merchantHit.ref.update({
          ink_api_key: apiKey,
          updatedAt: new Date(),
        });
      } else {
        await firestore.collection("merchants").add({
          shop: userData.shopDomain,
          shopDomain: userData.shopDomain,
          ink_api_key: apiKey,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    } catch (e: any) {
      console.error("[Auth] Failed to auto-create merchant:", e.message);
    }
  }

  // Issue a token valid for 8 hours
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 8;
  const token = createToken({
    sub: userDoc.id,
    email: userData.email,
    name: userData.name,
    shop: userData.shopDomain,
    role: userData.role,
    exp,
  });

  return json({
    token,
    userId: userDoc.id,
    name: userData.name,
    email: userData.email,
    role: userData.role,
  });
};
