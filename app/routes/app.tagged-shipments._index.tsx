import { useState, useEffect, useCallback } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getMerchant } from "../services/merchant.server";
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
      orders(first: 50, reverse: true) {
        edges {
          node {
            id name createdAt displayFinancialStatus displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            customer {
              firstName lastName email
              defaultAddress { address1 city provinceCode zip }
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

  let response;
  try {
    response = await admin.graphql(query);
  } catch (err) {
    if (err instanceof Response) throw err;
    console.error("❌ GraphQL call failed in tagged-shipments index:", err);
    return { orders: [], error: "Failed to fetch orders" };
  }

  const data = await response.json();
  if (!data?.data?.orders) return { orders: [], error: "Failed to fetch orders" };

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
      customerAddress: order.customer?.defaultAddress,
      date: new Date(order.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
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
  active: { tone: "info", label: "Active" },
  verified: { tone: "success", label: "Active" },
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
    {
      id: "active",
      content: `Active (${counts?.active || 0})`,
      panelID: "active",
    },
    {
      id: "verified",
      content: `Active (${counts?.verified || 0})`,
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
