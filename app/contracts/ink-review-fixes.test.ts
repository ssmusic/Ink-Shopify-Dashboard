// THE 2026-09-23 APP STORE REVIEW OF ink — the fixes, pinned.
//
//   · ink's App URL opened with no store sends the visitor to ink's own page
//     (www.in.ink), never the Ritualist's landing ("the ritualist.", "a page
//     you own") and never a form asking for a shop domain (requirement 2.3.1).
//     With `?shop=` both doors behave exactly as before.
//   · No webhook logs a buyer's phone number, name or email (review B11).
//   · The shared order panel no longer prints "Shipping — Free" on every order.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../shopify.server", () => ({
  login: vi.fn(async (request: Request) => {
    const shop = new URL(request.url).searchParams.get("shop");
    if (shop) throw new Response(null, { status: 302, headers: { Location: `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/oauth/install` } });
    return { shop: "MISSING_SHOP" };
  }),
}));

const { loader: rootLoader } = await import("../routes/_index/route");
const { loader: loginLoader } = await import("../routes/auth.login/route");

afterEach(() => vi.unstubAllEnvs());

async function outcome(fn: () => Promise<unknown>): Promise<{ status: number; location: string | null } | { data: unknown }> {
  try {
    return { data: await fn() };
  } catch (thrown) {
    if (thrown instanceof Response) return { status: thrown.status, location: thrown.headers.get("Location") };
    throw thrown;
  }
}

const args = (url: string) => ({ request: new Request(url), params: {}, context: {} }) as any;

describe("ink's App URL with no store (App Store review, 2026-09-23)", () => {
  it("sends / to ink's own page under ink — never the Ritualist's landing", async () => {
    vi.stubEnv("APP_FLAVOR", "ink");
    expect(await outcome(() => rootLoader(args("https://install.in.ink/")))).toEqual({ status: 302, location: "https://www.in.ink/" });
  });

  it("still opens ink's screen when Shopify brings a store", async () => {
    vi.stubEnv("APP_FLAVOR", "ink");
    expect(await outcome(() => rootLoader(args("https://install.in.ink/?shop=a.myshopify.com&host=x")))).toEqual({
      status: 302,
      location: "/app/ink?shop=a.myshopify.com&host=x",
    });
  });

  it("leaves the Ritualist's landing as it was", async () => {
    vi.stubEnv("APP_FLAVOR", "");
    expect(await outcome(() => rootLoader(args("https://app.in.ink/")))).toEqual({ data: { showForm: true } });
  });

  it("never asks for a shop domain under ink (2.3.1): /auth/login with no store goes to ink's page", async () => {
    vi.stubEnv("APP_FLAVOR", "ink");
    expect(await outcome(() => loginLoader(args("https://install.in.ink/auth/login")))).toEqual({ status: 302, location: "https://www.in.ink/" });
  });

  it("still starts Shopify's install for a named store", async () => {
    vi.stubEnv("APP_FLAVOR", "ink");
    const r = await outcome(() => loginLoader(args("https://install.in.ink/auth/login?shop=fresh-shop.myshopify.com")));
    expect(r).toEqual({ status: 302, location: "https://admin.shopify.com/store/fresh-shop/oauth/install" });
  });

  it("leaves the Ritualist's login page as it was", async () => {
    vi.stubEnv("APP_FLAVOR", "");
    const r = await outcome(() => loginLoader(args("https://app.in.ink/auth/login")));
    expect("data" in r).toBe(true);
  });
});

describe("no buyer data in the logs, and no false line in the order panel", () => {
  const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("no webhook interpolates a buyer's phone, name or email into a log line (review B11)", () => {
    const files = [
      "app/routes/webhooks.orders_create.ts",
      "app/routes/webhooks.orders_fulfilled.tsx",
      "app/routes/webhooks.fulfillments_create.tsx",
      "app/routes/webhooks.fulfillments_update.tsx",
      "app/routes/webhooks.customers.data_request.tsx",
      "app/routes/webhooks.customers.redact.tsx",
      "app/routes/webhooks.shop.redact.tsx",
    ];
    // The value itself (`${customerPhone}` or `${customerPhone || "—"}`); a yes/no about it is fine.
    const pii = /console\.(log|warn|error|info)\([^;]*\$\{\s*(shippingPhone|orderPhone|customerPhone|finalPhone|customerName|customerEmail)\s*(\}|\|\||\?\?)/;
    for (const f of files) expect(src(f), f).not.toMatch(pii);
    // The pattern does catch the line this review removed.
    expect("console.log(`📱 Phone selection — shipping: ${shippingPhone || \"—\"}`)").toMatch(pii);
  });

  it("the order panel prints no 'Shipping — Free' line", () => {
    const panel = src("app/components/OrderExpandedRow.tsx");
    expect(panel).not.toMatch(/>\s*Free\s*</);
  });
});
