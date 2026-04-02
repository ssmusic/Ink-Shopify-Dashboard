import { type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getOfflineSession } from "../session-utils.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Requested-With, Origin, X-Client-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

export const action = async ({ request }: any) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
};

// Helper to determine if an order matches INK tracking logic
function isInkProtected(order: any) {
  const hasInkTag =
    order.tags?.includes("INK-Premium-Delivery") ||
    order.tags?.includes("INK-Verified-Delivery");

  // Correctly flatten the Shopify GraphQL metafields edges array into a simple JS Object
  const metafields: Record<string, string> = {};
  if (order.metafields?.edges) {
    order.metafields.edges.forEach((mfEdge: any) => {
      metafields[mfEdge.node.key] = mfEdge.node.value;
    });
  }

  const hasDeliveryTypeMetafield = metafields.delivery_type === "premium";
  const hasInkMetafield = metafields.ink_premium_order === "true";
  const shippingTitle = (order.shippingLine?.title || "").toLowerCase();
  const hasInkShipping =
    shippingTitle.includes("ink. verified delivery") ||
    shippingTitle.includes("ink verified") ||
    shippingTitle.includes("verified delivery");

  let hasInkLineItem = false;
  for (const lineItem of order.lineItems?.edges || []) {
    const title = (lineItem.node?.title || "").toLowerCase();
    if (
      title.includes("ink delivery") ||
      title.includes("ink protected") ||
      title.includes("ink premium") ||
      title.includes("verified delivery")
    ) {
      hasInkLineItem = true;
      break;
    }
    for (const attr of lineItem.node?.customAttributes || []) {
      if (attr.key === "_ink_premium_fee" && attr.value === "true") {
        hasInkLineItem = true;
        break;
      }
    }
  }

  return hasInkTag || hasDeliveryTypeMetafield || hasInkMetafield || hasInkLineItem || hasInkShipping;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  let graphqlClient: any = null;

  try {
    const authHeader = request.headers.get("Authorization");
    const clientType = request.headers.get("X-Client-Type");
    
    if (clientType === "PWA" && authHeader?.startsWith("Bearer ")) {
      // 1. Authenticate user from PWA JWT token
      const token = authHeader.slice(7);
      const payloadBase64 = token.split(".")[1];
      const decoded = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
      const shopDomain = decoded.shop || decoded.shop_id || decoded.merchant_id;

      if (!shopDomain) {
        return new Response(JSON.stringify({ error: "Store context missing from token" }), { status: 401, headers: CORS_HEADERS });
      }

      const session = await getOfflineSession(shopDomain);
      if (!session) {
        return new Response(JSON.stringify({ error: `No session available` }), { status: 404, headers: CORS_HEADERS });
      }

      graphqlClient = {
        graphql: async (query: string, options?: any) => {
          const response = await fetch(`https://${session.shop}/admin/api/2024-10/graphql.json`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": session.accessToken,
            },
            body: JSON.stringify({ query, variables: options?.variables || {} }),
          });
          return { json: async () => await response.json() };
        },
      };
    } else {
      // 2. Authenticate from Shopify embedded AppBridge (uses session cookies or AppBridge token under the hood)
      const { admin } = await authenticate.admin(request);
      graphqlClient = admin;
    }

    if (!graphqlClient) {
      throw new Error("No valid authentication found");
    }

    // Define 30-day cutoff points
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const query = `#graphql
      query GetHistoricalOrders {
        orders(first: 200, reverse: true) {
          edges {
            node {
              createdAt
              totalPriceSet { shopMoney { amount } }
              tags
              metafields(namespace: "ink", first: 10) {
                edges { node { key value } }
              }
              lineItems(first: 20) {
                edges {
                  node {
                    title
                    customAttributes { key value }
                  }
                }
              }
              shippingLine { title }
            }
          }
        }
      }
    `;

    // Fetch last 200 orders (we removed the strict tag query to find the missing edge cases)
    console.log("[Dashboard Metrics] Executing BLIND query for last 200 orders to find missing INK enrollments...");
    const response = await graphqlClient.graphql(query);

    const data = await response.json();
    console.log(`[Dashboard Metrics] GraphQL Execution Complete. Payload received:`, !!data?.data);
    
    // Check for GraphQL errors specifically!
    if (data.errors) {
       console.error("GraphQL Schema Error:", JSON.stringify(data.errors));
       return new Response(JSON.stringify({ error: `GraphQL Error: ${data.errors[0].message}` }), { status: 500, headers: CORS_HEADERS });
    }

    if (!data?.data?.orders) {
      return new Response(JSON.stringify({ 
        currentPeriod: { totalValue: -999, count: -999, aov: -999 },
        previousPeriod: { totalValue: -999, count: -999, aov: -999 },
        trends: { valueProtected: 0, enrolledCount: 0, aov: 0 },
        debugLog: `EMPTY_DATA_FALLBACK: ${JSON.stringify(data).substring(0, 50)}`
      }), { headers: CORS_HEADERS });
    }

    let currentCount = 0;
    let currentTotalValue = 0;
    let prevCount = 0;
    let prevTotalValue = 0;

    let debugTotalOrders = data.data.orders.edges.length;
    let debugProtectedOrders = 0;
    let debugThirtyDayOrders = 0;

    let dumpedOrderLogs = 0;

    console.log(`[Dashboard Metrics] Success: Fetched ${debugTotalOrders} total UNFILTERED orders from Shopify`);

    data.data.orders.edges.forEach((edge: any) => {
      const order = edge.node;
      
      // Dump the payload for the first 3 latest orders so we can visually inspect their JSON raw properties
      if (dumpedOrderLogs < 3) {
        console.log(`\n\n[Dashboard Metrics Data Tracer] DUMPING RAW ORDER ${dumpedOrderLogs + 1}:`);
        console.log(JSON.stringify(order, null, 2));
        dumpedOrderLogs++;
      }

      // We only want INK protected orders
      if (!isInkProtected(order)) {
        return;
      }
      debugProtectedOrders++;

      const orderDate = new Date(order.createdAt);
      const amount = parseFloat(order.totalPriceSet.shopMoney.amount) || 0;

      if (orderDate >= thirtyDaysAgo) {
        debugThirtyDayOrders++;
        currentCount++;
        currentTotalValue += amount;
      } else if (orderDate >= sixtyDaysAgo && orderDate < thirtyDaysAgo) {
        prevCount++;
        prevTotalValue += amount;
      }
    });

    const currentAov = currentCount > 0 ? (currentTotalValue / currentCount) : 0;
    const prevAov = prevCount > 0 ? (prevTotalValue / prevCount) : 0;

    // Calculate percentages
    const valueTrend = prevTotalValue > 0 ? ((currentTotalValue - prevTotalValue) / prevTotalValue) * 100 : (currentTotalValue > 0 ? 100 : 0);
    const countTrend = prevCount > 0 ? ((currentCount - prevCount) / prevCount) * 100 : (currentCount > 0 ? 100 : 0);
    const aovTrend = prevAov > 0 ? ((currentAov - prevAov) / prevAov) * 100 : (currentAov > 0 ? 100 : 0);

    console.log(`[Dashboard Metrics] Aggregation Complete. Total Value: $${currentTotalValue}, Count: ${currentCount}, AOV: $${currentAov}`);

    return new Response(JSON.stringify({
      currentPeriod: {
        totalValue: currentTotalValue,
        count: currentCount,
        aov: currentAov
      },
      previousPeriod: {
        totalValue: prevTotalValue,
        count: prevCount,
        aov: prevAov
      },
      trends: {
        valueProtected: valueTrend,
        enrolledCount: countTrend,
        aov: aovTrend
      },
      debugLog: `Total: ${debugTotalOrders} | Protected: ${debugProtectedOrders} | Last30: ${debugThirtyDayOrders}`
    }), { headers: CORS_HEADERS });

  } catch (err: any) {
    console.error("Auth Error in Dashboard Metrics:", err);
    return new Response(JSON.stringify({ error: "Unauthorized or missing token context: " + err.message }), { status: 200, headers: CORS_HEADERS });
  }
};
