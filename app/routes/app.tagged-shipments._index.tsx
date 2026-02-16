import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { Search, Package, ChevronRight, Filter } from "lucide-react";

interface OrderItem {
  title: string;
  quantity: number;
}

interface Order {
  id: string;
  name: string;
  createdAt: string;
  items: OrderItem[];
  itemCount: number;
  totalPrice: string;
  currency: string;
  currencySymbol: string;
  shippingStatus: string;
  shippingColor: string;
  customerName: string;
  customerEmail: string;
  verificationStatus: string;
  isEligible: boolean;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // authenticate.admin MUST be outside try-catch so auth redirect responses propagate
  const { admin } = await authenticate.admin(request);

  try {
    const response = await admin.graphql(`
      query GetOrders {
        orders(first: 50, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              displayFinancialStatus
              displayFulfillmentStatus
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                firstName
                lastName
                email
              }
              tags
              metafields(namespace: "ink", first: 10) {
                edges {
                  node {
                    key
                    value
                  }
                }
              }
              lineItems(first: 20) {
                edges {
                  node {
                    title
                    quantity
                    customAttributes {
                      key
                      value
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);

    const data: any = await response.json();

    if (!data?.data?.orders) {
      return { orders: [], total: 0 };
    }

    const allOrders = data.data.orders.edges.map((edge: any) => {
      const order = edge.node;
      const numericId = order.id.replace("gid://shopify/Order/", "");

      const metafields: Record<string, string> = {};
      order.metafields?.edges?.forEach((mfEdge: any) => {
        metafields[mfEdge.node.key] = mfEdge.node.value;
      });

      const hasInkTag = order.tags?.includes("INK-Premium-Delivery") || order.tags?.includes("INK-Verified-Delivery");
      const hasDeliveryTypeMetafield = metafields.delivery_type === "premium";
      const hasInkMetafield = metafields.ink_premium_order === "true";

      let hasInkLineItem = false;
      for (const lineItem of order.lineItems?.edges || []) {
        const title = (lineItem.node?.title || "").toLowerCase();
        if (
          title.includes("ink delivery") ||
          title.includes("ink protected") ||
          title.includes("ink premium") ||
          title.includes("ink verified") ||
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

      const isInkOrder = hasInkTag || hasDeliveryTypeMetafield || hasInkMetafield || hasInkLineItem;
      const verificationStatus = (metafields.verification_status || "pending").toLowerCase();

      const items = order.lineItems?.edges?.map((li: any) => ({
        title: li.node.title,
        quantity: li.node.quantity,
      })) || [];

      const fulfillmentStatus = order.displayFulfillmentStatus || "";
      let shippingStatus = "STANDARD";
      let shippingColor = "gray";
      if (fulfillmentStatus.includes("Unfulfilled") || fulfillmentStatus === "") {
        const createdAt = new Date(order.createdAt);
        const now = new Date();
        const hoursOld = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        if (hoursOld < 24) {
          shippingStatus = "SHIPS TODAY";
          shippingColor = "red";
        } else if (hoursOld < 48) {
          shippingStatus = "SHIPS TOMORROW";
          shippingColor = "orange";
        }
      }

      return {
        id: numericId,
        name: order.name,
        createdAt: order.createdAt,
        items,
        itemCount: items.reduce((sum: number, item: any) => sum + item.quantity, 0),
        totalPrice: parseFloat(order.totalPriceSet.shopMoney.amount).toFixed(2),
        currency: order.totalPriceSet.shopMoney.currencyCode,
        currencySymbol: order.totalPriceSet.shopMoney.currencyCode === "USD" ? "$" : order.totalPriceSet.shopMoney.currencyCode,
        shippingStatus,
        shippingColor,
        customerName: order.customer
          ? `${order.customer.firstName} ${order.customer.lastName}`
          : "Guest",
        customerEmail: order.customer?.email || "",
        verificationStatus,
        isEligible: isInkOrder,
      };
    });

    const eligibleOrders = allOrders.filter((order: any) => order.isEligible);

    return { orders: eligibleOrders, total: eligibleOrders.length };
  } catch (error: any) {
    // Re-throw Response objects (auth redirects from Shopify library)
    if (error instanceof Response) {
      throw error;
    }
    console.error("❌ Error fetching orders:", error);
    return { orders: [], total: 0 };
  }
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "verified":
      return { label: "VERIFIED", className: "ink-badge-success" };
    case "enrolled":
      return { label: "ENROLLED", className: "ink-badge-warning" };
    case "pending":
    default:
      return { label: "PENDING", className: "ink-badge-pending" };
  }
}

export default function TaggedShipments() {
  const { orders, total } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredOrders = (orders as Order[]).filter((order) => {
    const matchesSearch = !searchQuery ||
      order.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.items.some((item) => item.title.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === "all" || order.verificationStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div style={{ padding: "32px 24px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "2.25rem",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          marginBottom: "8px",
        }}>
          Tagged Shipments
        </h1>
        <p style={{ color: "#666", fontSize: "15px" }}>
          {total} order{total !== 1 ? "s" : ""} with INK delivery tags
        </p>
      </div>

      {/* Search & Filter Bar */}
      <div style={{
        display: "flex",
        gap: "12px",
        marginBottom: "24px",
        flexWrap: "wrap",
      }}>
        <div style={{
          flex: 1,
          minWidth: "200px",
          position: "relative",
        }}>
          <Search style={{
            position: "absolute",
            left: "14px",
            top: "50%",
            transform: "translateY(-50%)",
            width: 16,
            height: 16,
            color: "#999",
          }} />
          <input
            type="text"
            placeholder="Search orders, customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px 10px 42px",
              border: "1px solid #e5e5e5",
              fontSize: "14px",
              backgroundColor: "#fff",
              outline: "none",
              boxSizing: "border-box" as const,
            }}
          />
        </div>

        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "6px" }}>
          <Filter style={{ width: 14, height: 14, color: "#999" }} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "10px 32px 10px 8px",
              border: "1px solid #e5e5e5",
              fontSize: "14px",
              backgroundColor: "#fff",
              outline: "none",
              cursor: "pointer",
              appearance: "none" as const,
            }}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="enrolled">Enrolled</option>
            <option value="verified">Verified</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      {filteredOrders.length === 0 ? (
        <div style={{
          backgroundColor: "#fff",
          border: "1px solid #e5e5e5",
          padding: "64px 32px",
          textAlign: "center",
        }}>
          <Package style={{ width: 48, height: 48, color: "#ccc", margin: "0 auto 16px" }} />
          <h3 style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "1.125rem",
            fontWeight: 600,
            marginBottom: "8px",
          }}>
            No tagged shipments found
          </h3>
          <p style={{ color: "#999", maxWidth: "300px", margin: "0 auto" }}>
            {searchQuery ? "Try adjusting your search query." : "Orders with INK delivery tags will appear here."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div style={{ display: "none" }} className="shipments-desktop-table">
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              backgroundColor: "#fff",
              border: "1px solid #e5e5e5",
            }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e5e5" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "#999" }}>Order</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "#999" }}>Customer</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "#999" }}>Items</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "#999" }}>Total</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "#999" }}>Status</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "#999" }}>Date</th>
                  <th style={{ padding: "12px 16px", width: "32px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const badge = getStatusBadge(order.verificationStatus);
                  return (
                    <tr
                      key={order.id}
                      onClick={() => navigate(`/app/tagged-shipments/${order.id}`)}
                      style={{
                        borderBottom: "1px solid #f0f0f0",
                        cursor: "pointer",
                        transition: "background-color 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#fafafa"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      <td style={{ padding: "14px 16px", fontSize: "14px", fontWeight: 600 }}>
                        {order.name}
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: "14px", color: "#444" }}>
                        {order.customerName}
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: "14px", color: "#666" }}>
                        {order.itemCount} item{order.itemCount !== 1 ? "s" : ""}
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: "14px", fontWeight: 500 }}>
                        {order.currencySymbol}{order.totalPrice}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span className={badge.className}>{badge.label}</span>
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: "13px", color: "#999" }}>
                        {formatDate(order.createdAt)}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <ChevronRight style={{ width: 16, height: 16, color: "#ccc" }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="shipments-mobile-cards" style={{ display: "flex", flexDirection: "column", gap: "1px", backgroundColor: "#e5e5e5" }}>
            {filteredOrders.map((order) => {
              const badge = getStatusBadge(order.verificationStatus);
              return (
                <div
                  key={order.id}
                  onClick={() => navigate(`/app/tagged-shipments/${order.id}`)}
                  style={{
                    backgroundColor: "#fff",
                    padding: "16px",
                    cursor: "pointer",
                    transition: "background-color 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#fafafa"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#fff"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "2px" }}>{order.name}</div>
                      <div style={{ fontSize: "13px", color: "#666" }}>{order.customerName}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "14px", fontWeight: 500 }}>{order.currencySymbol}{order.totalPrice}</div>
                      <div style={{ fontSize: "12px", color: "#999" }}>{formatDate(order.createdAt)}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className={badge.className}>{badge.label}</span>
                    <span style={{ fontSize: "13px", color: "#999" }}>{order.itemCount} item{order.itemCount !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Responsive styles */}
      <style>{`
        @media (min-width: 768px) {
          .shipments-desktop-table { display: block !important; }
          .shipments-mobile-cards { display: none !important; }
        }
      `}</style>
    </div>
  );
}
