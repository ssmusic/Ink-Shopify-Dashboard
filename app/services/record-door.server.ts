import { isInk } from "./app-flavor.server";
import { flavorLogger } from "./ink-log.server";
const console = flavorLogger("record-door");
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

/** A development store's charge is always a test charge; a live store's is
 *  real unless RECORD_PURCHASE_TEST forces test everywhere (audit
 *  2026-09-25: the env alone made every live charge a test). A failed read
 *  answers the env alone — Shopify refuses a real charge on a dev store. */
export async function recordChargeIsTest(admin: AdminGraphql): Promise<boolean> {
  if (recordPurchaseIsTest()) return true;
  try {
    const res = await admin.graphql(`#graphql
      query RecordChargeStore { shop { plan { partnerDevelopment } } }`);
    const body = (await res.json()) as { data?: { shop?: { plan?: { partnerDevelopment?: unknown } } } };
    return body?.data?.shop?.plan?.partnerDevelopment === true;
  } catch {
    return false;
  }
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

/** Shopify ANSWERED and said no (its userErrors): no charge exists, so the
 *  reservation may be released and the press offered again. Anything else —
 *  a network failure, an answer without a charge — stays uncertain. */
export class RecordChargeRefused extends Error {
  readonly shopifySays: string;
  constructor(shopifySays: string) {
    super(`Shopify refused the charge: ${shopifySays}`);
    this.name = "RecordChargeRefused";
    this.shopifySays = shopifySays;
  }
}

export const RECORD_CHARGES_QUERY = `#graphql
  query InkRecordCharges {
    currentAppInstallation {
      oneTimePurchases(first: 25, reverse: true) { nodes { id name createdAt } }
    }
  }`;

/** Did a charge of this name land on Shopify at or after `since`? Its gid,
 *  null when Shopify says none did, undefined when Shopify could not say. */
export async function findRecordCharge(
  admin: AdminGraphql,
  input: { name: string; since: string },
): Promise<string | null | undefined> {
  try {
    const res = await admin.graphql(RECORD_CHARGES_QUERY);
    const body = (await res.json()) as { data?: { currentAppInstallation?: { oneTimePurchases?: { nodes?: unknown } } } };
    const nodes = body?.data?.currentAppInstallation?.oneTimePurchases?.nodes;
    if (!Array.isArray(nodes)) return undefined;
    const since = Date.parse(input.since) - 60_000;
    const hit = nodes.find((n: any) => n?.name === input.name && typeof n?.id === "string" && !(Date.parse(n?.createdAt) < since));
    return hit ? (hit as { id: string }).id : null;
  } catch {
    return undefined;
  }
}

// A PENDING CHARGE SHOPIFY NO LONGER KNOWS (App Store requirement 1.2.2:
// "request approval for charges again on reinstall"). A charge made before an
// uninstall can stop answering to the reinstalled app: its status read comes
// back empty for good, and the order would say "approval in progress" with no
// Buy button forever. Only a definite answer counts — the node lookup answers
// null AND this installation's own purchases do not list it. A failed or
// errored read is never "gone": a charge that may still be approved is never
// released, so it can never be billed twice.
export const RECORD_CHARGE_GONE_QUERY = `#graphql
  query InkRecordChargeGone($id: ID!) {
    node(id: $id) { id }
    currentAppInstallation {
      oneTimePurchases(first: 25, reverse: true) { nodes { id } }
    }
  }`;

/** True only when Shopify answered, and neither the lookup by id nor this
 *  installation's recent purchases hold the charge. */
export async function recordChargeGone(admin: AdminGraphql, gid: string): Promise<boolean> {
  try {
    const res = await admin.graphql(RECORD_CHARGE_GONE_QUERY, { variables: { id: gid } });
    const body = (await res.json()) as {
      errors?: unknown;
      data?: { node?: { id?: string } | null; currentAppInstallation?: { oneTimePurchases?: { nodes?: unknown } } };
    };
    if (body?.errors || !body?.data || !("node" in body.data) || body.data.node !== null) return false;
    const nodes = body.data.currentAppInstallation?.oneTimePurchases?.nodes;
    if (!Array.isArray(nodes)) return false;
    return !nodes.some((n: unknown) => (n as { id?: unknown } | null)?.id === gid);
  } catch {
    return false;
  }
}

/** Creates the charge (nothing is billed until the merchant approves it on
 *  Shopify's screen) and answers where to send them. Throws on refusal. */
export async function createRecordCharge(
  admin: AdminGraphql,
  input: { orderName: string; price: RecordPrice; returnUrl: string; test?: boolean },
): Promise<{ confirmationUrl: string; chargeId: string }> {
  const res = await admin.graphql(RECORD_CHARGE_MUTATION, {
    variables: {
      name: recordChargeName(input.orderName),
      price: { amount: (input.price.price_cents / 100).toFixed(2), currencyCode: input.price.currency },
      returnUrl: input.returnUrl,
      test: input.test ?? recordPurchaseIsTest(),
    },
  });
  const body = (await res.json()) as {
    data?: { appPurchaseOneTimeCreate?: { appPurchaseOneTime?: { id?: string } | null; confirmationUrl?: string | null; userErrors?: Array<{ message?: string }> } };
  };
  const out = body?.data?.appPurchaseOneTimeCreate;
  const errors = (out?.userErrors ?? []).map((e) => e?.message).filter(Boolean);
  if (errors.length && !out?.appPurchaseOneTime?.id) throw new RecordChargeRefused(errors.join("; "));
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
    if (isInk() && (typeof n?.test !== "boolean" || typeof n?.price?.amount !== "string" || !n.price.amount.trim() || !/^[A-Z]{3}$/.test(n.price?.currencyCode || ""))) return null;
    const amount = Number(n?.price?.amount);
    if (!n?.id || typeof n.status !== "string" || !Number.isFinite(amount)) return null;
    return { id: n.id, status: n.status, test: n.test === true, price_cents: Math.round(amount * 100), currency: n.price?.currencyCode || "USD" };
  } catch (err) {
    console.warn("[record] charge read failed:", err);
    return null;
  }
}
