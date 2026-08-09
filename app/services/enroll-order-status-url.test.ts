// SHOPIFY HAS BEEN SENDING US THIS THE WHOLE TIME.
//
// The orders/create webhook body carries `order_status_url` — the buyer's own
// order-status page on the merchant's site, no login required. We never read
// it, so no proof has ever held one, and the tap page has had no honest way to
// offer "view your order".
//
// Nothing downstream needed changing to accept it: the backend's validation
// spreads unknown keys and the serializer emits the whole order_details object,
// so a field added here reaches the customer wire for free.
//
// What this file guards is the ABSENCE rule. The tap page hides the link when
// the field is missing (law 7 — the Clare-V law), and it can only do that if
// missing means MISSING. An empty string would render a dead door, and the
// entire existing order base — including both live rigs — will never have this
// field, so the absent case is the common one, not the edge one.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

function lastPayload(): any {
  const [, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  // The module throws at import time without this (ink-api.server.ts:5).
  vi.stubEnv("INK_ADMIN_SECRET", "test-secret");
  vi.stubEnv("INK_API_URL", "https://api.test");
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ proof_id: "proof_1" }),
    json: async () => ({ proof_id: "proof_1" }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function enroll(orderContext?: {
  orderStatusUrl?: string | null;
  shopDomain?: string | null;
}) {
  const { enrollOrder } = await import("./ink-api.server");
  await enrollOrder(
    "key_1",
    "1018",
    "nfc_tok_1",
    "#1018",
    "dana@example.com",
    { name: "Dana Ruiz", city: "Austin" },
    [{ title: "Lanyard Tote", qty: 1 }],
    undefined,
    undefined,
    undefined,
    undefined,
    "UPS",
    "1Z999",
    null,
    orderContext,
  );
}

describe("what enroll tells the backend about the order", () => {
  it("carries the buyer's order-status page when Shopify sent one", async () => {
    await enroll({
      orderStatusUrl: "https://sm-test-hhawzn52.myshopify.com/orders/abc123",
      shopDomain: "sm-test-hhawzn52.myshopify.com",
    });

    expect(lastPayload().order_details.order_status_url).toBe(
      "https://sm-test-hhawzn52.myshopify.com/orders/abc123",
    );
  });

  it("carries the real shop domain alongside it", async () => {
    // proof.merchant and proof.shop_id are BOTH the merchant_id — despite the
    // comment on the former saying `shop_domain` — so nothing on the wire has
    // ever held the actual host.
    await enroll({ orderStatusUrl: "https://x.test/o/1", shopDomain: "sm-test-hhawzn52.myshopify.com" });

    expect(lastPayload().order_details.shop_domain).toBe("sm-test-hhawzn52.myshopify.com");
  });

  it("OMITS the field entirely when Shopify sent nothing — never an empty string", async () => {
    await enroll({ orderStatusUrl: null, shopDomain: null });

    const details = lastPayload().order_details;
    expect("order_status_url" in details).toBe(false);
    expect("shop_domain" in details).toBe(false);
  });

  it("omits it when no context is passed at all", async () => {
    // The warehouse and tagged-shipments enroll paths don't pass one. They must
    // keep sending byte-identical payloads.
    await enroll(undefined);

    const details = lastPayload().order_details;
    expect("order_status_url" in details).toBe(false);
    expect("shop_domain" in details).toBe(false);
  });

  it("leaves the rest of the payload exactly as it was", async () => {
    await enroll({ orderStatusUrl: "https://x.test/o/1", shopDomain: "x.test" });
    const payload = lastPayload();

    expect(payload.order_id).toBe("1018");
    expect(payload.nfc_token).toBe("nfc_tok_1");
    expect(payload.carrier_name).toBe("UPS");
    expect(payload.tracking_number).toBe("1Z999");
    expect(payload.order_details.order_number).toBe("#1018");
    expect(payload.order_details.customer_name).toBe("Dana Ruiz");
    expect(payload.order_details.customer_email).toBe("dana@example.com");
    expect(payload.order_details.product_details).toEqual([
      { title: "Lanyard Tote", qty: 1 },
    ]);
  });
});
