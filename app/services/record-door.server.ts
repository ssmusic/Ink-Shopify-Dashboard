// THE RECORD'S DOOR — "Get the record — $X" on an order row (Sam, 2026-09-22:
// "the words are free, the proof is paid" · "put a price on the download").
//
// MONEY IS SAM'S GATE. Two switches, both his, both off today:
//   1. the PRICE — resolved by the BACKEND alone (utils/recordRetrieval.js,
//      `retrievalPriceOf`; Sam, 2026-09-22: "make it 29"): $29 unless the
//      merchant names its own `retrieval_price_cents`; 0 = free for that
//      merchant. This app reads the resolved price from
//      `GET /admin/purchases/price` (readRecordPrice) and never re-reads the
//      raw field or carries a default of its own.
//   2. the KILL SWITCH — `RECORD_PURCHASES_ENABLED=true` in this service's
//      env. Off (unset): no charge can be created, whatever a record says.
// A charge is created only when BOTH are on. `RECORD_PURCHASE_TEST=true`
// makes Shopify's charge a test charge (no money moves; the merchant still
// walks the approval screen) — set only when Sam says so.
//
// The flow (Shopify Billing, one-time): the merchant presses the door →
// `appPurchaseOneTimeCreate` → Shopify's approval screen → the return URL
// (/app/record) → this app asks Shopify whether the charge is ACTIVE → only
// then the backend mints the purchase key (POST /admin/purchases) → the
// packet link. The same code serves both flavors (in.ink and The Ritualist);
// the Ritualist's merchants pay the same until Sam says otherwise.

import type { RecordPurchase } from "./ink-api.server";

export type RecordPrice = { price_cents: number; currency: string };

export function recordPurchasesEnabled(): boolean {
  return process.env.RECORD_PURCHASES_ENABLED === "true";
}

export function recordPurchaseIsTest(): boolean {
  return process.env.RECORD_PURCHASE_TEST === "true";
}

/** The price a buyer of this record is offered: the backend's resolved
 *  price, only with the switch on. */
export function recordOffer(price: RecordPrice | null): RecordPrice | null {
  return recordPurchasesEnabled() ? price : null;
}

// PLACEHOLDER copy — Sam's words replace it.
export const RECORD_DOOR_LABEL = "Get the record";

/** "$15" · "$15.50". */
export function recordPriceWords(price: RecordPrice): string {
  const whole = price.price_cents % 100 === 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(price.price_cents / 100);
  } catch {
    return `${(price.price_cents / 100).toFixed(whole ? 0 : 2)} ${price.currency}`;
  }
}

/** What an order row draws: a price to buy at, the purchase already made,
 *  or nothing. */
export type RecordDoorRow = {
  offer: RecordPrice | null;
  purchase: { id: string; packet_url: string | null; outcome: RecordPurchase["outcome"] } | null;
};

export function recordDoorRow(proofId: string | null, offer: RecordPrice | null, purchases: RecordPurchase[]): RecordDoorRow {
  if (!proofId) return { offer: null, purchase: null };
  const bought = purchases.find((p) => p.proof_id === proofId) ?? null;
  return {
    offer: bought ? null : offer,
    purchase: bought ? { id: bought.id, packet_url: bought.packet_url ?? null, outcome: bought.outcome } : null,
  };
}

// A same-app path to come back to, or the ink screen. Never a URL elsewhere.
export function safeReturnTo(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  return /^\/app(\/[A-Za-z0-9._~%/-]*)?$/.test(s) && !s.includes("//") && !s.includes("..") ? s : "/app/ink";
}

// ── Shopify's one-time charge ──────────────────────────────────────────────

export const RECORD_CHARGE_MUTATION = `#graphql
  mutation InkRecordCharge($name: String!, $price: MoneyInput!, $returnUrl: URL!, $test: Boolean) {
    appPurchaseOneTimeCreate(name: $name, price: $price, returnUrl: $returnUrl, test: $test) {
      appPurchaseOneTime { id status }
      confirmationUrl
      userErrors { field message }
    }
  }`;

export const RECORD_CHARGE_QUERY = `#graphql
  query InkRecordChargeStatus($id: ID!) {
    node(id: $id) {
      ... on AppPurchaseOneTime { id name status test price { amount currencyCode } }
    }
  }`;

