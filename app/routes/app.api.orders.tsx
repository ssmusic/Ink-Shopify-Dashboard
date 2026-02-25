import { type LoaderFunctionArgs } from "react-router";
import firestore from "../firestore.server";
import crypto from "crypto";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    ...init,
  });

const JWT_SECRET =
  process.env.WAREHOUSE_JWT_SECRET ||
  process.env.SHOPIFY_API_SECRET ||
  "fallback-dev-secret";

// Verify our HMAC-based token from app.api.auth.login.tsx
function verifyToken(token: string): { sub: string; shop: string; email: string; name: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");

    if (signature !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ─── Shopify GraphQL helper ────────────────────────────────────────────────────
async function fetchShopifyOrders(shopDomain: string, search: string): Promise<any[]> {
  // Get the shop's active session from Firestore to find the access token
  const sessionSnapshot = await firestore
    .collection("shopify_sessions")
    .where("shop", "==", shopDomain)
    .where("isOnline", "==", false)
    .limit(1)
    .get();

  if (sessionSnapshot.empty) {
    // Try without isOnline filter (fallback)
    const fallback = await firestore
      .collection("shopify_sessions")
      .where("shop", "==", shopDomain)
      .limit(1)
      .get();

    if (fallback.empty) {
      throw new Error(`No active Shopify session found for ${shopDomain}`);
    }
    return queryShopifyOrders(shopDomain, fallback.docs[0].data().accessToken, search);
  }

  return queryShopifyOrders(shopDomain, sessionSnapshot.docs[0].data().accessToken, search);
}

async function queryShopifyOrders(shopDomain: string, accessToken: string, search: string): Promise<any[]> {
  // Fetch unfulfilled orders, optionally filtered by search term
  const queryFilter = search
    ? `query: "fulfillment_status:unfulfilled name:*${search}*"`
    : `query: "fulfillment_status:unfulfilled"`;

  const gqlQuery = `
    query GetUnfulfilledOrders {
      orders(first: 50, ${queryFilter}, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            displayFulfillmentStatus
            customer {
              displayName
              firstName
              lastName
            }
            lineItems(first: 20) {
              edges {
                node {
                  title
                  quantity
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                    }
                  }
                }
              }
            }
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            shippingAddress {
              address1
              address2
              city
              province
              zip
              country
            }
          }
        }
      }
    }
  `;

  const response = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query: gqlQuery }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(result.errors[0]?.message || "GraphQL error");
  }

  const edges = result.data?.orders?.edges || [];

  return edges.map((edge: any) => {
    const node = edge.node;
    const lineItems = node.lineItems.edges.map((e: any) => ({
      title: e.node.title,
      quantity: e.node.quantity,
      price: e.node.originalUnitPriceSet?.shopMoney?.amount || null,
    }));

    const totalItems = lineItems.reduce((sum: number, item: any) => sum + item.quantity, 0);

    // Build shipping address string
    const addr = node.shippingAddress;
    const shippingAddressStr = addr
      ? [addr.address1, addr.address2, addr.city, addr.province, addr.zip, addr.country]
          .filter(Boolean)
          .join(", ")
      : null;

    const customerName =
      node.customer?.displayName ||
      `${node.customer?.firstName || ""} ${node.customer?.lastName || ""}`.trim() ||
      "Unknown Customer";

    return {
      // Numeric ID for INK API (strip gid://shopify/Order/ prefix)
      id: node.id.replace("gid://shopify/Order/", ""),
      gid: node.id,
      name: node.name,
      createdAt: node.createdAt,
      customerName,
      items: lineItems,
      itemCount: totalItems,
      totalPrice: node.totalPriceSet?.shopMoney?.amount || "0.00",
      currencyCode: node.totalPriceSet?.shopMoney?.currencyCode || "USD",
      currencySymbol: "$",
      shippingStatus: node.displayFulfillmentStatus,
      shippingColor: "#f59e0b",
      shippingAddress: shippingAddressStr,
      // INK API order_details format
      orderDetails: {
        line_items: lineItems.map((item: any) => ({
          title: item.title,
          quantity: item.quantity,
          price: item.price,
          sku: item.sku,
        })),
        total_price: node.totalPriceSet?.shopMoney?.amount || "0.00",
        currency: node.totalPriceSet?.shopMoney?.currencyCode || "USD",
      },
    };
  });
}

// ─── CORS preflight ───────────────────────────────────────────────────────────
export const action = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
};

// ─── GET: fetch orders for a warehouse user's shop ────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Handle OPTIONS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  // 1. Verify warehouse JWT
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const shopDomain = payload.shop;
  if (!shopDomain) {
    return json({ error: "Token missing shop domain" }, { status: 401 });
  }

  // 2. Fetch real Shopify orders for this shop
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";

  try {
    const orders = await fetchShopifyOrders(shopDomain, search);
    return json({ success: true, orders, shopDomain });
  } catch (err: any) {
    console.error("[Orders API] Error:", err.message);
    return json({ error: err.message, success: false, orders: [] }, { status: 500 });
  }
};
