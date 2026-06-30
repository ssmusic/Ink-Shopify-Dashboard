import { type ActionFunctionArgs } from "react-router";

// POST /api/return-status — the "back" half of returns back-and-forth.
//
// When a Parallel/INK return changes state, the backend (Alan) calls this
// endpoint server-to-server and we write the status back onto the Shopify
// order: a lifecycle tag + the `ink.return_status` / `ink.return_id`
// metafields. This is the same tagsAdd + metafieldsSet pattern the
// orders/create webhook already uses, and the same offline-session → admin
// GraphQL pattern api.enroll.tsx uses — no new Shopify surface.
//
// Scope note: this writes STATUS back (tag + metafield), which is decision-
// free. It deliberately does NOT execute a refund or restock — those depend
// on the open "where do refunds execute" decision. Wire those here once that
// is settled (refundCreate / inventory adjust).
//
// Trigger (RELAY TO ALAN): Alan's return lifecycle must POST here on state
// change with { shop_domain, order_id, return_status, return_id }, including
// the shared secret header. The proof carries order_id + merchant_id; Alan
// needs the shop_domain (store it on the proof, or keep a merchant_id↔domain
// map) so we can load that store's offline session.

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

const TAG_MUTATION = `
mutation AddOrderTag($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) {
    userErrors { field message }
  }
}
`;

const METAFIELD_MUTATION = `
mutation SetInkMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    userErrors { field message }
  }
}
`;

// Return lifecycle → an order tag. Tags accumulate, giving the merchant an
// audit trail directly on the Shopify order.
const STATUS_TAG: Record<string, string> = {
  INITIATED: "INK-Return-Initiated",
  PASSPORT_GENERATED: "INK-Return-CodeReady",
  LABEL_GENERATED: "INK-Return-CodeReady",
  DROPPED_OFF: "INK-Return-DroppedOff",
  IN_TRANSIT: "INK-Return-InTransit",
  COMPLETED: "INK-Return-Completed",
  CANCELLED: "INK-Return-Cancelled",
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Server-to-server auth — Alan's backend calls this with a shared secret.
  // Prefer a dedicated secret; fall back to the existing admin secret.
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
    return_status?: string;
    return_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { shop_domain, order_id, return_status, return_id } = body || {};
  if (!shop_domain || !order_id || !return_status) {
    return json(
      { error: "Missing required fields: shop_domain, order_id, return_status" },
      400,
    );
  }

  const { getOfflineSession } = await import("../session-utils.server");
  const session = await getOfflineSession(shop_domain);
  if (!session) {
    return json({ error: `No offline session for shop ${shop_domain}` }, 404);
  }

  // Accept either a numeric/string order id or a full GID.
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
    return (await resp.json()) as {
      data?: {
        tagsAdd?: { userErrors?: { field: string; message: string }[] };
        metafieldsSet?: { userErrors?: { field: string; message: string }[] };
      };
    };
  };

  const status = String(return_status).toUpperCase();
  const tag = STATUS_TAG[status] || `INK-Return-${status}`;
  const errors: unknown[] = [];

  try {
    const tagJson = await adminGraphql(TAG_MUTATION, { id: orderGid, tags: [tag] });
    const tagErr = tagJson?.data?.tagsAdd?.userErrors;
    if (tagErr && tagErr.length) errors.push({ tagsAdd: tagErr });

    const metaJson = await adminGraphql(METAFIELD_MUTATION, {
      metafields: [
        {
          ownerId: orderGid,
          namespace: "ink",
          key: "return_status",
          type: "single_line_text_field",
          value: String(return_status),
        },
        ...(return_id
          ? [
              {
                ownerId: orderGid,
                namespace: "ink",
                key: "return_id",
                type: "single_line_text_field",
                value: String(return_id),
              },
            ]
          : []),
      ],
    });
    const metaErr = metaJson?.data?.metafieldsSet?.userErrors;
    if (metaErr && metaErr.length) errors.push({ metafieldsSet: metaErr });
  } catch (e: unknown) {
    return json(
      { error: e instanceof Error ? e.message : "Shopify writeback failed" },
      502,
    );
  }

  return json({ ok: errors.length === 0, order_id, return_status, tag, errors }, 200);
};
