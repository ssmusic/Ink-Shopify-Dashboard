// Shopify order reads for the ink screen. A rejected protected-field read
// falls back to order identifiers; a failed fallback remains an error.
import { shopifyOrderSearch, shopifyOrderSort } from "../lib/ink-order-search";

export const RECENT_ORDERS_QUERY = `#graphql
  query InkRecentOrders($first: Int, $last: Int, $after: String, $before: String, $query: String, $sortKey: OrderSortKeys = CREATED_AT, $reverse: Boolean = true) {
    orders(first: $first, last: $last, after: $after, before: $before, query: $query, sortKey: $sortKey, reverse: $reverse) {
      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
      nodes {
        id
        name
        createdAt
        proof: metafield(namespace: "ink", key: "proof_reference") { value }
      }
    }
  }`;

/** Protected fields supply recipient labels and expanded order details. */
export const RECENT_ORDERS_DETAIL_QUERY = `#graphql
  query InkRecentOrdersDetail($first: Int, $last: Int, $after: String, $before: String, $query: String, $sortKey: OrderSortKeys = CREATED_AT, $reverse: Boolean = true) {
    shop { ianaTimezone }
    orders(first: $first, last: $last, after: $after, before: $before, query: $query, sortKey: $sortKey, reverse: $reverse) {
      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
      nodes {
        id
        name
        createdAt
        email
        totalPriceSet { shopMoney { amount currencyCode } }
        shippingAddress { name address1 address2 city provinceCode zip country }
        lineItems(first: 20) {
          pageInfo { hasNextPage }
          nodes { title quantity sku originalUnitPriceSet { shopMoney { amount } } }
        }

        proof: metafield(namespace: "ink", key: "proof_reference") { value }
      }
    }
  }`;

const RECORD_BASE = "https://www.in.ink/verify/";
const PROOF_ID = /^proof_[0-9a-f]{24}$/;

/** The order's public record, or null when the value is not a proof id. */
export function recordUrlFor(
  proofId: string | null | undefined,
): string | null {
  return typeof proofId === "string" && PROOF_ID.test(proofId)
    ? `${RECORD_BASE}${proofId}`
    : null;
}

/** What the Ritualist's expanded order row (components/OrderExpandedRow.tsx)
 *  reads, in the same shape its Shipments loader builds. */
export type InkOrderDetail = {
  /** Numeric order id, as the Ritualist's list keys its rows. */
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerAddress?: {
    address1: string;
    address2?: string;
    country?: string;
    city: string;
    provinceCode: string;
    zip: string;
  };
  date: string;
  total: string;
  subtotal: string;
  currency: string;
  /** The ink.verification_status word, "active" read as "enrolled" — the Ritualist's rule. */
  status: string;
  itemsTruncated?: boolean;
  items: { title: string; quantity: number; price: string; sku: string }[];
  metafields: Record<string, string>;
};

export type RecentOrderRecord = {
  id: string;
  name: string;
  createdAt: string | null;
  recordUrl: string | null;
  proofId: string | null;
  /** The row's accordion; null when only the minimal read answered. */
  detail: InkOrderDetail | null;
};

type Money = {
  shopMoney?: { amount?: unknown; currencyCode?: unknown };
} | null;
type OrderNode = {
  id?: unknown;
  name?: unknown;
  createdAt?: unknown;
  email?: unknown;
  totalPriceSet?: Money;
  shippingAddress?: {
    name?: unknown;
    address1?: unknown;
    address2?: unknown;
    country?: unknown;
    city?: unknown;
    provinceCode?: unknown;
    zip?: unknown;
  } | null;
  lineItems?: {
    pageInfo?: { hasNextPage?: boolean };
    nodes?: ({
      title?: unknown;
      quantity?: unknown;
      sku?: unknown;
      originalUnitPriceSet?: Money;
    } | null)[];
  } | null;
  metafields?: { nodes?: ({ key?: unknown; value?: unknown } | null)[] } | null;
  proof?: { value?: unknown } | null;
};
type RecentOrdersBody = {
  data?: {
    shop?: { ianaTimezone?: unknown } | null;
    orders?: {
      nodes?: (OrderNode | null)[];
      pageInfo?: Partial<OrderPageInfo>;
    };
  };
};
type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<{ json: () => Promise<unknown> }>;
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** One order node as the Ritualist's Shipments loader would have built it. */
export function orderDetailFrom(n: OrderNode, shopTz: string): InkOrderDetail {
  const metafields: Record<string, string> = {};
  const items = (n.lineItems?.nodes ?? [])
    .filter((li): li is NonNullable<typeof li> => Boolean(li))
    .map((li) => ({
      title: str(li.title),
      quantity: typeof li.quantity === "number" ? li.quantity : 0,
      price: str(li.originalUnitPriceSet?.shopMoney?.amount) || "0.00",
      sku: str(li.sku),
    }));
  const subtotal = items.reduce(
    (sum, item) => sum + parseFloat(item.price) * item.quantity,
    0,
  );
  const addr = n.shippingAddress;
  const verification = (
    str(metafields.verification_status) || "pending"
  ).toLowerCase();
  let date = "";
  try {
    date = new Date(str(n.createdAt)).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: shopTz,
    });
  } catch {
    date = str(n.createdAt).slice(0, 10);
  }
  return {
    id: str(n.id).replace("gid://shopify/Order/", ""),
    orderNumber: str(n.name) || str(n.id),
    // Ink holds no read_customers. This is the shipping recipient's name,
    // labeled as such in Orders; it is not a claim about the buyer.
    customerName: str(addr?.name) || "Name unavailable",
    customerEmail: str(n.email),
    customerAddress: addr
      ? {
          address1: str(addr.address1),
          address2: str(addr.address2),
          country: str(addr.country),
          city: str(addr.city),
          provinceCode: str(addr.provinceCode),
          zip: str(addr.zip),
        }
      : undefined,
    date,
    total: str(n.totalPriceSet?.shopMoney?.amount),
    subtotal: subtotal.toFixed(2),
    currency: str(n.totalPriceSet?.shopMoney?.currencyCode),
    status: verification === "active" ? "enrolled" : verification,
    itemsTruncated: n.lineItems?.pageInfo?.hasNextPage === true,
    items,
    metafields,
  };
}

