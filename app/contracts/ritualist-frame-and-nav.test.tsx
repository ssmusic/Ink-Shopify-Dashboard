// THE RITUALIST WEARS INK'S FRAME AND NAV — pinned (2026-09-24).
//
// Sam, with ink's Orders and Dashboard beside The Ritualist: "make the site
// identical to this width and nav look on top bar and left side representing
// all pages".
//
//   · The pill bar on top is ink's bar exactly: PillNav, drawn from ink's own
//     pills, renders the same markup as InkPillNav for every section.
//   · The Ritualist's pills and the admin's left nav (NavMenu) name the same
//     five pages in the same order, and each page lights its own pill.
//   · Every Ritualist page is `fullWidth` inside ink's width, with the pills
//     under its title; the thin tab bar is gone.
//   · /app opens the Dashboard, as ink's /app opens its Orders.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../shopify.server", () => ({ authenticate: { admin: vi.fn(async () => ({})) } }));

const { default: InkPillNav } = await import("../components/InkPillNav");
const { default: PillNav } = await import("../components/PillNav");
const { default: RitualistPillNav, RITUALIST_PILLS, ritualistPillFor } = await import("../components/RitualistPillNav");
const { PAGE_WIDTH } = await import("../components/PolarisAppLayout");
const { loader: appIndexLoader } = await import("../routes/app._index/route");

afterEach(() => vi.unstubAllEnvs());

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const inRouter = (element: React.ReactElement, at = "/") =>
  renderToStaticMarkup(
    createElement(RouterProvider, { router: createMemoryRouter([{ path: "*", element }], { initialEntries: [at] }) }),
  );

const INK_PILLS = [
  { id: "insights", label: "Dashboard", to: "/app/ink/dashboard" },
  { id: "orders", label: "Orders", to: "/app/ink/orders" },
  { id: "records", label: "Records", to: "/app/ink/records" },
  { id: "settings", label: "Settings", to: "/app/ink/settings" },
  { id: "help", label: "Help", to: "/app/ink/help" },
] as const;

describe("the pill bar is ink's bar", () => {
  it("draws ink's pills exactly as InkPillNav does, for every section", () => {
    for (const active of ["insights", "orders", "records", "settings", "help"] as const) {
      const ink = inRouter(createElement(InkPillNav, { active }));
      const shared = inRouter(createElement(PillNav, { pills: INK_PILLS, active, label: "ink." }));
      expect(shared, active).toBe(ink);
    }
  });
});

describe("The Ritualist's pages, on top and on the left", () => {
  it("has five pills in its own order, each to its own page", () => {
    expect(RITUALIST_PILLS.map((p) => [p.label, p.to])).toEqual([
      ["Dashboard", "/app/dashboard"],
      ["Orders", "/app/tagged-shipments"],
      ["Settings", "/app/settings"],
      ["Billing", "/app/billing"],
      ["Help", "/app/help"],
    ]);
  });

  it("lights the page you are on: an order's own view is Orders, every Settings tab is Settings", () => {
    expect(ritualistPillFor("/app/dashboard")).toBe("dashboard");
    expect(ritualistPillFor("/app/tagged-shipments")).toBe("orders");
    expect(ritualistPillFor("/app/orders/123")).toBe("orders");
    expect(ritualistPillFor("/app/settings")).toBe("settings");
    expect(ritualistPillFor("/app/billing")).toBe("billing");
    expect(ritualistPillFor("/app/help")).toBe("help");
    const html = inRouter(createElement(RitualistPillNav), "/app/billing");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page" data-pill="billing"/);
    expect(html).toContain('aria-label="The Ritualist"');
  });

  it("the admin's left nav names the same five pages, in the same order, behind a hidden home", () => {
    const shell = src("app/routes/app.tsx");
    const menus = [...shell.matchAll(/<NavMenu>(.*?)<\/NavMenu>/g)].map((m) => m[1]);
    const ritualist = menus.find((m) => m.includes('href="/app/dashboard"'));
    expect(ritualist, "a NavMenu for The Ritualist").toBeTruthy();
    const links = [...ritualist!.matchAll(/<a href="([^"]+)"( rel="home")?>([^<]+)<\/a>/g)].map((m) => ({ href: m[1], home: Boolean(m[2]), label: m[3] }));
    expect(links[0]).toEqual({ href: "/app", home: true, label: "Dashboard" });
    expect(links.slice(1).map((l) => [l.label, l.href])).toEqual(RITUALIST_PILLS.map((p) => [p.label, p.to]));
    // ink's own menu is untouched.
    expect(menus.some((m) => m.includes('href="/app/ink/records"'))).toBe(true);
  });
});

describe("every Ritualist page wears ink's width, with the pills under its title", () => {
  it("the frame is ink's width", () => {
    const ink = src("app/routes/app.ink.$section.tsx").match(/export const INK_PAGE_WIDTH = (\{[^}]*\})/)?.[1];
    expect(ink).toBe('{ maxWidth: 1400, margin: "0 auto" }');
    expect(PAGE_WIDTH).toEqual({ maxWidth: 1400, margin: "0 auto" });
    expect(src("app/components/PolarisAppLayout.tsx")).not.toContain("TopNav");
  });

  for (const page of [
    "app/routes/app.dashboard.tsx",
    "app/routes/app.tagged-shipments._index.tsx",
    "app/components/settings/Settings.tsx",
    "app/routes/app.billing.tsx",
    "app/routes/app.help.tsx",
    "app/components/OrderDetailView.tsx",
  ]) {
    it(`${page} is fullWidth and draws the pills`, () => {
      const t = src(page);
      expect(t).toMatch(/<Page\s+fullWidth/);
      expect(t).toContain("<RitualistPillNav />");
    });
  }
});

describe("/app opens a page of the nav", () => {
  const at = (url: string) => ({ request: new Request(url), params: {}, context: {} }) as any;
  const thrown = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (r) {
      if (r instanceof Response) return { status: r.status, location: r.headers.get("Location") };
      throw r;
    }
    return null;
  };

  it("The Ritualist opens its Dashboard, keeping the admin's params", async () => {
    vi.stubEnv("APP_FLAVOR", "");
    expect(await thrown(() => appIndexLoader(at("https://app.in.ink/app?shop=a.myshopify.com&host=x")))).toEqual({
      status: 302,
      location: "/app/dashboard?shop=a.myshopify.com&host=x",
    });
  });

  it("ink still opens its Orders", async () => {
    vi.stubEnv("APP_FLAVOR", "ink");
    expect(await thrown(() => appIndexLoader(at("https://install.in.ink/app?shop=a.myshopify.com")))).toEqual({
      status: 302,
      location: "/app/ink/orders?shop=a.myshopify.com",
    });
  });
});
