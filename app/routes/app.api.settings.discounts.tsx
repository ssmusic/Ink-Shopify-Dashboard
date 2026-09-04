// SHOPIFY DISCOUNTS — the door's switch (Track C, 2026-09-04).
//
// GET  /app/api/settings/discounts → { granted: { read, write }, declared,
//                                      backfilled_at, backfill_count, partial }
// POST { action: "backfill" }      → walk every discount into the backend now
//
// The GRANT itself is not asked for here: an embedded page asks with App
// Bridge (`shopify.scopes.request([...])`, a modal, no redirect) from the
// Settings card, and the app/scopes_update webhook records it and runs a
// bounded backfill. This route is the read of that state, and the
// merchant-driven full backfill for when the webhook's walk was cut short
// (or never ran). Optional scopes are per-installation — nobody else is
// asked (https://shopify.dev/docs/api/app-bridge-library/apis/scopes).
//
// Every read here goes through authenticate.admin, like delivery-mode.

import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import firestore from "../firestore.server";
import { authenticate } from "../shopify.server";
import { findMerchantDoc } from "../services/merchant-doc.server";
import { getMerchant, updateMerchant } from "../services/merchant.server";
import { reportShopifyDiscounts } from "../services/ink-api.server";
import {
  backfillDiscounts,
  DISCOUNTS_READ_SCOPE,
  DISCOUNTS_WRITE_SCOPE,
} from "../services/shopify-discounts.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
    ...init,
  });

async function stateFor(shop: string, granted: string[], optional: string[]) {
  const doc = await getMerchant(shop);
  return {
    granted: {
      read: granted.includes(DISCOUNTS_READ_SCOPE),
      write: granted.includes(DISCOUNTS_WRITE_SCOPE),
    },
    // Whether the app's config even offers them — false until the toml with
    // optional_scopes is pushed (`shopify app deploy`, Sam's act).
    declared: optional.includes(DISCOUNTS_READ_SCOPE),
    scopes_to_request: [DISCOUNTS_READ_SCOPE, DISCOUNTS_WRITE_SCOPE],
    backfilled_at: doc?.discounts_backfilled_at ?? null,
    backfill_count: doc?.discounts_backfill_count ?? null,
    partial: doc?.discounts_backfill_partial === true,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const { session, scopes } = await authenticate.admin(request);
  try {
    const detail = await scopes.query();
    return json(await stateFor(session.shop, detail.granted, detail.optional));
  } catch (err: unknown) {
    console.error("[settings/discounts] GET error:", err instanceof Error ? err.message : err);
    return json({ error: "Couldn't read the discounts setting" }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  const { session, scopes, admin } = await authenticate.admin(request);
  try {
    const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
    if (body?.action !== "backfill") {
      return json({ error: 'Send { action: "backfill" }' }, { status: 400 });
    }
    const detail = await scopes.query();
    if (!detail.granted.includes(DISCOUNTS_READ_SCOPE)) {
      return json({ error: "scope_missing", ...(await stateFor(session.shop, detail.granted, detail.optional)) }, { status: 409 });
    }
    const merchant = await findMerchantDoc(firestore, session.shop);
    const apiKey = merchant?.apiKey ?? null;
    if (!apiKey) {
      return json({ error: "This store isn't connected to the Ritualist yet — open the dashboard once, then try again." }, { status: 409 });
    }
    const r = await backfillDiscounts(admin, (entries) => reportShopifyDiscounts(apiKey, entries), {
      label: "[settings/discounts backfill]",
    });
    await updateMerchant(session.shop, {
      discounts_backfilled_at: new Date().toISOString(),
      discounts_backfill_count: r.nodes,
      discounts_backfill_partial: r.truncated,
    });
    // `partial` comes from stateFor — the doc just written above.
    return json({
      ok: r.errors.length === 0,
      pages: r.pages,
      nodes: r.nodes,
      written: r.written,
      errors: r.errors,
      ...(await stateFor(session.shop, detail.granted, detail.optional)),
    });
  } catch (err: unknown) {
    console.error("[settings/discounts] POST error:", err instanceof Error ? err.message : err);
    return json({ error: "Couldn't read your discounts into the Ritualist" }, { status: 500 });
  }
};
