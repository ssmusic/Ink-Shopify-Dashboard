import { describe, expect, it, vi } from "vitest";
import { readInkConnection, readShopLogo } from "./ink-connection.server";

const shop = "sample-store.myshopify.com";
const logo = "https://cdn.shopify.com/s/files/1/1234/files/logo.png?v=1";
const logoBody = (url: unknown = logo) => ({
  data: { shop: { brand: { squareLogo: { image: { url } } } } },
});
const identity = {
  data: { shop: { name: "Sample store", myshopifyDomain: shop } },
};
const insights = {
  shop_id: "shop_sample",
  throughput: { enrollments: 4, opened: 3, open_rate_pct: 75 },
  integrity: { geofence: { gps_count: 1 } },
};
const admin = (body: unknown = identity) => ({
  graphql: vi.fn(async (_query: string) => Response.json(body)),
});
const transport = (body: unknown = insights) =>
  vi.fn(async (url: RequestInfo | URL) =>
    Response.json(String(url).includes("graphql.json") ? logoBody() : body),
  );

describe("store logo", () => {
  it("reads only public branding from the session shop without credentials or new scopes", async () => {
    const f = vi.fn(async () => Response.json(logoBody()));
    expect(await readShopLogo(shop, f)).toBe(logo);
    expect(f).toHaveBeenCalledWith(
      `https://${shop}/api/2025-10/graphql.json`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "error",
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it.each([
    "elsewhere.test",
    "sample.myshopify.com.evil.test",
    "sample.myshopify.com/path",
    "user@sample.myshopify.com",
    "https://sample.myshopify.com",
  ])("does not request an untrusted host: %s", async (domain) => {
    const f = vi.fn();
    expect(await readShopLogo(domain, f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it.each([
    null,
    "http://cdn.shopify.com/logo.png",
    "https://cdn.shopify.com.evil.test/logo.png",
    "https://a:b@cdn.shopify.com/logo.png",
    "javascript:alert(1)",
  ])("rejects missing or unsafe logo URLs: %s", async (url) => {
    expect(
      await readShopLogo(shop, async () => Response.json(logoBody(url))),
    ).toBeNull();
  });
  it("uses the standard logo if no square logo exists", async () => {
    expect(
      await readShopLogo(shop, async () =>
        Response.json({
          data: { shop: { brand: { logo: { image: { url: logo } } } } },
        }),
      ),
    ).toBe(logo);
  });
  it("fails softly on errors, redirects, invalid JSON and absent branding", async () => {
    for (const f of [
      async () => new Response(null, { status: 302 }),
      async () => new Response("bad json"),
      async () =>
        Response.json({ errors: [{ message: "Denied" }], ...logoBody() }),
      async () => Response.json({ data: { shop: { brand: null } } }),
      async () => {
        throw new Error("network error");
      },
    ])
      expect(await readShopLogo(shop, f)).toBeNull();
  });
});

describe("connection checks", () => {
  it("checks Shopify identity and the merchant's own ink data independently; projects no key or private data", async () => {
    const a = admin();
    const f = transport({
      ...insights,
      api_key: "never-return",
      customer_email: "private@example.test",
    });
    const result = await readInkConnection({
      admin: a,
      shop,
      shopId: "shop_sample",
      apiKey: "own-key",
      fetchImpl: f,
    });
    expect(result).toMatchObject({
      shop,
      name: "Sample store",
      logoUrl: logo,
      shopify: "connected",
      ink: "connected",
    });
    expect(a.graphql.mock.calls[0][0]).not.toMatch(
      /email|accountOwner|staffMember|accessToken/,
    );
    expect(f).toHaveBeenCalledWith(
      expect.stringContaining("merchant-insights"),
      expect.objectContaining({
        headers: { Authorization: "Bearer own-key" },
        redirect: "error",
      }),
    );
    expect(JSON.stringify(result)).not.toMatch(/own-key|never-return|private@/);
  });
  it.each([
    null,
    {},
    { ...insights, shop_id: "shop_other" },
    { ...insights, throughput: null },
  ])(
    "does not report a malformed or wrong-tenant backend response as connected",
    async (body) => {
      expect(
        await readInkConnection({
          admin: admin(),
          shop,
          shopId: "shop_sample",
          apiKey: "key",
          fetchImpl: transport(body),
        }),
      ).toMatchObject({ shopify: "connected", ink: "unavailable" });
    },
  );
  it("does not treat installation credentials as a live data check", async () => {
    const result = await readInkConnection({
      admin: admin({ errors: [{ message: "Denied" }], ...identity }),
      shop,
      shopId: "shop_sample",
      apiKey: "key",
      fetchImpl: transport(),
    });
    expect(result).toMatchObject({
      shopify: "unavailable",
      ink: "connected",
      name: shop,
    });
  });
  it("rejects a different Shopify store's identity", async () => {
    const result = await readInkConnection({
      admin: admin({
        data: {
          shop: { name: "Other", myshopifyDomain: "other.myshopify.com" },
        },
      }),
      shop,
      shopId: "shop_sample",
      apiKey: "key",
      fetchImpl: transport(),
    });
    expect(result).toMatchObject({ shopify: "unavailable", name: shop });
  });
  it("shows setup incomplete when no key exists and makes no backend request", async () => {
    const f = transport();
    const result = await readInkConnection({
      admin: admin(),
      shop,
      shopId: "",
      apiKey: null,
      fetchImpl: f,
    });
    expect(result.ink).toBe("setup");
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith(
      expect.stringContaining("graphql.json"),
      expect.anything(),
    );
  });
});
