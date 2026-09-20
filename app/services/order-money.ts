/** The money on an order, lifted from the orders/create body Shopify already
 *  sent — no query, no scope, no cost (Track C).
 *
 *  A pure mapper, like order-line-item.ts, so it can be tested without
 *  standing up the Shopify app config. Every field is OPTIONAL and omitted
 *  when absent: the backend settles the total (utils/orderMoney.js there
 *  labels it "order" when we send one and rolls up from line items when we
 *  do not), and an absent field must stay absent — never "" or 0 — so the
 *  backend cannot mistake our silence for a declared zero.
 *
 *  Shopify's REST order body carries `total_price`, `currency`,
 *  `subtotal_price`, `total_discounts`, `discount_codes` ([{code, amount,
 *  type}]) and `discount_applications` ([{type, title, code?, value,
 *  value_type, target_type, description?, allocation_method,
 *  target_selection}]). Strings are kept exactly as Shopify sends them.
 */
export interface OrderMoney {
  total_price?: string;
  currency?: string;
  subtotal_price?: string;
  total_discounts?: string;
  discount_codes?: Array<{ code: string; amount?: string; type?: string }>;
  discount_applications?: Array<{
    type?: string;
    title?: string;
    code?: string;
    value?: string;
    value_type?: string;
    target_type?: string;
    description?: string;
  }>;
}

const MAX_ENTRIES = 20;

function moneyOf(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? String(v) : undefined;
}

function str(v: unknown, max = 200): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s.slice(0, max) : undefined;
}

type Loose = Record<string, unknown>;
function loose(v: unknown): Loose {
  return v && typeof v === "object" ? (v as Loose) : {};
}

export function orderMoneyFromWebhook(body: unknown): OrderMoney {
  const data = loose(body);
  const out: OrderMoney = {};
  const total = moneyOf(data.total_price);
  if (total !== undefined) out.total_price = total;
  const currency = str(data.currency, 3);
  if (currency) out.currency = currency.toUpperCase();
  const subtotal = moneyOf(data.subtotal_price);
  if (subtotal !== undefined) out.subtotal_price = subtotal;
  const discounts = moneyOf(data.total_discounts);
  if (discounts !== undefined) out.total_discounts = discounts;

  if (Array.isArray(data.discount_codes)) {
    const codes: NonNullable<OrderMoney["discount_codes"]> = [];
    for (const raw of data.discount_codes as unknown[]) {
      if (codes.length >= MAX_ENTRIES) break;
      const entry = loose(raw);
      const code = str(typeof raw === "string" ? raw : entry.code, 64);
      if (!code) continue;
      const row: { code: string; amount?: string; type?: string } = { code };
      const amount = moneyOf(entry.amount);
      if (amount !== undefined) row.amount = amount;
      const type = str(entry.type, 40);
      if (type) row.type = type;
      codes.push(row);
    }
    if (codes.length) out.discount_codes = codes;
  }

  if (Array.isArray(data.discount_applications)) {
    const apps: NonNullable<OrderMoney["discount_applications"]> = [];
    for (const raw of data.discount_applications as unknown[]) {
      if (apps.length >= MAX_ENTRIES) break;
      if (!raw || typeof raw !== "object") continue;
      const entry = loose(raw);
      const row: NonNullable<OrderMoney["discount_applications"]>[number] = {};
      const type = str(entry.type, 40);
      if (type) row.type = type;
      const title = str(entry.title, 200);
      if (title) row.title = title;
      const code = str(entry.code, 64);
      if (code) row.code = code;
      const value = str(entry.value, 40);
      if (value) row.value = value;
      const valueType = str(entry.value_type, 40);
      if (valueType) row.value_type = valueType;
      const targetType = str(entry.target_type, 40);
      if (targetType) row.target_type = targetType;
      const description = str(entry.description, 200);
      if (description) row.description = description;
      if (Object.keys(row).length) apps.push(row);
    }
    if (apps.length) out.discount_applications = apps;
  }
  return out;
}
