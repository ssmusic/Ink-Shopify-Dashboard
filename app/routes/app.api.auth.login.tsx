import { type ActionFunctionArgs } from "react-router";
import firestore from "../firestore.server";
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
const JWT_SECRET =
  process.env.WAREHOUSE_JWT_SECRET ||
  process.env.SHOPIFY_API_SECRET ||
  "fallback-dev-secret";

// Simple JWT-like token using HMAC-SHA256
function createToken(payload: object): string {
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