type AdminGraphql = { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<{ json: () => Promise<unknown> }> };

/** The charge's name on Shopify's approval screen and invoice. PLACEHOLDER. */
export function recordChargeName(orderName: string): string {
  return `The record of order ${orderName}`.slice(0, 255);
}

// WHERE SHOPIFY SENDS THE MERCHANT AFTER THE APPROVAL SCREEN: the app's own
// page INSIDE the admin — admin.shopify.com/store/<store>/apps/<api key>/app/
// record — so the admin frames the app and passes the path and query through.
// Never the app's bare URL: a top-level load there carries no `host`, and the
// library's re-embed (getEmbeddedAppUrl) throws without one and drops the
// path when it has one — the charge id would be lost. Never a guessed app
// handle: the api key is the app's own (it is what the library itself embeds
// with). The charge is ALSO remembered at creation (record-charges.server.ts)
// and settled on the next screen load, so a paid charge mints its key even
// if this return never arrives.
export function recordReturnUrl(input: { shop: string; apiKey: string; proofId: string; returnTo: string }): string {
  const store = input.shop.replace(/\.myshopify\.com$/i, "");
  const u = new URL(`https://admin.shopify.com/store/${encodeURIComponent(store)}/apps/${encodeURIComponent(input.apiKey)}/app/record`);
  u.searchParams.set("proof_id", input.proofId);
  u.searchParams.set("return_to", input.returnTo);
  return u.toString();
}

/** Creates the charge (nothing is billed until the merchant approves it on
 *  Shopify's screen) and answers where to send them. Throws on refusal. */
export async function createRecordCharge(
  admin: AdminGraphql,
  input: { orderName: string; price: RecordPrice; returnUrl: string },
): Promise<{ confirmationUrl: string; chargeId: string }> {
  const res = await admin.graphql(RECORD_CHARGE_MUTATION, {
    variables: {
      name: recordChargeName(input.orderName),
      price: { amount: (input.price.price_cents / 100).toFixed(2), currencyCode: input.price.currency },
      returnUrl: input.returnUrl,
      test: recordPurchaseIsTest(),
    },
  });
  const body = (await res.json()) as {
    data?: { appPurchaseOneTimeCreate?: { appPurchaseOneTime?: { id?: string } | null; confirmationUrl?: string | null; userErrors?: Array<{ message?: string }> } };
  };
  const out = body?.data?.appPurchaseOneTimeCreate;
  const errors = (out?.userErrors ?? []).map((e) => e?.message).filter(Boolean);
  if (errors.length || !out?.confirmationUrl || !out?.appPurchaseOneTime?.id) {
    throw new Error(`Shopify refused the charge: ${errors.join("; ") || "no confirmation URL"}`);
  }
  return { confirmationUrl: out.confirmationUrl, chargeId: out.appPurchaseOneTime.id };
}

/** Shopify's charge id in either shape → the AppPurchaseOneTime gid, or null. */
export function recordChargeGid(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  const m = s.match(/^(?:gid:\/\/shopify\/AppPurchaseOneTime\/)?(\d{1,20})$/);
  return m ? `gid://shopify/AppPurchaseOneTime/${m[1]}` : null;
}

export type RecordChargeStatus = { id: string; status: string; test: boolean; price_cents: number; currency: string };

/** What Shopify says about the charge — or null when it cannot say. */
export async function readRecordCharge(admin: AdminGraphql, gid: string): Promise<RecordChargeStatus | null> {
  try {
    const res = await admin.graphql(RECORD_CHARGE_QUERY, { variables: { id: gid } });
    const body = (await res.json()) as { data?: { node?: { id?: string; status?: string; test?: boolean; price?: { amount?: string; currencyCode?: string } } | null } };
    const n = body?.data?.node;
    const amount = Number(n?.price?.amount);
    if (!n?.id || typeof n.status !== "string" || !Number.isFinite(amount)) return null;
    return { id: n.id, status: n.status, test: n.test === true, price_cents: Math.round(amount * 100), currency: n.price?.currencyCode || "USD" };
  } catch (err) {
    console.warn("[record] charge read failed:", err);
    return null;
  }
}
