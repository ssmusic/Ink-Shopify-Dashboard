import { type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Fetch the latest 50 orders to filter for eligibility (similar to shipments page)
  const query = `#graphql
    query GetRecentOrders {
      orders(first: 50, reverse: true) {
        edges {
          node {
            id name createdAt displayFinancialStatus displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            customer {
              firstName lastName email
            }
            tags
            metafields(namespace: "ink", first: 10) {
              edges { node { key value } }
            }
            lineItems(first: 20) {
              edges {
                node {
                  title quantity sku
                  originalUnitPriceSet { shopMoney { amount } }
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

  try {
    const response = await admin.graphql(query);
    const data = await response.json();

    if (!data?.data?.orders) {
      return json({ activities: [] });
    }

    const allOrders = data.data.orders.edges.map((edge: any) => {
      const order = edge.node;
      const numericId = order.id.replace("gid://shopify/Order/", "");

      const metafields: Record<string, string> = {};
      order.metafields?.edges?.forEach((mfEdge: any) => {
        metafields[mfEdge.node.key] = mfEdge.node.value;
      });

      // Eligibility Logic (matching app.tagged-shipments._index.tsx)
      const hasInkTag =
        order.tags?.includes("INK-Premium-Delivery") ||
        order.tags?.includes("INK-Verified-Delivery");
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

      const isInkOrder =
        hasInkTag ||
        hasDeliveryTypeMetafield ||
        hasInkMetafield ||
        hasInkLineItem ||
        hasInkShipping;

      if (!isInkOrder) return null;

      const verificationStatus = (
        metafields.verification_status || "pending"
      ).toLowerCase();

      return {
        orderNumber: order.name,
        customer: order.customer
          ? `${order.customer.firstName} ${order.customer.lastName}`
          : "Guest",
        date: new Date(order.createdAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        amount: `${order.totalPriceSet.shopMoney.currencyCode} ${order.totalPriceSet.shopMoney.amount}`,
        status: verificationStatus === "active" ? "enrolled" : verificationStatus,
      };
    }).filter(Boolean);

    // Return only the last 5
    return json({ activities: allOrders.slice(0, 5) });
  } catch (err) {
    console.error("Recent Activity API Error:", err);
    return json({ activities: [], error: "Failed to fetch activities" }, { status: 500 });
  }
};
