import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError, type HeadersFunction } from "react-router";
import { authenticate } from "../shopify.server";
import { assertDevRoutesEnabled } from "../flags.server";

/**
 * Manual script to tag existing orders with INK Premium Delivery shipping method
 * Run this once to fix orders created before the webhook was updated
 */

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

export async function action({ request }: any) {
  assertDevRoutesEnabled();
  const { admin } = await authenticate.admin(request);

  console.log("🔍 Searching for orders with INK Premium Delivery shipping method...");

  // Query recent orders
  const query = `
    query {
      orders(first: 50, reverse: true, query: "fulfillment_status:unfulfilled OR fulfillment_status:fulfilled") {
        edges {
          node {
            id
            name
            tags
            shippingLine {
              title
            }
            metafields(namespace: "ink", first: 5) {
              edges {
                node {
                  key
                  value
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await admin.graphql(query);
  const data = await response.json();

  let taggedCount = 0;

  for (const edge of data.data.orders.edges) {
    const order = edge.node;
    const shippingTitle = (order.shippingLine?.title || "").toLowerCase();

    // Check if this order has INK Premium Delivery
    if (
      shippingTitle.includes("ink premium") ||
      shippingTitle.includes("ink verified") ||
      shippingTitle.includes("ink. verified") ||
      shippingTitle.includes("ink. Verified") ||
      shippingTitle.includes("ink delivery")
    ) {
      // Check if already tagged
      const hasTag = order.tags?.includes("INK-Premium-Delivery");

      if (!hasTag) {
        console.log(`📦 Found order ${order.name} with INK Premium Delivery - adding tag...`);

        // Add tag
        await admin.graphql(TAG_MUTATION, {
          variables: {
            id: order.id,
            tags: ["INK-Premium-Delivery"],
          },
        });

        // Add metafields
        await admin.graphql(METAFIELD_MUTATION, {
          variables: {
            metafields: [
              {
                ownerId: order.id,
                namespace: "ink",
                key: "delivery_type",
                type: "single_line_text_field",
                value: "premium",
              },
              {
                ownerId: order.id,
                namespace: "ink",
                key: "verification_status",
                type: "single_line_text_field",
                value: "pending",
              },
            ],
          },
        });

        console.log(`✅ Tagged order ${order.name}`);
        taggedCount++;
      } else {
        console.log(`⏭️  Order ${order.name} already tagged`);
      }
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `Tagged ${taggedCount} orders`,
      taggedCount,
    }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
}

// EVERY EMBEDDED ROUTE NEEDS SHOPIFY'S BOUNDARY.
// When a session needs re-auth, @shopify/shopify-app-react-router THROWS a
// Response with status 200 carrying X-Shopify-API-Request-Failure-Reauthorize
// headers, for App Bridge to intercept. Without boundary.error(), React Router
// treats it as a route error response and renders its STATUS — a page whose
// entire body is the text "200". That is Shopify rejection 2.1.1, round two:
// "going to the billing section and navigating back ... shows an 200 error
// page". Billing had this block; /app/settings, its own backAction target, did
// not. `headers` matters too: boundary.headers forwards the reauthorize
// headers App Bridge is waiting for.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
