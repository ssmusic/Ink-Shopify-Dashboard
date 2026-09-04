import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";
import { findMerchantDoc } from "../services/merchant-doc.server";
import { updateMerchant } from "../services/merchant.server";
import { reportShopifyDiscounts } from "../services/ink-api.server";
import {
  backfillDiscounts,
  DISCOUNTS_READ_SCOPE,
} from "../services/shopify-discounts.server";

// A webhook-time backfill is bounded: Shopify retries a slow webhook, and a
// store with thousands of discounts would be re-walked on every retry.
// Three pages (150 discounts, newest-updated first) is the common case
// whole; the rest is marked partial and the Settings "Allow" flow — an admin
// request with a merchant waiting — runs it to the end.
const WEBHOOK_BACKFILL_PAGE_CAP = 3;

export const action = async ({ request }: ActionFunctionArgs) => {
    const { payload, session, topic, shop, admin } = await authenticate.webhook(request);
    console.log(`Received ${topic} webhook for ${shop}`);

    const current = payload.current as string[];
    if (session) {
        await firestore.collection("shopify_sessions").doc(session.id).update({
            scope: current.toString(),
        });
    }

    // THE GRANT (Track C). The merchant pressed Allow on "Shopify discounts"
    // and read_discounts arrived here: walk their discounts once so the
    // record is whole before the first webhook, and stamp the merchant doc so
    // Settings can say so. Idempotent (the backend's door merges) and never
    // fatal to the ack — a refused backfill is a logged line, and Settings
    // will run it again on demand.
    if (Array.isArray(current) && current.includes(DISCOUNTS_READ_SCOPE) && admin) {
        try {
            const merchant = await findMerchantDoc(firestore, shop);
            const apiKey = merchant?.apiKey ?? null;
            if (!apiKey) {
                console.warn(`[${topic}] read_discounts granted for ${shop} but no ink_api_key — backfill skipped`);
            } else {
                const r = await backfillDiscounts(admin, (entries) => reportShopifyDiscounts(apiKey, entries), {
                    pageCap: WEBHOOK_BACKFILL_PAGE_CAP,
                    label: `[${topic} backfill]`,
                });
                await updateMerchant(shop, {
                    discounts_backfilled_at: new Date().toISOString(),
                    discounts_backfill_count: r.nodes,
                    discounts_backfill_partial: r.truncated,
                });
            }
        } catch (err: unknown) {
            console.error(`[${topic}] discounts backfill failed for ${shop} (acking anyway):`, err instanceof Error ? err.message : err);
        }
    }
    return new Response();
};
