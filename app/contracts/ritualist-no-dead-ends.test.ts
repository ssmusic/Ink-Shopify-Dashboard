// THE RITUALIST'S ADDRESS, OPENED OUTSIDE SHOPIFY'S ADMIN — pinned (2026-09-24).
//
// Before the round-six resubmission, app.in.ink's own buttons led to /app,
// where the library's App Bridge bounce rendered "200" (the round-two 2.1.1
// page), and /auth/login asked the visitor to type a shop domain (2.3.1).
//
//   · The landing's two buttons go to the Ritualist's sign-in at in.ink.
//   · /auth/login with no store sends the visitor to the landing; with
//     `?shop=` it still starts Shopify's install.
//   · A browser tab opening /app with no store goes to the landing; a load
//     inside the admin's iframe, a fetch with a session token, and anything
//     carrying a store keep the library's path. ink's /app is untouched.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authenticateAdmin = vi.fn(async () => {
  // Stands in for the library's own answer; the loader never gets further.
  throw new Response("library path", { status: 299 });
});

vi.mock("../shopify.server", () => ({
  authenticate: { admin: authenticateAdmin },
  registerWebhooks: vi.fn(async () => undefined),
  login: vi.fn(async (request: Request) => {
    const shop = new URL(request.url).searchParams.get("shop");
    if (shop) throw new Response(null, { status: 302, headers: { Location: `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/oauth/install` } });
    return { shop: "MISSING_SHOP" };
  }),
}));
vi.mock("../services/carrier-service.server", () => ({ ensureCarrierServiceRegistered: vi.fn(async () => undefined) }));
vi.mock("../services/ink-api.server", () => ({ createMerchant: vi.fn(async () => null) }));
vi.mock("../services/merchant.server", () => ({ getMerchant: vi.fn(async () => null), updateMerchant: vi.fn(async () => undefined) }));
vi.mock("../services/ink-install.server", () => ({ provisionInkMerchant: vi.fn(async () => undefined) }));
vi.mock("../services/plan-precedence.server", () => ({ claimRitualistPlan: vi.fn(async () => undefined) }));

const { isDirectVisitWithoutAStore } = await import("../services/direct-visit.server");
const { loader: appLoader } = await import("../routes/app");
const { loader: loginLoader, action: loginAction } = await import("../routes/auth.login/route");
const { default: Landing } = await import("../routes/_index/route");

// A block, not an expression: a hook's returned function is run as its
// teardown, and mockClear() returns the mock itself.
beforeEach(() => {
  authenticateAdmin.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

async function outcome(fn: () => Promise<unknown>): Promise<{ status: number; location: string | null } | { data: unknown }> {
  try {
    return { data: await fn() };
  } catch (thrown) {
    if (thrown instanceof Response) return { status: thrown.status, location: thrown.headers.get("Location") };
    throw thrown;
  }
}

const tab = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { headers: { "sec-fetch-dest": "document", ...headers } });
const args = (request: Request) => ({ request, params: {}, context: {} }) as any;

describe("which requests are a browser tab with no store", () => {
  it("a tab opening /app with nothing attached", () => {
    expect(isDirectVisitWithoutAStore(tab("https://app.in.ink/app"))).toBe(true);
    expect(isDirectVisitWithoutAStore(tab("https://app.in.ink/app/billing"))).toBe(true);
  });

  it("never a load inside the admin's iframe, a fetch, or a browser that does not say", () => {
    expect(isDirectVisitWithoutAStore(tab("https://app.in.ink/app", { "sec-fetch-dest": "iframe" }))).toBe(false);
    expect(isDirectVisitWithoutAStore(tab("https://app.in.ink/app.data", { "sec-fetch-dest": "empty" }))).toBe(false);
    expect(isDirectVisitWithoutAStore(new Request("https://app.in.ink/app"))).toBe(false);
  });

  it("never anything carrying a store or a token", () => {
    expect(isDirectVisitWithoutAStore(tab("https://app.in.ink/app?shop=a.myshopify.com&host=x"))).toBe(false);
    expect(isDirectVisitWithoutAStore(tab("https://app.in.ink/app?host=x"))).toBe(false);
    expect(isDirectVisitWithoutAStore(tab("https://app.in.ink/app?id_token=t"))).toBe(false);
    expect(isDirectVisitWithoutAStore(tab("https://app.in.ink/app", { authorization: "Bearer t" }))).toBe(false);
    expect(isDirectVisitWithoutAStore(new Request("https://app.in.ink/app", { method: "POST", headers: { "sec-fetch-dest": "document" } }))).toBe(false);
  });
});

describe("/app opened in a browser tab", () => {
  it("sends the Ritualist's visitor to the landing, before the library is asked", async () => {
    vi.stubEnv("APP_FLAVOR", "");
    expect(await outcome(() => appLoader(args(tab("https://app.in.ink/app"))))).toEqual({ status: 302, location: "/" });
    expect(authenticateAdmin).not.toHaveBeenCalled();
  });

  it("leaves the admin's own loads to the library", async () => {
    vi.stubEnv("APP_FLAVOR", "");
    const inFrame = await outcome(() => appLoader(args(tab("https://app.in.ink/app?shop=a.myshopify.com&host=x&embedded=1", { "sec-fetch-dest": "iframe" }))));
    expect(inFrame).toEqual({ status: 299, location: null });
    expect(authenticateAdmin).toHaveBeenCalledTimes(1);
  });

  it("leaves ink's /app exactly as it was", async () => {
    vi.stubEnv("APP_FLAVOR", "ink");
    expect(await outcome(() => appLoader(args(tab("https://install.in.ink/app"))))).toEqual({ status: 299, location: null });
    expect(authenticateAdmin).toHaveBeenCalledTimes(1);
  });
});

describe("/auth/login never asks the Ritualist's visitor for a shop domain (2.3.1)", () => {
  it("sends a visitor with no store to the landing", async () => {
    vi.stubEnv("APP_FLAVOR", "");
    expect(await outcome(() => loginLoader(args(new Request("https://app.in.ink/auth/login"))))).toEqual({ status: 302, location: "/" });
  });

  it("sends a posted form with no store to the landing too", async () => {
    vi.stubEnv("APP_FLAVOR", "");
    const posted = new Request("https://app.in.ink/auth/login", { method: "POST", body: new URLSearchParams({ shop: "typed.myshopify.com" }) });
    expect(await outcome(() => loginAction(args(posted)))).toEqual({ status: 302, location: "/" });
  });

  it("still starts Shopify's install for a named store", async () => {
    vi.stubEnv("APP_FLAVOR", "");
    expect(await outcome(() => loginLoader(args(new Request("https://app.in.ink/auth/login?shop=fresh-shop.myshopify.com"))))).toEqual({
      status: 302,
      location: "https://admin.shopify.com/store/fresh-shop/oauth/install",
    });
  });
});

describe("the landing's buttons", () => {
  it("both go to the Ritualist's sign-in, and neither to /app", async () => {
    const router = createMemoryRouter([{ path: "/", element: createElement(Landing) }], { initialEntries: ["/"] });
    const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
    expect(html.match(/href="https:\/\/www\.in\.ink\/login"/g)).toHaveLength(2);
    expect(html).not.toContain('href="/app"');
  });
});
