import crypto from "crypto";

// Shared Bearer-token verification for the proxy endpoints (warehouse
// enroll/upload, orders fetch, app.api.orders). Replaces the per-route
// copies whose "fall back to decode-without-verify (Alan's JWTs)" step
// accepted ANY well-formed JWT — an attacker could mint
// {shop: "victim.myshopify.com"} and act as that store (fix-list #2).
//
// Two legitimate issuers, two verification paths, zero unverified accepts:
//  1. Our own tokens (app.api.auth.login / warehouse mint) — HMAC-SHA256
//     with WAREHOUSE_JWT_SECRET / SHOPIFY_API_SECRET, verified locally.
//     The old "fallback-dev-secret" constant is gone: a guessable published
//     secret is worse than no local path (Cloud Run always has
//     SHOPIFY_API_SECRET; local dev without env falls through to 2).
//  2. ink-backend merchant JWTs — signed with the backend's JWT_SECRET,
//     which this app deliberately does not hold. Validated REMOTELY via the
//     backend's own GET /auth/validate; only if the backend says valid:true
//     is the payload trusted (the backend signed it, so its claims are
//     authentic). Backend unreachable → fail CLOSED (null → 401).

const INK_API_URL =
  process.env.INK_API_URL ||
  process.env.NFS_API_URL ||
  "https://us-central1-inink-c76d3.cloudfunctions.net/api";

// Both candidate local secrets are tried: WAREHOUSE_JWT_SECRET signs our own
// minted tokens; SHOPIFY_API_SECRET signs App Bridge session tokens (Shopify
// signs those HS256 with the app's client secret — so an App Bridge token
// verifies LOCALLY here; routes that accept them read payload.dest after).
const LOCAL_SECRETS = [
  process.env.WAREHOUSE_JWT_SECRET,
  process.env.SHOPIFY_API_SECRET,
].filter((s): s is string => Boolean(s));

export interface VerifiedTokenPayload {
  shop?: string;
  merchant_id?: string;
  shop_id?: string;
  sub?: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}

export async function verifyProxyToken(
  token: string
): Promise<VerifiedTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;

  let payload: VerifiedTokenPayload & { exp?: number };
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

  // Path 1 — locally verifiable tokens (ours + App Bridge session tokens).
  for (const secret of LOCAL_SECRETS) {
    try {
      const expected = crypto
        .createHmac("sha256", secret)
        .update(`${header}.${body}`)
        .digest("base64url");
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expected);
      if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
        return payload;
      }
    } catch {
      // try next candidate / fall through to remote validation
    }
  }

  // Path 2 — ink-backend JWTs, validated by the issuer itself.
  try {
    const res = await fetch(`${INK_API_URL}/auth/validate`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const v = (await res.json()) as { valid?: boolean; shop_id?: string };
      if (v?.valid) {
        return {
          ...payload,
          shop_id: v.shop_id ?? payload.shop_id,
          merchant_id: (payload.merchant_id as string) ?? v.shop_id,
        };
      }
    }
  } catch {
    // backend unreachable → fail closed below
  }

  return null;
}
