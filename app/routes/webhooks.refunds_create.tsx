import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { NFSService } from "../services/nfs.server";

// refunds/create — the return's terminal money event. Phase 1 mirrors it into
// ink (proof.shopify_return.refunded) for visibility. The $2.50 Shopify Billing
// usage charge is intentionally NOT fired here: ink already fires it on its own
// COMPLETED path, and the two carry different return ids, so firing on the
// refund too would double-bill. The billing-on-refund decision is deferred (see
// the ink-backend ingestion route).
export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  try {
    const refund = payload as any;
    const orderId = refund.order_id ?? null;
    if (!orderId) {
      console.log(`[${topic}] Refund has no order_id; skipping.`);
      return new Response("OK", { status: 200 });
    }

    // Sum successful refund transactions for the amount.
    let total: string | null = null;
    let currency: string | null = null;
    if (Array.isArray(refund.transactions) && refund.transactions.length > 0) {
      const sum = refund.transactions
        .filter((t: any) => t.kind === "refund" && t.status === "success")
        .reduce((acc: number, t: any) => acc + parseFloat(t.amount || "0"), 0);
      if (!Number.isNaN(sum) && sum > 0) total = sum.toFixed(2);
      currency = refund.transactions[0]?.currency ?? null;
    }

    await NFSService.ingestReturnEvent({
      shop_domain: shop,
      order_id: orderId,
      event_type: "refund",
      refund: { id: refund.id, total_refunded: total, currency },
    });
  } catch (error: any) {
    console.error(`[${topic}] Error processing refunds/create webhook:`, error?.message || error);
  }

  return new Response("OK", { status: 200 });
};
