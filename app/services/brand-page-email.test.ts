// THE BRAND'S OWN EMAIL — the decider's fences, each proven to refuse.
//
// This module can put a second email in a buyer's inbox. Everything here is
// about the cases where it must not: the switch it is off behind by default,
// a test shop reaching a real customer, an order that already had one, a page
// that does not exist, and a rail whose refusal must come back in words rather
// than as a silent success.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const resolveBrandPageUrl = vi.hoisted(() => vi.fn());
vi.mock("./brand-page-url.server", () => ({ resolveBrandPageUrl }));

import {
  sendBrandPageEmailOnce,
  brandPageEmailEnabled,
  looksLikeAnAddress,
  postalLineOf,
  SENT_KEY,
  BUYER_MAIL_PATH,
} from "./brand-page-email.server";

const ORDER_GID = "gid://shopify/Order/7658201874670";

type Loose = Record<string, unknown>;

function fakeAdmin({ sent = null as string | null, stampErrors = [] as Loose[] }) {
  const calls: Array<{ query: string; variables?: Loose }> = [];
  return {
    calls,
    graphql: vi.fn(async (query: string, opts?: { variables?: Loose }) => {
      calls.push({ query, variables: opts?.variables });
      if (query.includes("InkBrandPageEmailStamp")) {
        return { json: async () => ({ data: { metafieldsSet: { userErrors: stampErrors } } }) } as unknown as Response;
      }
      return {
        json: async () => ({
          data: { order: { name: "#1027", metafield: sent ? { value: sent } : null } },
        }),
      } as unknown as Response;
    }),
  };
}

