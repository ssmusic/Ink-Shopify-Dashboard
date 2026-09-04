// The discounts door, embed side (Track C): the backfill walks every page
// and hands each to the door; a refused read is a logged line, never a
// throw; the toml declares the five topics and both optional scopes; the
// handler and the grant hook exist and keep the webhook discipline.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  backfillDiscounts,
  fetchDiscountNode,
  DISCOUNT_NODE_QUERY,
  DISCOUNT_NODES_QUERY,
  scopeListHas,
} from "./shopify-discounts.server";

function src(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

type Admin = Parameters<typeof backfillDiscounts>[0];
function fakeAdmin(pages: unknown[], { failOn }: { failOn?: number } = {}): Admin {
  let call = 0;
  return {
    graphql: async () => {
      const i = call++;
      if (failOn === i) throw new Error("boom");
      const body = pages[i] ?? { data: { discountNodes: null } };
      return { json: async () => body };
    },
  };
}

const NODE = (id: string) => ({ id, discount: { __typename: "DiscountCodeBasic", title: `T ${id}`, status: "ACTIVE" } });

describe("backfillDiscounts", () => {
  it("walks the pages newest-updated first, posts each page as {node} entries, sums what the door wrote", async () => {
    const admin = fakeAdmin([
      { data: { discountNodes: { pageInfo: { hasNextPage: true, endCursor: "c1" }, nodes: [NODE("gid://shopify/DiscountCodeNode/1"), NODE("gid://shopify/DiscountAutomaticNode/2")] } } },
      { data: { discountNodes: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [NODE("gid://shopify/DiscountCodeNode/3")] } } },
    ]);
    const post = vi.fn(async (entries: unknown[]) => ({ written: entries.length }));
    const r = await backfillDiscounts(admin, post, { label: "[t]" });
    expect(r).toEqual({ pages: 2, nodes: 3, written: 3, truncated: false, errors: [] });
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][0]).toEqual([
      { node: NODE("gid://shopify/DiscountCodeNode/1"), source_event: "backfill" },
      { node: NODE("gid://shopify/DiscountAutomaticNode/2"), source_event: "backfill" },
    ]);
  });

  it("a page cap marks the walk partial instead of pretending it finished; a refused read is an error line, not a throw", async () => {
    const page = { data: { discountNodes: { pageInfo: { hasNextPage: true, endCursor: "c" }, nodes: [NODE("gid://shopify/DiscountCodeNode/1")] } } };
    const capped = await backfillDiscounts(fakeAdmin([page, page, page]), async (e) => ({ written: e.length }), { pageCap: 2, label: "[t]" });
    expect(capped.pages).toBe(2);
    expect(capped.truncated).toBe(true);
    const refused = await backfillDiscounts(fakeAdmin([{ errors: [{ message: "Access denied for discountNodes field. Required access: `read_discounts`" }] }]), async (e) => ({ written: e.length }), { label: "[t]" });
    expect(refused.pages).toBe(0);
    expect(refused.errors[0]).toMatch(/read_discounts/);
    const threw = await backfillDiscounts(fakeAdmin([], { failOn: 0 }), async (e) => ({ written: e.length }), { label: "[t]" });
    expect(threw.errors).toEqual(["boom"]);
  });

  it("a door that refuses one page is recorded and the walk continues", async () => {
    const page1 = { data: { discountNodes: { pageInfo: { hasNextPage: true, endCursor: "c" }, nodes: [NODE("a")] } } };
    const page2 = { data: { discountNodes: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [NODE("b")] } } };
    let n = 0;
    const r = await backfillDiscounts(fakeAdmin([page1, page2]), async (e) => { if (n++ === 0) throw new Error("promos/shopify 401"); return { written: e.length }; }, { label: "[t]" });
    expect(r.pages).toBe(2);
    expect(r.written).toBe(1);
    expect(r.errors).toEqual(["page 1: promos/shopify 401"]);
  });
});

describe("fetchDiscountNode", () => {
  it("returns the node, or null with a logged reason — never throws", async () => {
    const ok = await fetchDiscountNode(fakeAdmin([{ data: { discountNode: NODE("gid://shopify/DiscountCodeNode/1") } }]), "gid://shopify/DiscountCodeNode/1");
    expect(ok?.id).toBe("gid://shopify/DiscountCodeNode/1");
    const missing = await fetchDiscountNode(fakeAdmin([{ data: { discountNode: null } }]), "gid://x");
    expect(missing).toBeNull();
    const threw = await fetchDiscountNode(fakeAdmin([], { failOn: 0 }), "gid://x");
    expect(threw).toBeNull();
  });
});

