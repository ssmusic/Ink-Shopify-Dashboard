// WHAT INK'S SCREENS READ — the merchant view's pure edges: the stage the
// onboarding screen polls on, the mark, the name in type, the forward dial.

import { describe, expect, it, vi } from "vitest";

vi.mock("../firestore.server", () => ({ default: { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) } }));
vi.mock("./merchant.server", () => ({ getMerchant: vi.fn() }));
vi.mock("./ink-install.server", () => ({ resolveInkShopId: vi.fn() }));

const { brandNameOf, flashForwardOf, markOf, stageOf } = await import("./ink-merchant.server");

const view = (over: Partial<{ doc: any; backend: any }> = {}) => ({
  shop: "made-up-shop.myshopify.com",
  doc: null,
  shopId: "shop_1",
  backend: null,
  ...over,
});

describe("stageOf — what the onboarding screen waits on", () => {
  it("is provisioning until the install has written the api key", () => {
    expect(stageOf(null)).toBe("provisioning");
    expect(stageOf({})).toBe("provisioning");
  });

  it("is capturing while an ink install's Worker call has not answered", () => {
    expect(stageOf({ ink_api_key: "k", ink_shop_id: "shop_1" })).toBe("capturing");
  });

  it("is ready once the capture has an answer — found or not", () => {
    expect(stageOf({ ink_api_key: "k", ink_shop_id: "shop_1", ink_mark_captured_at: "2026-09-22T00:00:00Z" })).toBe("ready");
  });

  it("is ready at once for a doc the Ritualist provisioned — no ink capture will ever come", () => {
    expect(stageOf({ ink_api_key: "k" })).toBe("ready");
  });
});

describe("markOf / brandNameOf", () => {
  it("reads the mark the Worker wrote onto the backend doc, never derives one", () => {
    expect(markOf(view({ backend: { brand_logo_url: " https://cdn.test/m.svg " } }))).toBe("https://cdn.test/m.svg");
    expect(markOf(view({ backend: { brand_logo_url: "" } }))).toBeNull();
    expect(markOf(view())).toBeNull();
  });

  it("prints the backend's shop_name, then the embed's, then the bare domain", () => {
    expect(brandNameOf(view({ backend: { shop_name: "Made-Up Goods" }, doc: { shopName: "Embed Name" } }))).toBe("Made-Up Goods");
    expect(brandNameOf(view({ doc: { shopName: "Embed Name" } }))).toBe("Embed Name");
    expect(brandNameOf(view())).toBe("made-up-shop");
  });
});

describe("flashForwardOf — the dial as the backend holds it", () => {
  it("is order_status unless the backend says carrier (the backend's own default)", () => {
    expect(flashForwardOf(view())).toBe("order_status");
    expect(flashForwardOf(view({ backend: { flash_forward: "carrier" } }))).toBe("carrier");
    expect(flashForwardOf(view({ backend: { flash_forward: "order_status" } }))).toBe("order_status");
    expect(flashForwardOf(view({ backend: { flash_forward: "somewhere-else" } }))).toBe("order_status");
  });
});