function fakeFetch(body: Loose = { ok: true, sent: true }, status = 200) {
  return vi.fn(async () => ({
    ok: status < 400,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

const BRAND_DOC = {
  brand_slug: "stevemadden",
  shop_name: "SM Test",
  support_email: "support@example.com",
  owner_email: "owner@example.com",
  return_address: { name: "SM Test", street1: "1 Example St", city: "New York", state: "NY", zip: "10001", country: "US" },
};

type Overrides = Partial<Parameters<typeof sendBrandPageEmailOnce>[0]>;

const run = (over: Overrides = {}) =>
  sendBrandPageEmailOnce({
    admin: fakeAdmin({}),
    shop: "sm-test-hhawzn52.myshopify.com",
    orderGid: ORDER_GID,
    orderName: "#1027",
    customerEmail: "buyer@example.com",
    proofId: "proof_1",
    fulfillmentId: "6983263912174",
    merchantApiKey: "ink_x",
    merchantData: { brand_page_email: true },
    fetchImpl: fakeFetch(),
    ...over,
  });

beforeEach(() => {
  resolveBrandPageUrl.mockReset();
  resolveBrandPageUrl.mockResolvedValue({
    pageUrl: "https://stevemadden.in.ink/r/nfc_tok",
    nfcToken: "nfc_tok",
    brandSlug: "stevemadden",
    proofShopId: "shop_bb508e5ca47a1036",
    brandDoc: BRAND_DOC,
    customerTier: null,
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.BUYER_MAIL_SECRET = "s3cret";
  delete process.env.BRAND_PAGE_EMAIL_DISABLED;
  delete process.env.SEND_ALLOWLIST;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.BUYER_MAIL_SECRET;
  delete process.env.BRAND_PAGE_EMAIL_DISABLED;
  delete process.env.SEND_ALLOWLIST;
});

describe("the switch is OFF until a merchant says otherwise", () => {
  it("DEFAULT OFF: only an explicit true turns it on", () => {
    expect(brandPageEmailEnabled({})).toBe(false);
    expect(brandPageEmailEnabled(undefined)).toBe(false);
    expect(brandPageEmailEnabled({ brand_page_email: false })).toBe(false);
    expect(brandPageEmailEnabled({ brand_page_email: true })).toBe(true);
  });

  it("an untouched merchant sends nothing, and touches no wire at all", async () => {
    const fetchImpl = fakeFetch();
    const admin = fakeAdmin({});
    const out = await run({ merchantData: {}, admin, fetchImpl });
    expect(out.outcome).toBe("skipped_disabled_merchant");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it("the env kill switch beats the merchant's own on", async () => {
    process.env.BRAND_PAGE_EMAIL_DISABLED = "1";
    const fetchImpl = fakeFetch();
    expect((await run({ fetchImpl })).outcome).toBe("skipped_disabled_env");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("the refusals", () => {
  it("no shared secret means nothing is attempted, and the log says which one", async () => {
    delete process.env.BUYER_MAIL_SECRET;
    const fetchImpl = fakeFetch();
    const out = await run({ fetchImpl });
    expect(out.outcome).toBe("skipped_no_secret");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("an order with no customer address reaches nobody", async () => {
    const fetchImpl = fakeFetch();
    expect((await run({ customerEmail: null, fetchImpl })).outcome).toBe("skipped_no_recipient");
    expect((await run({ customerEmail: "  ", fetchImpl })).outcome).toBe("skipped_no_recipient");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("NO PAGE, NO EMAIL — never a host nobody serves (the #1016 law)", async () => {
    // brandSlug is populated and plausible; the DOC does not carry brand_slug.
    resolveBrandPageUrl.mockResolvedValue({
      pageUrl: "https://sm-test-hhawzn52.in.ink/r/nfc_tok",
      brandSlug: "sm-test-hhawzn52",
      brandDoc: {},
      proofShopId: "shop_x",
    });
    const fetchImpl = fakeFetch();
    expect((await run({ fetchImpl })).outcome).toBe("skipped_no_page_url");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a test shop never reaches a real customer", async () => {
    resolveBrandPageUrl.mockResolvedValue({
      pageUrl: "https://stevemadden.in.ink/r/nfc_tok",
      brandSlug: "stevemadden",
      proofShopId: "shop_x",
      brandDoc: { ...BRAND_DOC, returns_test_mode: true },
    });
    const fetchImpl = fakeFetch();
    expect((await run({ fetchImpl })).outcome).toBe("skipped_test_merchant");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a test shop MAY reach the merchant's own address — that is how it is tried", async () => {
    resolveBrandPageUrl.mockResolvedValue({
      pageUrl: "https://stevemadden.in.ink/r/nfc_tok",
      brandSlug: "stevemadden",
      proofShopId: "shop_x",
      brandDoc: { ...BRAND_DOC, is_test: true },
    });
    const out = await run({ customerEmail: "owner@example.com" });
    expect(out.outcome).toBe("sent");
  });

  it("one email per order, ever", async () => {
    const fetchImpl = fakeFetch();
    const admin = fakeAdmin({ sent: "2026-09-05T02:10:00.000Z" });
    const out = await run({ admin, fetchImpl });
    expect(out.outcome).toBe("skipped_already_sent");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never throws, whatever the wire does", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("dns"); }) as unknown as typeof fetch;
    const out = await run({ fetchImpl });
    expect(out.outcome).toBe("failed");
    expect(out.detail).toContain("dns");
  });
});

describe("what it asks the rail for", () => {
  it("posts the brand, the page, the reply-to and the fulfilment it is keyed on", async () => {
    const fetchImpl = fakeFetch();
    await run({ fetchImpl });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain(BUYER_MAIL_PATH);
    expect((init.headers as Record<string, string>)["X-Buyer-Mail-Secret"]).toBe("s3cret");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      shop_id: "shop_bb508e5ca47a1036",
      fulfillment_id: "6983263912174",
      to: "buyer@example.com",
      brand_slug: "stevemadden",
      brand_name: "SM Test",
      page_url: "https://stevemadden.in.ink/r/nfc_tok",
      reply_to: "support@example.com",
      test_context: false,
      owner_email: "owner@example.com",
    });
    expect(body.postal_address).toContain("1 Example St");
  });

  it("tells the rail when the shop is a test shop, so the fence exists on both sides", async () => {
    resolveBrandPageUrl.mockResolvedValue({
      pageUrl: "https://stevemadden.in.ink/r/nfc_tok",
      brandSlug: "stevemadden",
      proofShopId: "shop_x",
      brandDoc: { ...BRAND_DOC, is_test: true },
    });
    const fetchImpl = fakeFetch();
    await run({ customerEmail: "owner@example.com", fetchImpl });
    expect(JSON.parse((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body).test_context).toBe(true);
  });
});

describe("the rail's own words come back", () => {
  it("a refusal is relayed verbatim, never dressed as a send", async () => {
    const out = await run({ fetchImpl: fakeFetch({ ok: false, error: "Resend 403: domain is not verified" }, 502) });
    expect(out.outcome).toBe("refused_by_worker");
    expect(out.detail).toContain("domain is not verified");
  });

  it("a 200 that sent nothing is NOT a send — the success-costume law", async () => {
    const admin = fakeAdmin({});
    const out = await run({ admin, fetchImpl: fakeFetch({ ok: true, sent: false, reason: "suppressed — bounced previously" }) });
    expect(out.outcome).toBe("refused_by_worker");
    expect(out.detail).toContain("suppressed");
    // And nothing was stamped, so a later fix can still send.
    expect(admin.calls.some((c) => c.query.includes("Stamp"))).toBe(false);
  });

  it("stamps the order only after a real send", async () => {
    const admin = fakeAdmin({});
    const out = await run({ admin });
    expect(out.outcome).toBe("sent");
    const stamp = admin.calls.find((c) => c.query.includes("InkBrandPageEmailStamp"));
    expect((stamp?.variables?.metafields as Loose[])[0]).toMatchObject({
      ownerId: ORDER_GID,
      namespace: "ink",
      key: SENT_KEY,
    });
  });

  it("a failed stamp still reports the send — the rail's own key is the remaining guard", async () => {
    const admin = fakeAdmin({ stampErrors: [{ message: "throttled" }] });
    expect((await run({ admin })).outcome).toBe("sent");
  });
});

describe("the small honest helpers", () => {
  it("an address is an address", () => {
    expect(looksLikeAnAddress("a@b.co")).toBe(true);
    expect(looksLikeAnAddress("a b@b.co")).toBe(false);
    expect(looksLikeAnAddress("a@b")).toBe(false);
    expect(looksLikeAnAddress("")).toBe(false);
    expect(looksLikeAnAddress(null)).toBe(false);
    expect(looksLikeAnAddress(`${"x".repeat(250)}@b.co`)).toBe(false);
  });

  it("the postal line is the merchant's own, or nothing at all", () => {
    expect(postalLineOf(BRAND_DOC)).toBe("SM Test, 1 Example St, New York, NY, 10001, US");
    expect(postalLineOf({})).toBeNull();
    expect(postalLineOf({ return_address: {} })).toBeNull();
  });
});
