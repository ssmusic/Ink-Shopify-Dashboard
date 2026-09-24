// OLDER ORDERS — the store's orders past Shopify's 60 days, as ink recorded
// them (ink-backend GET /merchant-orders). Shopify shares an app only the last
// 60 days of orders; the Orders screen's "Load more" continues from
// here, twenty at a time, each row the order ink recorded at enrollment (Sam,
// 2026-09-24: "yes build it"). A row carries what the ledger draws — number,
// date, buyer, where it ships (city, state, country), items, total — and its
// record streams in exactly like a Shopify row's.
import type { InkOrderDetail } from "./ink-links.server";
import { merchantRead, PROOF_ID } from "./ink-reader.server";

/** Twenty to a page, as Shopify's are (routes/app.ink.$section.tsx). */
export const OLDER_PER_PAGE = 20;

export type OlderOrder = {
  id: string;
  name: string;
  proofId: string;
  createdAt: string | null;
  detail: InkOrderDetail;
};

const str = (v: unknown, max = 200): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** The order's day in the shop's zone, as a Shopify row prints it (orderDetailFrom). */
function dateWords(iso: string | null, zone: string): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: zone });
  } catch {
    return iso.slice(0, 10);
  }
}

/** A row as GET /merchant-orders answers it; every field is checked. */
type BackendRow = {
  proof_id?: unknown;
  order_id?: unknown;
  order_number?: unknown;
  ordered_at?: unknown;
  customer_name?: unknown;
  customer_email?: unknown;
  ships_to?: { city?: unknown; state?: unknown; country?: unknown } | null;
  items?: unknown;
  items_truncated?: unknown;
  total_price?: unknown;
  currency?: unknown;
};
type BackendItem = { name?: unknown; quantity?: unknown; price?: unknown };

/** Shopify's name for an order: its number after a "#", as the admin prints
 *  it, when ink kept the number alone. */
function orderName(value: unknown): string | null {
  const name = str(value, 60);
  return name && /^\d+$/.test(name) ? `#${name}` : name;
}

/** One backend row, as the ledger's order. */
export function olderOrderFrom(input: unknown, zone = "UTC"): OlderOrder | null {
  if (!input || typeof input !== "object") return null;
  const row = input as BackendRow;
  if (typeof row.proof_id !== "string" || !PROOF_ID.test(row.proof_id)) return null;
  const proofId = row.proof_id;
  const name = orderName(row.order_number) || `Record ${proofId.slice(-8)}`;
  const to = row.ships_to && typeof row.ships_to === "object" ? row.ships_to : {};
  const city = str(to.city, 80);
  const country = str(to.country, 60);
  const total = str(row.total_price, 32) || "";
  const items = (Array.isArray(row.items) ? row.items : []).slice(0, 20).map((raw: unknown) => {
    const item: BackendItem = raw && typeof raw === "object" ? raw : {};
    const quantity = Number(item.quantity);
    return {
      title: str(item.name, 200) || "Item",
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      price: str(item.price, 32) || "",
      sku: "",
    };
  });
  const createdAt = str(row.ordered_at, 40);
  return {
    // Its own id space: never mistaken for a Shopify row's.
    id: `ink-record-${proofId}`,
    name,
    proofId,
    createdAt,
    detail: {
      id: (str(row.order_id, 64) || proofId).replace("gid://shopify/Order/", ""),
      orderNumber: name,
      customerName: str(row.customer_name, 120) || "Name unavailable",
      customerEmail: str(row.customer_email, 200) || "",
      ...(city
        ? { customerAddress: { address1: "", city, provinceCode: str(to.state, 40) || "", zip: "", ...(country ? { country } : {}) } }
        : {}),
      date: dateWords(createdAt, zone),
      total,
      subtotal: total,
      currency: str(row.currency, 8) || "USD",
      status: "enrolled",
      itemsTruncated: row.items_truncated === true,
      items,
      metafields: {},
    },
  };
}

/** A page of older orders before `before`, dated in the shop's zone; null
 *  when the backend cannot say — never an empty page in place of an error. */
export async function readOlderOrders(
  apiKey: string | null | undefined,
  before: string,
  zone: Promise<string> | string = "UTC",
  fetchImpl: typeof fetch = fetch,
): Promise<{ rows: OlderOrder[]; next: string | null } | null> {
  if (!apiKey || Number.isNaN(Date.parse(before))) return null;
  const [body, tz] = await Promise.all([
    merchantRead(apiKey, `merchant-orders?before=${encodeURIComponent(new Date(before).toISOString())}&limit=${OLDER_PER_PAGE}`, fetchImpl),
    zone,
  ]);
  if (!body || !Array.isArray(body.rows)) return null;
  return {
    rows: body.rows
      .map((row: unknown) => olderOrderFrom(row, tz))
      .filter((r: OlderOrder | null): r is OlderOrder => r !== null),
    next: typeof body.next === "string" && !Number.isNaN(Date.parse(body.next)) ? body.next : null,
  };
}
