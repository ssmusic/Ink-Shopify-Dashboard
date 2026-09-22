// WHAT AN INK INSTALL DOES — against stubs for the backend, the doc and the
// Worker. The contract with chip A (create `plan`) and chip C (the capture
// door) is what this pins: the words on the wire, in the order they go.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMerchant = vi.fn();
const getShopIdByDomain = vi.fn();
const patchMerchant = vi.fn();
const getMerchant = vi.fn();
const updateMerchant = vi.fn();
const captureBrandMark = vi.fn();

vi.mock("./ink-api.server", () => ({ createMerchant, getShopIdByDomain, patchMerchant }));
vi.mock("./merchant.server", () => ({ getMerchant, updateMerchant }));
vi.mock("./brand-mark.server", () => ({ captureBrandMark }));

const SHOP = "made-up-shop.myshopify.com";

function adminAnswering(shop: Record<string, unknown> | Error) {
  return {
    graphql: vi.fn(async () => {
      if (shop instanceof Error) throw shop;
      return { json: async () => ({ data: { shop } }) } as unknown as Response;
    }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  updateMerchant.mockResolvedValue(undefined);
  captureBrandMark.mockResolvedValue({ ok: true, status: 200, logoUrl: "https://cdn.test/mark.svg", slug: "made-up-goods", slugNote: "made-up-goods.in.ink claimed", note: "mark captured: https://cdn.test/mark.svg; host made-up-goods.in.ink" });
});

afterEach(() => vi.unstubAllEnvs());

describe("provisionInkMerchant", () => {
  it("creates the backend merchant with plan ink, seeds the doc, then captures the mark", async () => {
    getMerchant.mockResolvedValue(null);
    createMerchant.mockResolvedValue({ shop_id: "shop_abc123", api_key: "ink_live_key" });
    const admin = adminAnswering({
      name: "Made-Up Goods",
      email: "owner@example.test",
      contactEmail: "hello@example.test",
      primaryDomain: { url: "https://www.made-up-goods.test" },
    });

    const { provisionInkMerchant } = await import("./ink-install.server");
    const out = await provisionInkMerchant({ admin, shop: SHOP });

    expect(createMerchant).toHaveBeenCalledWith(SHOP, "Made-Up Goods", "owner@example.test", { plan: "ink" });

    // The doc: the key, background mode, and the backend id — and nothing
    // the Ritualist seeds (its notification toggles are for rails ink has none of).
    expect(updateMerchant).toHaveBeenNthCalledWith(1, SHOP, {
      ink_api_key: "ink_live_key",
      verified_delivery_mode: "background",
      ink_shop_id: "shop_abc123",
    });
    expect(updateMerchant.mock.calls[0][1]).not.toHaveProperty("notification_settings");

    // The capture: the storefront's own address and the backend id.
    expect(captureBrandMark).toHaveBeenCalledWith({ site: "https://www.made-up-goods.test", shopId: "shop_abc123" });

    // The attempt recorded, so the onboarding screen can stop waiting.
    expect(updateMerchant).toHaveBeenNthCalledWith(2, SHOP, {
      ink_mark_captured_at: expect.any(String),
      ink_mark_capture_note: "mark captured: https://cdn.test/mark.svg; host made-up-goods.in.ink",
      // The host the Worker claimed in the same call — the label the record
      // now holds, never one derived from the myshopify domain (#1016).
      ink_brand_slug: "made-up-goods",
    });

    expect(out).toMatchObject({ outcome: "provisioned", shopId: "shop_abc123", capture: { ok: true } });
  });

  it("leaves a doc that already carries an api key exactly as it is — one install per store, whichever app made it", async () => {
    getMerchant.mockResolvedValue({ ink_api_key: "ink_live_existing" });
    const admin = adminAnswering({ name: "x", email: "e@example.test" });

    const { provisionInkMerchant } = await import("./ink-install.server");
    const out = await provisionInkMerchant({ admin, shop: SHOP });

    expect(out).toEqual({ outcome: "already_provisioned" });
    expect(admin.graphql).not.toHaveBeenCalled();
    expect(createMerchant).not.toHaveBeenCalled();
    expect(updateMerchant).not.toHaveBeenCalled();
    expect(captureBrandMark).not.toHaveBeenCalled();
  });

  // PLAN PRECEDENCE, order 1 (plan-precedence.server.ts): the Ritualist was
  // installed first, so the shared doc carries its key and the backend
  // merchant is on the paid plan (absent = ritualist). ink's install must
  // not touch it — no create (which would ROTATE the key), no PATCH (which
  // would downgrade the plan). An ink install never downgrades.
  it("never downgrades a merchant the Ritualist made: no create, no PATCH plan, nothing written", async () => {
    getMerchant.mockResolvedValue({
      shop: SHOP,
      ink_api_key: "ink_live_ritualists",
      notification_settings: { channels: { email: true } },
      // No ink_shop_id: the Ritualist's own provision wrote this doc.
    });
    const admin = adminAnswering({ name: "x", email: "e@example.test" });

    const { provisionInkMerchant } = await import("./ink-install.server");
    expect(await provisionInkMerchant({ admin, shop: SHOP })).toEqual({ outcome: "already_provisioned" });

    expect(createMerchant).not.toHaveBeenCalled();
    expect(patchMerchant).not.toHaveBeenCalled();
    expect(updateMerchant).not.toHaveBeenCalled();
  });

  it("sends plan: ink only on its own create, and nowhere else", async () => {
    getMerchant.mockResolvedValue(null);
    createMerchant.mockResolvedValue({ shop_id: "shop_abc123", api_key: "k" });
    const admin = adminAnswering({ name: "x", email: "e@example.test", primaryDomain: { url: "https://x.test" } });

    const { provisionInkMerchant } = await import("./ink-install.server");
    await provisionInkMerchant({ admin, shop: SHOP });

    expect(createMerchant.mock.calls[0][3]).toEqual({ plan: "ink" });
    expect(patchMerchant).not.toHaveBeenCalled();
  });

  it("waits for a real owner email rather than provisioning with a placeholder", async () => {
    getMerchant.mockResolvedValue(null);
    const admin = adminAnswering({ name: "x", email: null, contactEmail: null });

    const { provisionInkMerchant } = await import("./ink-install.server");
    const out = await provisionInkMerchant({ admin, shop: SHOP });

    expect(out).toEqual({ outcome: "no_owner_email" });
    expect(createMerchant).not.toHaveBeenCalled();
  });

  it("records a failed capture too — the screen offers 'look again' instead of waiting forever", async () => {
    getMerchant.mockResolvedValue(null);
    createMerchant.mockResolvedValue({ shop_id: "shop_abc123", api_key: "k" });
    captureBrandMark.mockResolvedValue({ ok: false, status: 0, logoUrl: null, slug: null, slugNote: null, note: "brand-mark capture failed: fetch failed" });
    const admin = adminAnswering({ name: "x", email: "e@example.test", primaryDomain: { url: "https://x.test" } });

    const { provisionInkMerchant } = await import("./ink-install.server");
    const out = await provisionInkMerchant({ admin, shop: SHOP });

    expect(out).toMatchObject({ outcome: "provisioned", capture: { ok: false } });
    expect(updateMerchant).toHaveBeenLastCalledWith(SHOP, {
      ink_mark_captured_at: expect.any(String),
      ink_mark_capture_note: "brand-mark capture failed: fetch failed",
    });
  });

  it("records the host even when the mark was not found — no mark is not no door", async () => {
    getMerchant.mockResolvedValue(null);
    createMerchant.mockResolvedValue({ shop_id: "shop_abc123", api_key: "k" });
    captureBrandMark.mockResolvedValue({
      ok: false, status: 404, logoUrl: null,
      slug: "plainbrand", slugNote: "plainbrand.in.ink claimed",
      note: "the Worker refused the capture: no mark could be found on this site; host plainbrand.in.ink",
    });
    const admin = adminAnswering({ name: "Plain", email: "e@example.test", primaryDomain: { url: "https://www.plainbrand.test" } });

    const { provisionInkMerchant } = await import("./ink-install.server");
    await provisionInkMerchant({ admin, shop: SHOP });

    expect(updateMerchant).toHaveBeenLastCalledWith(SHOP, {
      ink_mark_captured_at: expect.any(String),
      ink_mark_capture_note: "the Worker refused the capture: no mark could be found on this site; host plainbrand.in.ink",
      ink_brand_slug: "plainbrand",
    });
  });

  it("still provisions when the identity query fails — the capture then has no site and says so", async () => {
    getMerchant.mockResolvedValue(null);
    const admin = adminAnswering(new Error("boom"));

    const { provisionInkMerchant } = await import("./ink-install.server");
    const out = await provisionInkMerchant({ admin, shop: SHOP });

    // No email could be read, so it waits for the next load, like the Ritualist's.
    expect(out).toEqual({ outcome: "no_owner_email" });
  });
});

describe("resolveInkShopId", () => {
  it("uses the id the install recorded and never scans the list for it", async () => {
    const { resolveInkShopId } = await import("./ink-install.server");
    expect(await resolveInkShopId(SHOP, { ink_shop_id: "shop_from_doc" })).toBe("shop_from_doc");
    expect(getShopIdByDomain).not.toHaveBeenCalled();
  });

  it("falls back to the list scan for a doc the Ritualist wrote, and to '' when nobody knows", async () => {
    const { resolveInkShopId } = await import("./ink-install.server");
    getShopIdByDomain.mockResolvedValueOnce("shop_from_list");
    expect(await resolveInkShopId(SHOP, {})).toBe("shop_from_list");
    getShopIdByDomain.mockRejectedValueOnce(new Error("Merchant not found"));
    expect(await resolveInkShopId(SHOP, null)).toBe("");
  });
});

describe("SHOP_IDENTITY_QUERY_INK", () => {
  it("asks for the storefront's address and needs no scope for it", async () => {
    const { SHOP_IDENTITY_QUERY_INK } = await import("./ink-install.server");
    expect(SHOP_IDENTITY_QUERY_INK).toContain("primaryDomain { url }");
    expect(SHOP_IDENTITY_QUERY_INK).toContain("contactEmail");
    expect(SHOP_IDENTITY_QUERY_INK).not.toMatch(/\bcustomer\b/);
  });
});
