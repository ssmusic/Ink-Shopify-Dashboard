// Internal server-to-server endpoint: the ink-backend calls this when a return
// reaches a TERMINAL state (refund issued / exchange created) to bill the
// $2.50 completed-return usage charge. There's no browser session on this call,
// so we load the merchant's OFFLINE session via unauthenticated.admin(shop).
//
// Auth: the shared INK_RETURN_WEBHOOK_SECRET (the same secret the existing
// return-status bridge in api.return-status.tsx uses; falls back to
// INK_ADMIN_SECRET). Sent as X-Ink-Secret or a Bearer token.
//
// INERT until managed pricing is configured: reportUsageCharge() no-ops
// (skipped:"no_usage_line") until the merchant is on a managed-pricing plan
// WITH a usage line, so the backend can fire this safely today and it simply
// records nothing until the plan exists.
//
// POST /api/billing/usage  { shop, return_id, amount? }

import { type ActionFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import { reportUsageCharge } from "../services/billing.server";

const COMPLETED_RETURN_FEE_USD = 2.5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expected =
    process.env.INK_RETURN_WEBHOOK_SECRET || process.env.INK_ADMIN_SECRET;
  const provided =
    request.headers.get("X-Ink-Secret") ||
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || provided !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: {
    shop?: string;
    shop_domain?: string;
    return_id?: string;
    returnId?: string;
    amount?: number;
  };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const shop = body.shop_domain || body.shop;
  const returnId = body.return_id || body.returnId;
  const amountUsd =
    typeof body.amount === "number" && body.amount > 0 ? body.amount : COMPLETED_RETURN_FEE_USD;

  if (!shop || !returnId) {
    return json({ error: "shop and return_id are required" }, 400);
  }

  try {
    const { admin } = await unauthenticated.admin(shop);
    const result = await reportUsageCharge(admin, {
      description: `Completed return ${returnId}`,
      amountUsd,
      idempotencyKey: `return-${returnId}`,
    });
    // skipped (no usage line yet) is a 200 — it's expected/inert, not an error.
    const status = result.ok || result.skipped ? 200 : 502;
    return json({ shop, return_id: returnId, ...result }, status);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api.billing.usage] error for", shop, message);
    return json({ error: "usage_charge_failed", detail: message }, 500);
  }
};
