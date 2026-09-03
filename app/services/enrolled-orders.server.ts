// The enrolled-orders read, lifted verbatim from the old Shipments page
// (app.tagged-shipments._index) so the Home page can show the same rows. The
// eligibility heuristics and status words are unchanged on purpose: this is a
// relocation, not a rewrite — every order the old table showed, Home shows.
//
// NEVER throws on a failed GraphQL call. The caller is a COMPONENT route; a
// re-thrown reauthorize Response there renders the "200 error page" Shopify
// rejected (app/contracts/route-contracts.test.ts). Degrade to an empty list.

export type EnrolledOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  date: string;
  total: string;
  currency: string;
  status: string;
  rawStatus: string;
};

export type EnrolledOrders = {
  orders: EnrolledOrder[];
  counts: { all: number; enrolled: number; verified: number; expired: number };
  error?: string;
};

const EMPTY: EnrolledOrders = { orders: [], counts: { all: 0, enrolled: 0, verified: 0, expired: 0 } };

export async function loadEnrolledOrders(admin: any, first = 25): Promise<EnrolledOrders> {
  const query = `#graphql
    query HomeOrders($first: Int!) {
      shop { ianaTimezone }
      orders(first: $first, reverse: true) {
        edges {
          node {
            id name createdAt
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { firstName lastName email }
            tags
            metafields(namespace: "ink", first: 10) { edges { node { key value } } }
            lineItems(first: 20) { edges { node { title customAttributes { key value } } } }
            shippingLine { title }
          }
        }
      }
    }
  `;

  let data: any;
  try {
    const response = await admin.graphql(query, { variables: { first } });
    data = await response.json();
  } catch (err) {
    console.error("[home] orders query failed:", err);
    return { ...EMPTY, error: "Failed to fetch orders" };
  }
  if (!data?.data?.orders) return { ...EMPTY, error: "Failed to fetch orders" };

  // The MERCHANT'S timezone, not Cloud Run's UTC — an order at 5:30pm PT is
  // not "tomorrow".
  const shopTz: string = data?.data?.shop?.ianaTimezone || "America/Los_Angeles";

  const all: (EnrolledOrder & { isEligible: boolean })[] = data.data.orders.edges.map((edge: any) => {
    const order = edge.node;
    const metafields: Record<string, string> = {};
    order.metafields?.edges?.forEach((e: any) => { metafields[e.node.key] = e.node.value; });

    const hasInkTag = order.tags?.includes("INK-Premium-Delivery") || order.tags?.includes("INK-Verified-Delivery");
    const shippingTitle = (order.shippingLine?.title || "").toLowerCase();
    const hasInkShipping =
      shippingTitle.includes("ink. verified delivery") || shippingTitle.includes("ink verified") || shippingTitle.includes("verified delivery");
    let hasInkLineItem = false;
    for (const li of order.lineItems?.edges || []) {
      const title = (li.node?.title || "").toLowerCase();
      if (title.includes("ink delivery") || title.includes("ink protected") || title.includes("ink premium") || title.includes("verified delivery")) { hasInkLineItem = true; break; }
      for (const attr of li.node?.customAttributes || []) if (attr.key === "_ink_premium_fee" && attr.value === "true") { hasInkLineItem = true; break; }
    }
    const isEligible = Boolean(
      hasInkTag || metafields.delivery_type === "premium" || metafields.ink_premium_order === "true" || hasInkLineItem || hasInkShipping,
    );
    const rawStatus = (metafields.verification_status || "pending").toLowerCase();

    return {
      id: order.id.replace("gid://shopify/Order/", ""),
      orderNumber: order.name,
      customerName: order.customer ? `${order.customer.firstName ?? ""} ${order.customer.lastName ?? ""}`.trim() || "Guest" : "Guest",
      customerEmail: order.customer?.email || "",
      date: new Date(order.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: shopTz }),
      total: order.totalPriceSet.shopMoney.amount,
      currency: order.totalPriceSet.shopMoney.currencyCode,
      status: rawStatus === "active" ? "enrolled" : rawStatus,
      rawStatus,
      isEligible,
    };
  });

  const orders = all.filter((o) => o.isEligible).map(({ isEligible: _e, ...o }) => o);
  return {
    orders,
    counts: {
      all: orders.length,
      enrolled: orders.filter((o) => o.status === "enrolled").length,
      verified: orders.filter((o) => o.status === "verified").length,
      expired: orders.filter((o) => o.status === "expired").length,
    },
  };
}
