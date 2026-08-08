import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import firestore from "../firestore.server";
import { verifyProxyToken } from "../services/token-verify.server";
import { findMerchantDocRef } from "../services/merchant-doc.server";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  sanitizeNotificationSettings,
  resolveShopFromTokenPayload,
} from "../services/notification-settings";

/**
 * Notification Settings endpoint.
 *
 * GET  /app/api/settings/notifications → { settings }  (persists defaults on
 *      first read, so every merchant doc ends up carrying a REAL
 *      notification_settings — the senders all bail on a missing one)
 * POST /app/api/settings/notifications → sanitized update
 *
 * Rebuilt 2026-08-07. The old route accepted only `shop`/`merchant_id` claims
 * — but the embedded page authenticates with an App Bridge session token,
 * whose shop lives in `dest`. So no embedded save had ever resolved a
 * merchant. It also wrote `request.json()` VERBATIM onto the doc, and its
 * private two-convention lookup missed the embed's own doc-id shape (the
 * §17.2 landmine, fourth appearance — now findMerchantDocRef).
 *
 * The Return Window select is the one field with a real backend counterpart:
 * eligibility runs on merchant.return_window_days (returnEligibility.js:72),
 * not on this doc. On change we PATCH the backend FIRST and only persist the
 * local copy when that lands — never save half.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
    ...init,
  });

const INK_API_URL =
  process.env.INK_API_URL ||
  process.env.NFS_API_URL ||
  "https://us-central1-inink-c76d3.cloudfunctions.net/api";

async function authenticateShop(request: Request): Promise<
  | { shop: string }
  | { error: Response }
> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const tokenPayload = await verifyProxyToken(authHeader.slice(7));
  if (!tokenPayload) {
    return { error: json({ error: "Invalid or expired token" }, { status: 401 }) };
  }
  const shop =
    resolveShopFromTokenPayload(tokenPayload) ??
    (typeof tokenPayload.merchant_id === "string" ? tokenPayload.merchant_id : null);
  if (!shop) {
    return { error: json({ error: "Token names no shop" }, { status: 401 }) };
  }
  return { shop };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const auth = await authenticateShop(request);
  if ("error" in auth) return auth.error;

  try {
    const hit = await findMerchantDocRef(firestore, auth.shop);
    if (!hit) return json({ error: "Merchant not found" }, { status: 404 });

    const stored = hit.data.notification_settings;
    // Sanitize even the stored value: sheds the NFC-era `reminders` group and
    // any junk an older client persisted.
    const settings = sanitizeNotificationSettings(stored ?? {});

    if (!stored) {
      // Backfill-on-read: the senders treat a missing notification_settings
      // as "send nothing" — so a doc without one is a merchant whose toggles
      // silently do not exist. Persist the defaults the first time anyone
      // looks.
      await hit.ref.set({ notification_settings: settings }, { merge: true });
    }

    return json({ settings });
  } catch (err: any) {
    console.error("[settings/notifications] GET error:", err.message);
    return json({ error: "Failed to fetch notification settings" }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const auth = await authenticateShop(request);
  if ("error" in auth) return auth.error;

  try {
    const payload = await request.json();
    const hit = await findMerchantDocRef(firestore, auth.shop);
    if (!hit) return json({ error: "Merchant not found" }, { status: 404 });

    const base = sanitizeNotificationSettings(
      hit.data.notification_settings ?? DEFAULT_NOTIFICATION_SETTINGS,
    );
    const next = sanitizeNotificationSettings(payload, base);

    // Return Window changed → the REAL gate lives on the backend merchant
    // (merchant.return_window_days — what eligibility actually reads).
    // PATCH it first; refuse the whole save if that fails, so the page never
    // shows a window the backend doesn't enforce.
    if (next.returnWindow !== base.returnWindow) {
      if (!hit.apiKey) {
        return json(
          { error: "This store isn't connected to ink yet — reload the app and try again." },
          { status: 409 },
        );
      }
      const res = await fetch(`${INK_API_URL}/return-config`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${hit.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ return_window_days: Number(next.returnWindow) }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        console.error(
          "[settings/notifications] return-config PATCH failed:",
          res.status,
          detail?.error,
        );
        return json(
          { error: "Couldn't update the return window — nothing was saved." },
          { status: 502 },
        );
      }
    }

    await hit.ref.set({ notification_settings: next }, { merge: true });
    return json({ success: true, settings: next });
  } catch (err: any) {
    console.error("[settings/notifications] POST error:", err.message);
    return json({ error: "Failed to update notification settings" }, { status: 500 });
  }
};
