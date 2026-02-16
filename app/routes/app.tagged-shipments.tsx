import { useState, useEffect } from "react";
import { Search, RefreshCw, SlidersHorizontal, Diamond, Pause, Zap, CircleCheck, CircleSlash } from "lucide-react";
import { useLoaderData, useSubmit, useRouteError, type LoaderFunctionArgs, type HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import AppLayout from "../components/AppLayout";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import OrderDetailView from "../components/OrderDetailView";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import OrdersTable from "../components/OrdersTable";

// Loader to fetch orders
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("search") || "";

  // GraphQL query to fetch orders (based on api.orders.fetch.tsx)
  const query = `#graphql
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
              defaultAddress {
                address1
                city
                provinceCode
                zip
              }
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
                  originalUnitPriceSet {
                    shopMoney {
                       amount
                    }
                  }
                  sku
                  image {
                    url
                  }
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
  `;

  let response;
  try {
    response = await admin.graphql(query);
  } catch (err) {
    // If the error is a Response (auth redirect), let it propagate for App Bridge bounce
    if (err instanceof Response) {
      throw err;
    }
    console.error("❌ GraphQL call failed in tagged-shipments layout:", err);
    return { orders: [], error: "Failed to fetch orders" };
  }
  const data = await response.json();

  if (!data?.data?.orders) {
    return { orders: [], error: "Failed to fetch orders" };
  }

  // Process orders
  const allOrders = data.data.orders.edges.map((edge: any) => {
    const order = edge.node;
    const numericId = order.id.replace("gid://shopify/Order/", "");

    // Parse metafields
    const metafields: Record<string, string> = {};
    order.metafields?.edges?.forEach((mfEdge: any) => {
      metafields[mfEdge.node.key] = mfEdge.node.value;
    });

    // Check Eligibility (INK logic)
    const hasInkTag = order.tags?.includes("INK-Premium-Delivery") || order.tags?.includes("INK-Verified-Delivery");
    const hasDeliveryTypeMetafield = metafields.delivery_type === "premium";
    const hasInkMetafield = metafields.ink_premium_order === "true";
    let hasInkLineItem = false;
    for (const lineItem of order.lineItems?.edges || []) {
      const title = (lineItem.node?.title || "").toLowerCase();
      if (title.includes("ink delivery") || title.includes("ink protected") || title.includes("ink premium") || title.includes("verified delivery")) {
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
    // For now, let's include all for debugging if no ink orders exist, but logically we should filter.
    // User asked for "actual data which we were earlier showing".
    
    // Get verification status
    const verificationStatus = (metafields.verification_status || "pending").toLowerCase();
    
    // Get line item details
    const items = order.lineItems?.edges?.map((li: any) => ({
      title: li.node.title,
      quantity: li.node.quantity,
      price: li.node.originalUnitPriceSet?.shopMoney?.amount || "0.00",
      sku: li.node.sku || "",
    })) || [];

    // Calculate subtotal (approximate from available data)
    const subtotal = items.reduce((sum: number, item: any) => sum + (parseFloat(item.price) * item.quantity), 0);

    return {
      id: numericId,
      orderNumber: order.name,
      customerName: order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : "Guest",
      customerEmail: order.customer?.email || "",
      customerAddress: order.customer?.defaultAddress,
      date: new Date(order.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      total: order.totalPriceSet.shopMoney.amount,
      subtotal: subtotal.toFixed(2),
      currency: order.totalPriceSet.shopMoney.currencyCode,
      status: verificationStatus === "active" ? "enrolled" : verificationStatus, // Normalize status
      rawStatus: verificationStatus,
      isEligible: isInkOrder,
      items,
      metafields // Pass metafields for detailed view (nfc_uid, proof_id, etc.)
    };
  });

  // Filter eligible orders
  const eligibleOrders = allOrders.filter((o: any) => o.isEligible);

  // Calculate counts dynamically
  const counts = {
    all: eligibleOrders.length,
    enrolled: eligibleOrders.filter((o: any) => o.status === "enrolled").length,
    cooldown: eligibleOrders.filter((o: any) => o.status === "cooldown").length,
    active: eligibleOrders.filter((o: any) => o.status === "active").length,
    verified: eligibleOrders.filter((o: any) => o.status === "verified").length,
    expired: eligibleOrders.filter((o: any) => o.status === "expired").length,
  };

  return { orders: eligibleOrders, counts };
};


const sortOptions = [
  { value: "new", label: "New" },
  { value: "old", label: "Old" },
  { value: "verified", label: "Verified" },
  { value: "enrolled", label: "Enrolled" },
];


export default function Shipments() {
  const { orders, counts } = useLoaderData() as any;
  const submit = useSubmit();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("new");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const currentSortLabel = sortOptions.find(opt => opt.value === sortBy)?.label || "Sort";

  // Dynamic lifecycle filters
  const lifecycleFilters = [
    { key: "all", label: "All", count: counts?.all || 0, icon: null },
    { key: "enrolled", label: "Enrolled", count: counts?.enrolled || 0, icon: Diamond },
    { key: "cooldown", label: "Cooldown", count: counts?.cooldown || 0, icon: Pause },
    { key: "active", label: "Active", count: counts?.active || 0, icon: Zap },
    { key: "verified", label: "Verified", count: counts?.verified || 0, icon: CircleCheck },
    { key: "expired", label: "Expired", count: counts?.expired || 0, icon: CircleSlash },
  ];

  // Auto Refresh
  useEffect(() => {
    const interval = setInterval(() => {
       // Re-run loader
       submit(null, { method: "get" }); 
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // If an order is selected, show the detail view instead of the table
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

  return (
    <AppLayout pageTitle="Shipments">
      {/* Shipments Section Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base sm:text-lg font-medium text-foreground">Shipment Records</h2>
      </div>

      {/* Search Bar - Mobile optimized */}
      <div className="relative mb-4">
        <Search 
          className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" 
          aria-hidden="true" 
        />
        <Input
          type="search"
          placeholder="Search by shipment number or customer name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-12 lg:h-11 pl-10 border-border rounded text-base lg:text-sm"
          aria-label="Search shipments"
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        {/* Sort Dropdown - Desktop */}
        <div className="hidden lg:flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort:</span>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40 h-9 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card z-50">
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sort Dropdown - Mobile (in menu) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="lg:hidden">
            <Button variant="outline" size="sm" className="gap-2 h-11 min-w-[44px]">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{currentSortLabel}</span>
              <span className="sm:hidden">Sort</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="bg-card">
            {sortOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setSortBy(option.value)}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Desktop spacer */}
        <div className="hidden lg:block" />

        {/* Refresh Button */}
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 h-11 lg:h-9 min-w-[44px]"
          aria-label="Refresh shipments"
          onClick={() => {
            submit(null, { method: "get" }); 
          }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Lifecycle State Filters */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
        {lifecycleFilters.map((filter) => {
          const isActive = statusFilter === filter.key;
          const Icon = filter.icon;
          return (
            <button
              key={filter.key}
              onClick={() => setStatusFilter(filter.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm font-medium whitespace-nowrap transition-colors ${
                isActive 
                  ? "bg-foreground text-background" 
                  : "bg-card border border-border text-foreground hover:bg-secondary"
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              <span>{filter.label}</span>
              <span className={`text-xs ${isActive ? "text-background/70" : "text-muted-foreground"}`}>
                ({filter.count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders Table */}
      <OrdersTable 
        orders={orders}
        searchQuery={searchQuery} 
        sortBy={sortBy}
        statusFilter={statusFilter}
        onViewDetail={(order) => setSelectedOrder(order)}
      />
    </AppLayout>
  );
};

export const headers: HeadersFunction = (args) => boundary.headers(args);
export const ErrorBoundary = () => {
    return boundary.error(useRouteError());
};
