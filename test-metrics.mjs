const order = {
  createdAt: new Date().toISOString(),
  totalPriceSet: { shopMoney: { amount: "19.95" } },
  tags: ["INK-Premium-Delivery"],
  metafields: { edges: [] },
  lineItems: { edges: [] },
  shippingLine: { title: "Standard" }
};

function isInkProtected(order) {
  const metafields = {};
  order.metafields?.edges?.forEach((mfEdge) => {
    metafields[mfEdge.node.key] = mfEdge.node.value;
  });

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

  return hasInkTag || hasDeliveryTypeMetafield || hasInkMetafield || hasInkLineItem || hasInkShipping;
}

const now = new Date();
const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

let currentCount = 0;
let currentTotalValue = 0;
let prevCount = 0;
let prevTotalValue = 0;

const edges = [{ node: order }];
let debugProtectedOrders = 0;

edges.forEach((edge) => {
  const order = edge.node;
  if (!isInkProtected(order)) return;
  debugProtectedOrders++;

  const orderDate = new Date(order.createdAt);
  const amount = parseFloat(order.totalPriceSet.shopMoney.amount) || 0;

  if (orderDate >= thirtyDaysAgo) {
    currentCount++;
    currentTotalValue += amount;
  } else if (orderDate >= sixtyDaysAgo && orderDate < thirtyDaysAgo) {
    prevCount++;
    prevTotalValue += amount;
  }
});

console.log(JSON.stringify({ currentCount, currentTotalValue, debugProtectedOrders }, null, 2));