describe("the queries select only what the 2025-10 schema carries (introspected 2026-09-04)", () => {
  it("summary is never asked of the two App members; codes never of an automatic member; every member is present", () => {
    for (const q of [DISCOUNT_NODE_QUERY, DISCOUNT_NODES_QUERY]) {
      const app = q.match(/\.\.\. on DiscountCodeApp \{([^}]*)\}/)?.[1] ?? "";
      expect(app).not.toContain("summary");
      const autoApp = q.match(/\.\.\. on DiscountAutomaticApp \{([^}]*)\}/)?.[1] ?? "";
      expect(autoApp).not.toContain("summary");
      expect(autoApp).not.toContain("codes");
      for (const member of ["DiscountCodeBasic", "DiscountCodeBxgy", "DiscountCodeFreeShipping", "DiscountCodeApp", "DiscountAutomaticBasic", "DiscountAutomaticBxgy", "DiscountAutomaticFreeShipping", "DiscountAutomaticApp"]) {
        expect(q).toContain(`... on ${member} {`);
      }
      expect(q).not.toContain("customerSelection");
    }
    expect(DISCOUNT_NODES_QUERY).toContain("sortKey: UPDATED_AT");
  });
});

describe("the door is wired end to end", () => {
  it("the toml declares the five discounts topics on one uri and both optional scopes", () => {
    const toml = src("../../shopify.app.toml");
    for (const t of ["discounts/create", "discounts/update", "discounts/delete", "discounts/redeemcode_added", "discounts/redeemcode_removed"]) {
      expect(toml).toContain(`"${t}"`);
    }
    expect(toml).toMatch(/uri = "https:\/\/shopify-app-250065525755\.us-central1\.run\.app\/webhooks\/discounts"/);
    expect(toml).toMatch(/optional_scopes = \[ "read_discounts", "write_discounts" \]/);
    // The required scopes did not move — that would be a re-consent event.
    expect(toml).not.toMatch(/scopes = "[^"]*discounts/);
  });

  it("the handler answers the five topics, always acks, and reads the node back only on create/update", () => {
    const handler = src("../routes/webhooks.discounts.ts");
    for (const t of ["DISCOUNTS_CREATE", "DISCOUNTS_UPDATE", "DISCOUNTS_DELETE", "DISCOUNTS_REDEEMCODE_ADDED", "DISCOUNTS_REDEEMCODE_REMOVED"]) {
      expect(handler).toContain(`"${t}"`);
    }
    expect(handler).toContain("authenticate.webhook(request)");
    expect(handler).toContain("reportShopifyDiscounts(apiKey, entries)");
    expect(handler).toMatch(/catch[\s\S]*acking anyway[\s\S]*return new Response\("OK", \{ status: 200 \}\)/);
    expect(handler).not.toContain("status: 500");
    expect(handler).toMatch(/topic === "DISCOUNTS_CREATE" \|\| topic === "DISCOUNTS_UPDATE"/);
  });

  it("the grant hook backfills on read_discounts, bounded, and records it on the merchant doc", () => {
    const hook = src("../routes/webhooks.app.scopes_update.tsx");
    expect(hook).toContain("current.includes(DISCOUNTS_READ_SCOPE)");
    expect(hook).toContain("backfillDiscounts(admin");
    expect(hook).toMatch(/WEBHOOK_BACKFILL_PAGE_CAP = 3/);
    expect(hook).toContain("discounts_backfilled_at");
    // The scope record it always wrote is still written first.
    expect(hook).toContain('scope: current.toString()');
  });

  it("the settings card asks with App Bridge's modal, never a redirect", () => {
    const card = src("../components/settings/DiscountsSettings.tsx");
    expect(card).toContain("scopes.request");
    expect(card).not.toContain("window.location.href");
    expect(card).not.toContain("location.assign");
    expect(card).not.toContain("window.open");
    const route = src("../routes/app.api.settings.discounts.tsx");
    expect(route).toContain("authenticate.admin(request)");
    expect(route).not.toMatch(/await scopes\.request\(/);
  });

  it("the enroll-critical query is untouched — the money comes from the webhook body, not a selection", () => {
    const route = src("../routes/webhooks.orders_create.ts");
    expect(route).toContain("money: orderMoneyFromWebhook(data)");
    const critical = route.slice(route.indexOf("ORDER_DETAIL_QUERY = `"), route.indexOf("`;", route.indexOf("ORDER_DETAIL_QUERY = `") + 22));
    expect(critical).not.toContain("discountCodes");
    expect(critical).not.toContain("discountApplications");
  });
});

describe("scopeListHas", () => {
  it("reads Shopify's comma list", () => {
    expect(scopeListHas("read_orders,read_discounts", "read_discounts")).toBe(true);
    expect(scopeListHas("read_orders, write_discounts", "read_discounts")).toBe(false);
    expect(scopeListHas(null, "read_discounts")).toBe(false);
  });
});
