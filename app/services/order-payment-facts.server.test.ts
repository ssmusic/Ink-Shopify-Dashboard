import { describe, expect, it, vi } from "vitest";
import { pushOrderPaymentFacts, readOrderPaymentFacts } from "./order-payment-facts.server";
import { checkoutClientFromWebhook } from "./checkout-client.server";
import { paymentFactsWords } from "../lib/payment-facts-words";

const reply = (order: unknown) => new Response(JSON.stringify({ data: { order } }));
const adminOf = (card: unknown, risk: unknown) => ({
  graphql: vi.fn(async (q: string, _options?: unknown) => (q.includes("InkPaymentFactsCard") ? (card instanceof Error ? Promise.reject(card) : reply(card)) : reply(risk))),
});

describe("Shopify's payment facts, beside the opens", () => {
  it("reads the card checks from the authorization, the billing match, the risk, Protect and the disputes", async () => {
    const admin = adminOf(
      { billingAddressMatchesShippingAddress: true, transactions: [{ kind: "AUTHORIZATION", status: "SUCCESS", paymentDetails: { avsResultCode: "Y", cvvResultCode: "M" } }] },
      { risk: { recommendation: "ACCEPT", assessments: [{ riskLevel: "LOW" }] }, shopifyProtect: { status: "ACTIVE" }, disputes: [] },
    );
    const facts = await readOrderPaymentFacts(admin, "7658201874670", new Date("2026-09-24T20:00:00Z"));
    expect(facts).toEqual({ billing_matches_shipping: true, avs_result_code: "Y", cvv_result_code: "M", risk_recommendation: "ACCEPT", risk_level: "LOW", shopify_protect_status: "ACTIVE", disputes: [], read_at: "2026-09-24T20:00:00.000Z" });
    expect(admin.graphql.mock.calls[0][1]).toEqual({ variables: { id: "gid://shopify/Order/7658201874670" } });
    expect(paymentFactsWords(facts)).toBe("Shopify's payment record, read 2026-09-24: address check (AVS) result Y; card-code check (CVV) result M; billing address matches the shipping address; Shopify's risk recommendation: accept (low); Shopify Protect: active; no disputes on this order.");
  });

  it("a refused query costs its own facts and nothing else", async () => {
    const admin = adminOf(new Error("Access denied for transactions"), { risk: { recommendation: "INVESTIGATE", assessments: [] }, shopifyProtect: null, disputes: [{ status: "NEEDS_RESPONSE", initiatedAs: "CHARGEBACK" }] });
    const facts = await readOrderPaymentFacts(admin, 1);
    expect(facts?.avs_result_code).toBeUndefined();
    expect(facts?.risk_recommendation).toBe("INVESTIGATE");
    expect(facts?.disputes).toEqual([{ status: "NEEDS_RESPONSE", initiated_as: "CHARGEBACK" }]);
  });

  it("pushes to the merchant's own door with the shop's key, and never throws", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await pushOrderPaymentFacts("key", "proof_" + "a".repeat(24), { avs_result_code: "Y" }, fetchImpl as never)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/proofs\/proof_a{24}\/payment-facts$/);
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer key");
    expect(await pushOrderPaymentFacts("key", "not-a-proof", { avs_result_code: "Y" }, fetchImpl as never)).toBe(false);
    expect(await pushOrderPaymentFacts("key", "proof_" + "a".repeat(24), { a: 1 } as never, (async () => { throw new Error("down"); }) as never)).toBe(false);
  });

  it("the checkout keeps its own address and agent (behind the switch the caller checks)", () => {
    const c = checkoutClientFromWebhook({ client_details: { browser_ip: "203.0.113.77", user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" } });
    expect(c?.ip).toBe("203.0.113.77");
    expect(c?.ip_prefix).toBe("203.0.113.0/24");
    expect(c?.user_agent).toContain("iPhone OS 17_0");
    expect(checkoutClientFromWebhook({ client_details: { browser_ip: "999.1.1.1" } })?.ip).toBeUndefined();
  });
});
