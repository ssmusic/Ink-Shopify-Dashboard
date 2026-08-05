import { type ActionFunctionArgs } from "react-router";

// POST /api/create-return — Phase 2 (merchant-pays returns), the WRITE half.
//
// When a customer initiates a CARRIER return on the ink tap page, ink-backend
// calls this server-to-server. We create a NATIVE Shopify Return on the
// merchant's store (returnableFulfillments → returnCreate). We do NOT buy or
// attach a label here: Shopify's Admin API has no mutation to purchase a
// merchant-billed return label (reverseDeliveryCreateWithShipping is
// attach-only; shippingLabelPurchase is forward-only). So the label is DEFERRED
// to the merchant's own Shopify Shipping flow — the merchant hits "Create return
// label" in admin (or their returns app / Loop / AfterShip does), billed to the
// MERCHANT. ink stops fronting the Shippo cost.
//
// Returns the Shopify Return id + reverse fulfillment order id so ink can track
// it; the resulting return/refund events flow back via the returns/* +
// refunds/create webhooks (the ingestion side).
//
// Auth: shared X-Ink-Secret (same secret as api.return-status). Offline session
// → admin GraphQL, same pattern as api.return-status.tsx.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Accept, X-Requested-With, Origin, X-Ink-Secret",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export const loader = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

// ink return_reason → Shopify ReturnReason enum. Anything unmapped → OTHER.
const REASON_MAP: Record<string, string> = {
  WRONG_ITEM: "WRONG_ITEM",
  DAMAGED: "DEFECTIVE",
  DEFECTIVE: "DEFECTIVE",
  CHANGED_MIND: "UNWANTED",
  NOT_RECEIVED: "OTHER",
  OTHER: "OTHER",
};

const RETURNABLE_QUERY = `
query Returnable($orderId: ID!) {
  returnableFulfillments(orderId: $orderId, first: 50) {
    edges {
      node {
        id
        returnableFulfillmentLineItems(first: 50) {
          edges { node { fulfillmentLineItem { id } quantity } }
        }
      }
    }
  }
}
`;

const RETURN_CREATE_MUTATION = `
mutation ReturnCreate($input: ReturnInput!) {
  returnCreate(returnInput: $input) {
    return {
      id
      status
      reverseFulfillmentOrders(first: 10) { edges { node { id } } }
    }
    userErrors { field message }
  }
}
`;

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const secret =
    process.env.INK_RETURN_WEBHOOK_SECRET || process.env.INK_ADMIN_SECRET;
  const provided =
    request.headers.get("X-Ink-Secret") ||
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || provided !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: {
    shop_domain?: string;
    order_id?: string | number;
    return_reason?: string;
    return_reason_note?: string;
    notify?: boolean;
    // Optional explicit line items; default is the full returnable order.
    return_line_items?: { fulfillment_line_item_id: string; quantity: number }[];
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { shop_domain, order_id, return_reason, return_reason_note, notify } = body || {};
  if (!shop_domain || !order_id) {
    return json({ error: "Missing required fields: shop_domain, order_id" }, 400);
  }

  const { getOfflineSession } = await import("../session-utils.server");
  const session = await getOfflineSession(shop_domain);
  if (!session) {
    return json({ error: `No offline session for shop ${shop_domain}` }, 404);
  }

  const orderGid = String(order_id).startsWith("gid://")
    ? String(order_id)
    : `gid://shopify/Order/${String(order_id).replace(/\D/g, "")}`;

  const adminGraphql = async (query: string, variables: unknown) => {
    const resp = await fetch(
      `https://${session.shop}/admin/api/2025-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      },
    );
    return (await resp.json()) as any;
  };

  const reason = REASON_MAP[String(return_reason || "").toUpperCase()] || "OTHER";

  try {
    // 1. Find returnable line items for the order.
    const rJson = await adminGraphql(RETURNABLE_QUERY, { orderId: orderGid });
    const fulfillments = rJson?.data?.returnableFulfillments?.edges || [];
    const returnable: { id: string; quantity: number }[] = [];
    for (const fEdge of fulfillments) {
      const liEdges = fEdge?.node?.returnableFulfillmentLineItems?.edges || [];
      for (const liEdge of liEdges) {
        const id = liEdge?.node?.fulfillmentLineItem?.id;
        const qty = liEdge?.node?.quantity || 0;
        if (id && qty > 0) returnable.push({ id, quantity: qty });
      }
    }

    if (returnable.length === 0) {
      return json(
        { error: "No returnable fulfillment line items for this order", order_id },
        422,
      );
    }

    // 2. Build returnLineItems — caller-specified subset, else the whole order.
    let returnLineItems;
    if (Array.isArray(body.return_line_items) && body.return_line_items.length > 0) {
      const byId = new Map(returnable.map((r) => [r.id, r.quantity]));
      returnLineItems = body.return_line_items
        .filter((li) => byId.has(li.fulfillment_line_item_id))
        .map((li) => ({
          fulfillmentLineItemId: li.fulfillment_line_item_id,
          quantity: Math.min(li.quantity || 1, byId.get(li.fulfillment_line_item_id) || 1),
          returnReason: reason,
          ...(return_reason_note ? { returnReasonNote: String(return_reason_note).slice(0, 300) } : {}),
        }));
    } else {
      returnLineItems = returnable.map((r) => ({
        fulfillmentLineItemId: r.id,
        quantity: r.quantity,
        returnReason: reason,
        ...(return_reason_note ? { returnReasonNote: String(return_reason_note).slice(0, 300) } : {}),
      }));
    }

    if (returnLineItems.length === 0) {
      return json({ error: "No matching returnable line items to return", order_id }, 422);
    }

    // 3. Create the native Shopify Return (no label — deferred to the merchant).
    const cJson = await adminGraphql(RETURN_CREATE_MUTATION, {
      input: {
        orderId: orderGid,
        returnLineItems,
        notifyCustomer: notify !== false,
      },
    });

    const userErrors = cJson?.data?.returnCreate?.userErrors || [];
    if (userErrors.length) {
      return json({ error: "returnCreate failed", userErrors }, 422);
    }

    const ret = cJson?.data?.returnCreate?.return;
    const reverseFulfillmentOrderId =
      ret?.reverseFulfillmentOrders?.edges?.[0]?.node?.id || null;

    return json(
      {
        ok: true,
        order_id,
        shopify_return_id: ret?.id || null,
        status: ret?.status || null,
        reverse_fulfillment_order_id: reverseFulfillmentOrderId,
        label_source: "merchant_shopify",
        label_pending: true,
      },
      200,
    );
  } catch (e: unknown) {
    return json(
      { error: e instanceof Error ? e.message : "Shopify returnCreate failed" },
      502,
    );
  }
};
