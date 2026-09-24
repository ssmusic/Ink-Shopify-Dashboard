// SHOPIFY'S PAYMENT FACTS, BESIDE THE OPENS (2026-09-24, the record-against-
// a-dispute report, "the free facts"). Read with read_orders, which both apps
// hold (shopify.app.ink.toml write_orders; shopify.app.toml read_orders) — no
// new scope, no new protected-data field beyond the order's own:
//   · the address check (AVS) and card-code check (CVV) result codes, from
//     the order's transactions' card payment details;
//   · whether the billing address matches the shipping address (yes / no);
//   · Shopify's risk recommendation and level; Shopify Protect's status;
//   · the order's disputes: status and how each began.
// Pushed to ink-backend PUT /api/proofs/:proof_id/payment-facts, stored
// unsigned beside the record, printed in the record's words as Shopify's
// facts — never what a network will do with them.
//
// TWO WIRES, EACH FAIL-OPEN. Shopify fails a WHOLE query when one selection
// is refused (order #1019, 2026-08-09), so the card codes and the risk facts
// are read apart: a refusal costs its own facts and nothing else.

import { merchantUrl } from "./ink-reader.server";

type Graphql = { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };

const CARD = `#graphql
  query InkPaymentFactsCard($id: ID!) {
    order(id: $id) {
      billingAddressMatchesShippingAddress
      transactions(first: 10) {
        kind
        status
        paymentDetails { ... on CardPaymentDetails { avsResultCode cvvResultCode } }
      }
    }
  }`;

const RISK = `#graphql
  query InkPaymentFactsRisk($id: ID!) {
    order(id: $id) {
      risk { recommendation assessments { riskLevel } }
      shopifyProtect { status }
      disputes { status initiatedAs }
    }
  }`;

export type PaymentFacts = {
  avs_result_code?: string;
  cvv_result_code?: string;
  billing_matches_shipping?: boolean;
  risk_recommendation?: string;
  risk_level?: string;
  shopify_protect_status?: string;
  disputes?: Array<{ status: string | null; initiated_as: string | null }>;
  read_at?: string;
};

async function read(admin: Graphql, query: string, id: string): Promise<Record<string, any> | null> {
  try {
    const res = await admin.graphql(query, { variables: { id } });
    const body = (await res.json()) as { data?: { order?: Record<string, any> | null }; errors?: unknown };
    return body?.data?.order ?? null;
  } catch {
    return null;
  }
}

const RISK_ORDER = ["HIGH", "MEDIUM", "LOW", "NONE", "PENDING"];

/** The facts Shopify holds for this order, or null when it answered nothing. */
export async function readOrderPaymentFacts(admin: Graphql, orderId: string | number, now = new Date()): Promise<PaymentFacts | null> {
  const numeric = String(orderId ?? "").replace(/\D/g, "");
  if (!numeric) return null;
  const id = `gid://shopify/Order/${numeric}`;
  const [card, risk] = await Promise.all([read(admin, CARD, id), read(admin, RISK, id)]);
  const out: PaymentFacts = {};
  if (card) {
    if (typeof card.billingAddressMatchesShippingAddress === "boolean") out.billing_matches_shipping = card.billingAddressMatchesShippingAddress;
    // The authorization (or the sale) carries the checks the card network ran.
    const txs = Array.isArray(card.transactions) ? card.transactions : [];
    const tx = txs.find((t: any) => ["AUTHORIZATION", "SALE"].includes(t?.kind) && t?.status === "SUCCESS" && t?.paymentDetails)
      ?? txs.find((t: any) => t?.paymentDetails?.avsResultCode || t?.paymentDetails?.cvvResultCode);
    const pd = tx?.paymentDetails ?? {};
    if (typeof pd.avsResultCode === "string" && pd.avsResultCode) out.avs_result_code = pd.avsResultCode;
    if (typeof pd.cvvResultCode === "string" && pd.cvvResultCode) out.cvv_result_code = pd.cvvResultCode;
  }
  if (risk) {
    if (typeof risk.risk?.recommendation === "string") out.risk_recommendation = risk.risk.recommendation;
    const levels = (Array.isArray(risk.risk?.assessments) ? risk.risk.assessments : []).map((a: any) => a?.riskLevel).filter((l: unknown) => typeof l === "string");
    const level = RISK_ORDER.find((l) => levels.includes(l));
    if (level) out.risk_level = level;
    if (typeof risk.shopifyProtect?.status === "string") out.shopify_protect_status = risk.shopifyProtect.status;
    if (Array.isArray(risk.disputes))
      out.disputes = risk.disputes.map((d: any) => ({ status: typeof d?.status === "string" ? d.status : null, initiated_as: typeof d?.initiatedAs === "string" ? d.initiatedAs : null }));
  }
  if (!Object.keys(out).length) return null;
  out.read_at = now.toISOString();
  return out;
}

/** Push the facts beside the record (the merchant's own key). Never throws. */
export async function pushOrderPaymentFacts(
  apiKey: string | null | undefined,
  proofId: string,
  facts: PaymentFacts | null,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!apiKey || !facts || !/^proof_[0-9a-f]{24}$/.test(proofId)) return false;
  try {
    const res = await fetchImpl(merchantUrl(`proofs/${proofId}/payment-facts`), {
      method: "PUT",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(facts),
      signal: AbortSignal.timeout(6_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
