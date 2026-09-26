import { type ActionFunctionArgs } from "react-router";
import firestore from "../firestore.server";
import { loginUser } from "../services/ink-api.server";
import { allowRequest, clientIp, rateLimitResponse } from "../services/rate-limit.server";
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

  // This route does not inherit the Shopify app loader's authentication.
  // Bound attempts before either credential backend or bcrypt can run. The
  // shared limiter is per Cloud Run instance; the account key also prevents
  // changing a forwarded-IP header from bypassing this instance's limit.
  const cors = { "Access-Control-Allow-Origin": "*" };
  if (!allowRequest(`warehouse-login-ip:${clientIp(request)}`, 30)) {
    return rateLimitResponse(cors);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Email and password are required" }, { status: 400 });
  }
  const credentials = body as Record<string, unknown>;
  if (typeof credentials.email !== "string" || typeof credentials.password !== "string" ||
      !credentials.email.trim() || !credentials.password ||
      credentials.email.length > 320 || credentials.password.length > 1024) {
    return json({ error: "Email and password are required" }, { status: 400 });
  }
  const email = credentials.email.trim().toLowerCase();
  const password = credentials.password;
  const accountKey = crypto.createHash("sha256").update(email).digest("hex");
  if (!allowRequest(`warehouse-login-account:${accountKey}`, 10)) {
    return rateLimitResponse(cors);
  }

  // ==========================================
  // 1. INK v1.3.0 Primary Authentication Path
  // ==========================================
  try {
    const inkResponse = await loginUser(email, password);
    const inkUser = inkResponse.user;

    // Login authenticates an existing identity. Merchant provisioning belongs
    // to Shopify installation: createMerchant rotates an existing API key,
    // so calling it here can invalidate the other app's cached credentials.
    return json({
      token: inkResponse.token,
      userId: inkUser.user_id,
      name: inkUser.name,
      email: inkUser.email,
      role: inkUser.role || 'merchant',
      user: inkUser,
    });
  } catch {
    // Keep legacy warehouse accounts compatible without logging credentials,
    // email addresses, or backend response bodies.
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

  // Do not create, rotate, or cache merchant credentials during legacy login
  // either. The installed app owns provisioning and recovery.

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
