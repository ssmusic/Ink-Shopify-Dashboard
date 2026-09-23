// INK'S RECENT ORDERS — each order, and its record's id.
//
// (The dashboard door this file also held — a magic-token link out to
// www.in.ink — is gone: "were doing everything inside this shopify app",
// Sam, 2026-09-23.)
//
//   the record — each recent order's public page, www.in.ink/verify/<proof_id>.
//     The proof id is the order's own ink.proof_reference metafield, written
//     at enrol under ink's scopes (webhooks.orders_create.ts).
//
// THE LIST IS THE RITUALIST'S (Sam, 2026-09-23: "recent orders should show just
// like the ritualist orders with an accordion and the get the record at the
// bottom"). So the read carries what the Ritualist's Shipments row and its
// expanded panel show — the order's email, its ship-to, its lines, its total,
// its ink metafields — still with read_orders alone: never `customer { … }`
// (a Customer object needs read_customers, which ink does not hold, and
// Shopify fails the WHOLE query over one such selection — #1019) and never a
// line's `image` (read_products). The email, name and address are protected
// customer data: where Shopify redacts them it answers with errors, the
// client throws, and the read falls back to the minimal one below — the list
// never disappears over a redaction.
//
// Both fail open: a missing token or a refused read leaves the screen as it
// was, never an error page.

export const RECENT_ORDERS_QUERY = `#graphql
  query InkRecentOrders($first: Int!) {
    orders(first: $first, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        proof: metafield(namespace: "ink", key: "proof_reference") { value }
      }
    }
  }`;

/** The Ritualist's Shipments row, read under ink's ten scopes. */
export const RECENT_ORDERS_DETAIL_QUERY = `#graphql
  query InkRecentOrdersDetail($first: Int!) {
    shop { ianaTimezone }
    orders(first: $first, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        email
        totalPriceSet { shopMoney { amount currencyCode } }
        shippingAddress { name address1 city provinceCode zip }
        lineItems(first: 20) {
          nodes { title quantity sku originalUnitPriceSet { shopMoney { amount } } }
        }
        metafields(namespace: "ink", first: 10) { nodes { key value } }
        proof: metafield(namespace: "ink", key: "proof_reference") { value }
      }
    }
  }`;

const RECORD_BASE = "https://www.in.ink/verify/";
const PROOF_ID = /^proof_[0-9a-f]{24}$/;

/** The order's public record, or null when the value is not a proof id. */
export function recordUrlFor(proofId: string | null | undefined): string | null {
  return typeof proofId === "string" && PROOF_ID.test(proofId) ? `${RECORD_BASE}${proofId}` : null;
}

/** What the Ritualist's expanded order row (components/OrderExpandedRow.tsx)
 *  reads, in the same shape its Shipments loader builds. */
export type InkOrderDetail = {
  /** Numeric order id, as the Ritualist's list keys its rows. */
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerAddress?: { address1: string; city: string; provinceCode: string; zip: string };
  date: string;
  total: string;
  subtotal: string;
  currency: string;
  /** The ink.verification_status word, "active" read as "enrolled" — the Ritualist's rule. */
  status: string;
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

type Money = { shopMoney?: { amount?: unknown; currencyCode?: unknown } } | null;
type OrderNode = {
  id?: unknown;
  name?: unknown;
  createdAt?: unknown;
  email?: unknown;
  totalPriceSet?: Money;
  shippingAddress?: { name?: unknown; address1?: unknown; city?: unknown; provinceCode?: unknown; zip?: unknown } | null;
  lineItems?: { nodes?: ({ title?: unknown; quantity?: unknown; sku?: unknown; originalUnitPriceSet?: Money } | null)[] } | null;
  metafields?: { nodes?: ({ key?: unknown; value?: unknown } | null)[] } | null;
  proof?: { value?: unknown } | null;
};
type RecentOrdersBody = { data?: { shop?: { ianaTimezone?: unknown } | null; orders?: { nodes?: (OrderNode | null)[] } } };
type AdminGraphql = { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<{ json: () => Promise<unknown> }> };

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** One order node as the Ritualist's Shipments loader would have built it. */
export function orderDetailFrom(n: OrderNode, shopTz: string): InkOrderDetail {
  const metafields: Record<string, string> = {};
  for (const m of n.metafields?.nodes ?? []) {
    if (m && typeof m.key === "string" && typeof m.value === "string") metafields[m.key] = m.value;
  }
  const items = (n.lineItems?.nodes ?? [])
    .filter((li): li is NonNullable<typeof li> => Boolean(li))
    .map((li) => ({
      title: str(li.title),
      quantity: typeof li.quantity === "number" ? li.quantity : 0,
      price: str(li.originalUnitPriceSet?.shopMoney?.amount) || "0.00",
      sku: str(li.sku),
    }));
  const subtotal = items.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);
  const addr = n.shippingAddress;
  const verification = (str(metafields.verification_status) || "pending").toLowerCase();
  let date = "";
  try {
    date = new Date(str(n.createdAt)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: shopTz });
  } catch {
    date = str(n.createdAt).slice(0, 10);
  }
  return {
    id: str(n.id).replace("gid://shopify/Order/", ""),
    orderNumber: str(n.name) || str(n.id),
    // ink holds no read_customers: the recipient's name on the ship-to stands
    // in for the Customer's, and "Guest" is the Ritualist's word for none.
    customerName: str(addr?.name) || "Guest",
    customerEmail: str(n.email),
    customerAddress: addr
      ? { address1: str(addr.address1), city: str(addr.city), provinceCode: str(addr.provinceCode), zip: str(addr.zip) }
      : undefined,
    date,
    total: str(n.totalPriceSet?.shopMoney?.amount) || "0.00",
    subtotal: subtotal.toFixed(2),
    currency: str(n.totalPriceSet?.shopMoney?.currencyCode) || "USD",
    status: verification === "active" ? "enrolled" : verification,
    items,
    metafields,
  };
}

function rowsFrom(body: RecentOrdersBody | null, withDetail: boolean): RecentOrderRecord[] {
  const nodes = body?.data?.orders?.nodes ?? [];
  const shopTz = str(body?.data?.shop?.ianaTimezone) || "America/Los_Angeles";
  const rows: RecentOrderRecord[] = [];
  for (const n of nodes) {
    if (!n || typeof n.id !== "string") continue;
    const recordUrl = recordUrlFor(typeof n.proof?.value === "string" ? n.proof.value : null);
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

export async function readRecentOrderRecords(admin: AdminGraphql, first = 5): Promise<RecentOrderRecord[]> {
  try {
    const res = await admin.graphql(RECENT_ORDERS_DETAIL_QUERY, { variables: { first } });
    const body = (await res.json()) as RecentOrdersBody | null;
    if (body?.data?.orders) return rowsFrom(body, true);
  } catch (err) {
    console.warn("[ink] recent orders detail read failed; falling back to the minimal read:", err);
  }
  try {
    const res = await admin.graphql(RECENT_ORDERS_QUERY, { variables: { first } });
    return rowsFrom((await res.json()) as RecentOrdersBody | null, false);
  } catch (err) {
    console.warn("[ink] recent orders read failed (the screen shows none):", err);
    return [];
  }
}