function rowsFrom(
  body: RecentOrdersBody | null,
  withDetail: boolean,
): RecentOrderRecord[] {
  const nodes = body?.data?.orders?.nodes ?? [];
  const shopTz = str(body?.data?.shop?.ianaTimezone) || "UTC";
  const rows: RecentOrderRecord[] = [];
  for (const n of nodes) {
    if (!n || typeof n.id !== "string") continue;
    const recordUrl = recordUrlFor(
      typeof n.proof?.value === "string" ? n.proof.value : null,
    );
    rows.push({
      id: n.id,
      name: typeof n.name === "string" ? n.name : n.id,
      createdAt: typeof n.createdAt === "string" ? n.createdAt : null,
      recordUrl,
      // The record's own id when (and only when) it is one: the door's key.
      proofId: recordUrl ? (n.proof!.value as string) : null,
      detail: withDetail ? orderDetailFrom(n, shopTz) : null,
    });
  }
  return rows;
}

export type OrderPageInfo = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
};
export type OrderPage = { rows: RecentOrderRecord[]; pageInfo: OrderPageInfo };
function pageFrom(body: RecentOrdersBody | null, detail: boolean): OrderPage {
  const info = body?.data?.orders?.pageInfo;
  return {
    rows: rowsFrom(body, detail),
    pageInfo: {
      hasNextPage:
        info?.hasNextPage === true && typeof info.endCursor === "string",
      hasPreviousPage:
        info?.hasPreviousPage === true && typeof info.startCursor === "string",
      startCursor:
        typeof info?.startCursor === "string" ? info.startCursor : null,
      endCursor: typeof info?.endCursor === "string" ? info.endCursor : null,
    },
  };
}

export async function readRecentOrderPage(
  admin: AdminGraphql,
  options: {
    first?: number;
    after?: string | null;
    before?: string | null;
    search?: string;
    sort?: string;
  } = {},
): Promise<OrderPage> {
  const count = Math.min(20, Math.max(1, options.first ?? 5));
  const page = options.before
    ? { last: count, before: options.before }
    : options.after
      ? { first: count, after: options.after }
      : { first: count };
  const variables = {
    ...page,
    ...(options.search !== undefined ? { query: shopifyOrderSearch(options.search) } : {}),
    ...(options.sort !== undefined ? shopifyOrderSort(options.sort) : {}),
  };
  try {
    const res = await admin.graphql(RECENT_ORDERS_DETAIL_QUERY, { variables });
    const body = (await res.json()) as RecentOrdersBody | null;
    if (body?.data?.orders) return pageFrom(body, true);
  } catch (err) {
    console.warn("[ink] order detail read unavailable");
  }
  try {
    const res = await admin.graphql(RECENT_ORDERS_QUERY, { variables });
    const body = (await res.json()) as RecentOrdersBody | null;
    if (!body?.data?.orders?.nodes) throw new Error("Orders unavailable");
    return pageFrom(body, false);
  } catch (err) {
    throw new Error("Orders unavailable");
  }
}

export async function readRecentOrderRecords(
  admin: AdminGraphql,
  first = 5,
): Promise<RecentOrderRecord[]> {
  return (await readRecentOrderPage(admin, { first })).rows;
}
