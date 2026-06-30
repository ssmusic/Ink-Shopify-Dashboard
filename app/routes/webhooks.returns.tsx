import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { NFSService } from "../services/nfs.server";

// Serves every returns/* topic (request | approve | decline | cancel | close |
// reopen | update). We pull the canonical Return via Admin GraphQL and forward
// it to ink-backend, which mirrors it into proof.shopify_return (read-only —
// it does NOT drive ink's own returns engine or fire billing). Works for
// returns created natively, by us, or by Loop/AfterShip — all write the same
// Shopify Return object.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic, admin } = await authenticate.webhook(request);

  try {
    const ret = payload as any;
    const returnGid: string | null =
      ret.admin_graphql_api_id || (ret.id ? `gid://shopify/Return/${ret.id}` : null);

    // Fall back to whatever the webhook payload carries; enrich via GraphQL.
    let orderId: string | number | null = ret.order_id ?? ret.order?.id ?? null;
    let status: string | null = ret.status ?? null;
    let lineItems: unknown = null;
    let reverseDelivery: unknown = null;

    if (admin && returnGid) {
      try {
        const q = await admin.graphql(
          `#graphql
          query GetReturn($id: ID!) {
            return(id: $id) {
              id
              status
              order { id }
              returnLineItems(first: 50) {
                nodes { quantity returnReason }
              }
              reverseDeliveries(first: 5) {
                nodes { id }
              }
            }
          }`,
          { variables: { id: returnGid } },
        );
        const j = await q.json();
        const r = j.data?.return;
        if (r) {
          status = r.status ?? status;
          orderId = r.order?.id ?? orderId;
          lineItems = r.returnLineItems?.nodes ?? null;
          reverseDelivery = r.reverseDeliveries?.nodes ?? null;
        }
      } catch (gqlErr: any) {
        // Degrade gracefully to the payload fields.
        console.error(`[${topic}] Return GraphQL lookup failed:`, gqlErr?.message || gqlErr);
      }
    }

    if (!orderId) {
      console.log(`[${topic}] No order id resolvable; skipping ingest.`);
      return new Response("OK", { status: 200 });
    }

    await NFSService.ingestReturnEvent({
      shop_domain: shop,
      order_id: orderId,
      // RETURNS_REQUEST -> returns/request
      event_type: topic.toLowerCase().replace(/_/g, "/"),
      return: { id: returnGid, status, line_items: lineItems, reverse_delivery: reverseDelivery },
    });
  } catch (error: any) {
    console.error(`[${topic}] Error processing returns webhook:`, error?.message || error);
  }

  return new Response("OK", { status: 200 });
};
