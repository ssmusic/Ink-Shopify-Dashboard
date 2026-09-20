import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";
import { findMerchantDoc } from "../services/merchant-doc.server";
import { reportShopifyDiscounts } from "../services/ink-api.server";
import { fetchDiscountNode, type DiscountDoorEntry } from "../services/shopify-discounts.server";

// discounts/* — THE DISCOUNTS DOOR (Track C, 2026-09-04).
//
// Five topics, one handler, one uri (shopify.app.toml): create · update ·
// delete · redeemcode_added · redeemcode_removed. Their bodies are thin —
// the gid and, at most, a title, a status and a code — so on create and
// update the discount node is read back (needs read_discounts, which the
// merchant granted or these never fire) and BOTH are handed to the backend's
// door: the thin event lands even when the read is refused, the node lands
// the words, the clock, the codes and the arithmetic. The backend owns the
// record and merges every event onto one row, idempotently.
//
// Webhook discipline (fulfillments/create's): ALWAYS 200 once authenticated
// — Shopify retries non-200s and disables flaky subscriptions — every
// failure inside is logged and swallowed. Retrying would be safe anyway
// (the door merges), it is just noise nobody needs.
export const TOPICS = [
  "DISCOUNTS_CREATE",
  "DISCOUNTS_UPDATE",
  "DISCOUNTS_DELETE",
  "DISCOUNTS_REDEEMCODE_ADDED",
  "DISCOUNTS_REDEEMCODE_REMOVED",
] as const;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);
  const label = `[${topic}]`;
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const gid = typeof body.admin_graphql_api_id === "string" ? body.admin_graphql_api_id : undefined;

  if (!(TOPICS as readonly string[]).includes(topic)) {
    console.warn(`${label} not a discounts topic for ${shop}; acking.`);
    return new Response("OK", { status: 200 });
  }
  if (!gid) {
    // Malformed — a retry cannot fix it; ack rather than 400.
    console.warn(`${label} no admin_graphql_api_id in the body for ${shop}; acking.`);
    return new Response("OK", { status: 200 });
  }

  try {
    const merchant = await findMerchantDoc(firestore, shop);
    const apiKey = merchant?.apiKey ?? null;
    if (!apiKey) {
      console.warn(`${label} no ink_api_key for ${shop} — ${gid} not recorded.`);
      return new Response("OK", { status: 200 });
    }

    const entries: DiscountDoorEntry[] = [{ topic, payload }];
    if ((topic === "DISCOUNTS_CREATE" || topic === "DISCOUNTS_UPDATE") && admin) {
      const node = await fetchDiscountNode(admin, gid, label);
      if (node) entries.push({ node, source_event: "webhook" });
    }
    const r = await reportShopifyDiscounts(apiKey, entries);
    console.log(`${label} ${shop} ${gid} → door written=${r.written}${r.skipped.length ? ` skipped=${r.skipped.join(",")}` : ""}`);
  } catch (err: unknown) {
    console.error(`${label} failed for ${shop} ${gid} (acking anyway):`, err instanceof Error ? err.message : err);
  }
  return new Response("OK", { status: 200 });
};
