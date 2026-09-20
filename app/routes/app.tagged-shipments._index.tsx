import { boundary } from "@shopify/shopify-app-react-router/server";
import { useState, useEffect, useCallback } from "react";
import { useLoaderData, useRevalidator, useRouteError, type HeadersFunction } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { enrollOrder } from "../services/ink-api.server";
import {
  Page,
  IndexTable,
  Tabs,
  Badge,
  Text,
  TextField,
  Button,
  InlineStack,
  BlockStack,
} from "@shopify/polaris";
import type { BadgeProps } from "@shopify/polaris";
import { SearchIcon, RefreshIcon } from "@shopify/polaris-icons";
import { ChevronDown } from "lucide-react";
import PolarisAppLayout from "../components/PolarisAppLayout";
import OrderExpandedRow from "../components/OrderExpandedRow";
import OrderDetailView from "../components/OrderDetailView";
import AppLayout from "../components/AppLayout";

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

// ─────────────────────────────────────────────
// Loader
// ─────────────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const query = `#graphql
    query GetOrders {
      shop { ianaTimezone }
      orders(first: 50, reverse: true) {
        edges {
          node {
            id name createdAt displayFinancialStatus displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            customer {
              firstName lastName email
            }
            shippingAddress { address1 city provinceCode zip }
            billingAddress { address1 city provinceCode zip }
            tags
            metafields(namespace: "ink", first: 10) {
              edges { node { key value } }
            }
            lineItems(first: 20) {
              edges {
                node {
                  title quantity sku
                  originalUnitPriceSet { shopMoney { amount } }
                  image { url }
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

  // NEVER re-throw here. See app.settings.tsx for the full account: when a call
  // cannot be authorised, @shopify/shopify-app-react-router THROWS a Response
  // with status 200 and X-Shopify-API-Request-Failure-Reauthorize headers for
  // App Bridge to intercept. This route has a default export, so on a
  // client-side navigation React Router turbo-stream-encodes that throw as an
  // ErrorResponse (react-router staticContextToResponse) — the reauthorize
  // headers are dropped from the HTTP response, App Bridge never sees them, and
  // the page renders `error.status`: a screen whose entire body is the text
  // "200". That is the exact failure the App Store reviewer reported on
  // Settings, and Tagged Shipments is the second-most linked destination in the
  // app, so it could have produced the same rejection.
  //
  // Bubbling is only correct from a RESOURCE route (no default export, no
  // ErrorBoundary) — there staticHandler.query returns the Response untouched
  // and App Bridge's patched fetch does see the headers. That is why the
  // app.api.* routes keep their `throw err` and this one must not.
  //
  // The fallback below already exists, so a failed query costs the order list
  // instead of the page.
  let response;
  try {
    response = await admin.graphql(query);
  } catch (err) {
    console.error("❌ GraphQL call failed in tagged-shipments index:", err);
    return { orders: [], error: "Failed to fetch orders" };
  }

  const data = await response.json();
  if (!data?.data?.orders) return { orders: [], error: "Failed to fetch orders" };

  // Format order dates in the MERCHANT'S store timezone, not the Cloud Run
  // server's UTC. Without this, an order placed at 5:30pm PT (00:30 UTC) renders
  // as the next calendar day. Falls back to America/Los_Angeles if unavailable.
  const shopTz: string = data?.data?.shop?.ianaTimezone || "America/Los_Angeles";

  const allOrders = data.data.orders.edges.map((edge: any) => {
    const order = edge.node;
    const numericId = order.id.replace("gid://shopify/Order/", "");

    const metafields: Record<string, string> = {};
    order.metafields?.edges?.forEach((mfEdge: any) => {
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

    const isInkOrder =
      hasInkTag ||
      hasDeliveryTypeMetafield ||
      hasInkMetafield ||
      hasInkLineItem ||
      hasInkShipping;

    const verificationStatus = (
      metafields.verification_status || "pending"
    ).toLowerCase();

    const items =
      order.lineItems?.edges?.map((li: any) => ({
        title: li.node.title,
        quantity: li.node.quantity,
        price: li.node.originalUnitPriceSet?.shopMoney?.amount || "0.00",
        sku: li.node.sku || "",
      })) || [];

    const subtotal = items.reduce(
      (sum: number, item: any) =>
        sum + parseFloat(item.price) * item.quantity,
      0
    );

    return {
      id: numericId,
      orderNumber: order.name,
      customerName: order.customer
        ? `${order.customer.firstName} ${order.customer.lastName}`
        : "Guest",
      customerEmail: order.customer?.email || "",
      // THIS order's ship-to, falling back to the billing address when there's
      // no shipping address (pickup / billing-only orders). NEVER the customer's
      // saved default — that leaks a stale/previous address onto a new order.
      customerAddress: order.shippingAddress ?? order.billingAddress,
      date: new Date(order.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: shopTz,
      }),
      total: order.totalPriceSet.shopMoney.amount,
      subtotal: subtotal.toFixed(2),
      currency: order.totalPriceSet.shopMoney.currencyCode,
      status:
        verificationStatus === "active" ? "enrolled" : verificationStatus,
      rawStatus: verificationStatus,
      isEligible: isInkOrder,
      items,
      metafields,
    };
  });

  const eligibleOrders = allOrders.filter((o: any) => o.isEligible);

  const counts = {
    all: eligibleOrders.length,
    enrolled: eligibleOrders.filter((o: any) => o.status === "enrolled")
      .length,
    cooldown: eligibleOrders.filter((o: any) => o.status === "cooldown")
      .length,
    active: eligibleOrders.filter((o: any) => o.status === "active").length,
    verified: eligibleOrders.filter((o: any) => o.status === "verified")
      .length,
    expired: eligibleOrders.filter((o: any) => o.status === "expired").length,
  };

  return { orders: eligibleOrders, counts };
};

// ─────────────────────────────────────────────
// Status badge config
// ─────────────────────────────────────────────
const statusBadgeProps: Record<
  string,
  { tone: BadgeProps["tone"]; label: string }
> = {
  enrolled: { tone: "warning", label: "Enrolled" },
  // `active` is remapped to `enrolled` before it ever reaches a badge (see the
  // loader), so this entry is unreachable today. Kept as a defensive default
  // in case a raw status ever surfaces — but it must NOT share a word with
  // `verified`, which is what produced two badges reading "Active".
  active: { tone: "info", label: "Enrolled" },
  // WAS ALSO "Active". Two distinct states wearing one word means a merchant
  // cannot tell them apart, and the filter bar rendered "Active (0)" beside
  // "Active (3)" (TECH_BIBLE law 5: no two causes share a sentence).
  // "Verified" is the word the dashboard already uses for this state.
  verified: { tone: "success", label: "Verified" },
  expired: { tone: undefined, label: "Expired" },
  cooldown: { tone: "attention", label: "Cooldown" },
  pending: { tone: undefined, label: "Pending" },
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function ShipmentsIndex() {
  const { orders, counts } = useLoaderData() as any;
  const { revalidate } = useRevalidator();

  const [queryValue, setQueryValue] = useState("");
  const [selected, setSelected] = useState(0);
  const [sortValue, setSortValue] = useState("new");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  // Auto-refresh every 30s — revalidate re-runs the loader without losing App Bridge session
  useEffect(() => {
    const interval = setInterval(() => {
      revalidate();
    }, 30000);
    return () => clearInterval(interval);
  }, [revalidate]);

  const tabs = [
    { id: "all", content: `All (${counts?.all || 0})`, panelID: "all" },
    {
      id: "enrolled",
      content: `Enrolled (${counts?.enrolled || 0})`,
      panelID: "enrolled",
    },
    // The "Active" tab is GONE, not renamed. Its count filtered
    // `status === "active"`, but the loader rewrites "active" to "enrolled"
    // before the counts run — so it was structurally always 0 and could never
    // be anything else. A filter that can only ever say (0) is not a filter,
    // and it sat directly beside a second tab also called "Active".
    {
      id: "verified",
      content: `Verified (${counts?.verified || 0})`,
      panelID: "verified",
    },
    {
      id: "expired",
      content: `Expired (${counts?.expired || 0})`,
      panelID: "expired",
    },
  ];

  const statusFilterKey = tabs[selected]?.id || "all";

  const filteredOrders = (orders || []).filter((order: any) => {
    if (statusFilterKey !== "all" && order.status !== statusFilterKey)
      return false;
    if (!queryValue) return true;
    const q = queryValue.toLowerCase();
    return (
      order.orderNumber.toLowerCase().includes(q) ||
      order.customerName.toLowerCase().includes(q) ||
      order.customerEmail.toLowerCase().includes(q)
    );
  });

  const sortedOrders = [...filteredOrders].sort((a: any, b: any) => {
    if (sortValue === "new")
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  const handleRowClick = useCallback((orderId: string) => {
    setExpandedOrder((prev) => (prev === orderId ? null : orderId));
  }, []);

  const handleRefresh = useCallback(() => {
    revalidate();
  }, [revalidate]);

  // Auto-retry if the page loaded blank (App Bridge hydration race on first open)
  // Uses revalidate() to preserve the App Bridge session context
  useEffect(() => {
    if (!orders || orders.length === 0) {
      const timer = setTimeout(() => {
        const key = "ink_shipments_retried";
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          revalidate();
        }
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      sessionStorage.removeItem("ink_shipments_retried");
    }
  }, [orders, revalidate]);

  const resourceName = { singular: "shipment", plural: "shipments" };

  // Full-page detail view
  if (selectedOrder) {
    return (
      <AppLayout pageTitle={selectedOrder.orderNumber}>
        <OrderDetailView
          order={selectedOrder}
          onBack={() => setSelectedOrder(null)}
        />
      </AppLayout>
    );
  }

  const tableRows = sortedOrders.flatMap((order: any, index: number) => {
    const isExpanded = expandedOrder === order.id;
    const badgeConfig =
      statusBadgeProps[order.status] || { tone: undefined, label: order.status };

    const row = (
      <IndexTable.Row
        id={order.id}
        key={order.id}
        position={index}
        onClick={() => handleRowClick(order.id)}
        selected={false}
      >
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="semibold" as="span">
            {order.orderNumber}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div>
            <Text variant="bodyMd" as="span">
              {order.customerName}
            </Text>
            <br />
            <Text variant="bodySm" tone="subdued" as="span">
              {order.customerEmail}
            </Text>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {order.date}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span" alignment="end">
            {parseFloat(order.total).toLocaleString("en-US", {
              style: "currency",
              currency: order.currency,
            })}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={badgeConfig.tone}>{badgeConfig.label}</Badge>
        </IndexTable.Cell>
      </IndexTable.Row>
    );

    if (isExpanded) {
      const expandedRow = (
        <tr key={`${order.id}-expanded`}>
          <td colSpan={5} style={{ padding: 0 }}>
            <OrderExpandedRow
              order={order}
              onCollapse={() => setExpandedOrder(null)}
              onViewFull={() => setSelectedOrder(order)}
            />
          </td>
        </tr>
      );
      return [row, expandedRow];
    }

    return [row];
  });

  return (
    <PolarisAppLayout>
      <Page title="Shipments">
        <BlockStack gap="400">
          {/* Search */}
          <TextField
            label=""
            labelHidden
            placeholder="Search by order number, customer, email..."
            value={queryValue}
            onChange={setQueryValue}
            prefix={<SearchIcon />}
            autoComplete="off"
            clearButton
            onClearButtonClick={() => setQueryValue("")}
          />

          {/* Sort + Refresh */}
          <InlineStack align="space-between" blockAlign="center">
            {/* Compact sort control — Polaris Select is too large */}
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--p-color-text-secondary)" }}>
              Sort
              <select
                value={sortValue}
                onChange={(e) => setSortValue(e.target.value)}
                style={{
                  fontSize: "13px",
                  padding: "4px 28px 4px 8px",
                  border: "1px solid var(--p-color-border)",
                  borderRadius: "6px",
                  background: "var(--p-color-bg-surface)",
                  color: "var(--p-color-text)",
                  appearance: "none",
                  WebkitAppearance: "none",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 8px center",
                  cursor: "pointer",
                }}
              >
                <option value="new">Newest</option>
                <option value="old">Oldest</option>
              </select>
            </label>
            <Button icon={RefreshIcon} size="slim" onClick={handleRefresh}>
              Refresh
            </Button>
          </InlineStack>

          {/* Tabs + Table */}
          <Tabs tabs={tabs} selected={selected} onSelect={setSelected}>
            {/* Desktop Table */}
            <div className="hidden lg:block">
              <IndexTable
                resourceName={resourceName}
                itemCount={sortedOrders.length}
                // A FRESH INSTALL HAS NO SHIPMENTS, AND THAT IS ONE OF THE
                // FIRST SCREENS A REVIEWER SEES. Without this, Polaris renders
                // the column headings over blank space — "Order · Customer ·
                // Date" and nothing beneath — which reads as a page that
                // failed to load, not as an account with no orders yet.
                // Observed on the live app 2026-08-02.
                emptyState={
                  <div style={{ padding: "40px 20px", textAlign: "center" }}>
                    <BlockStack gap="200" inlineAlign="center">
                      <Text as="h3" variant="headingSm">
                        No shipments yet
                      </Text>
                      <Text as="p" tone="subdued">
                        Orders enroll automatically as they come in. When your
                        next one ships, it appears here with its page and its
                        delivery status.
                      </Text>
                    </BlockStack>
                  </div>
                }
                headings={[
                  { title: "Order" },
                  { title: "Customer" },
                  { title: "Date" },
                  { title: "Total", alignment: "end" },
                  { title: "Status" },
                ]}
                selectable={false}
              >
                {tableRows}
              </IndexTable>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-2 pt-2">
              {sortedOrders.map((order: any) => {
                const isExpanded = expandedOrder === order.id;
                const badgeConfig =
                  statusBadgeProps[order.status] || {
                    tone: undefined,
                    label: order.status,
                  };
                return (
                  <div key={order.id}>
                    <div
                      className={`bg-card border cursor-pointer transition-colors ${
                        isExpanded
                          ? "border-foreground"
                          : "border-border hover:bg-secondary"
                      }`}
                      onClick={() => handleRowClick(order.id)}
                    >
                      <div
                        className={`px-4 py-3 ${isExpanded ? "bg-muted" : ""}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-foreground">
                              {order.orderNumber}
                            </span>
                            <Badge tone={badgeConfig.tone}>
                              {badgeConfig.label}
                            </Badge>
                          </div>
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-foreground">
                            {order.customerName}
                          </span>
                          <span className="font-medium text-foreground">
                            {parseFloat(order.total).toLocaleString("en-US", {
                              style: "currency",
                              currency: order.currency,
                            })}
                          </span>
                        </div>
                        <time
                          className="text-xs text-muted-foreground"
                          dateTime={order.date}
                        >
                          {order.date}
                        </time>
                      </div>
                    </div>
                    {isExpanded && (
                      <OrderExpandedRow
                        order={order}
                        onCollapse={() => setExpandedOrder(null)}
                        onViewFull={() => setSelectedOrder(order)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </Tabs>
        </BlockStack>
      </Page>
    </PolarisAppLayout>
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
