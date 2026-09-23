// TWO APPS, ONE MERCHANT RECORD — shop/redact must not erase what the other
// app is still serving.
//
// The Ritualist and ink share the embed doc and the backend merchant. A
// store holding both that uninstalls one gets that app a shop/redact 48h
// later; a purge there would leave the other app with no api key and no
// proofs. So the handler asks whether the other app still holds an offline
// session for the shop before it deletes anything. This is the ONE
// deliberate change on the Ritualist's own path in the ink build, and it
// only changes behaviour when an ink session exists — impossible until ink
// is live. Both sides pinned here: no session → the purge exactly as before;
// a session → nothing touched, 200; Firestore unable to answer → 500, so
// Shopify retries rather than an unknown purging.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const webhook = vi.fn();
vi.mock("../shopify.server", () => ({ authenticate: { webhook } }));

const SHOP = "made-up-shop.myshopify.com";
const sessionQuery = { get: vi.fn() };
const merchantDelete = vi.fn();
const collections: string[] = [];
const fakeFirestore = {
  collection: (name: string) => {
    collections.push(name);
    return {
      // shopify_sessions*: .where().where().limit().get()
      where: () => ({ where: () => ({ limit: () => sessionQuery }), limit: () => ({ get: async () => ({ empty: true }) }) }),
      // merchants: .doc(shop).delete()
      doc: () => ({ delete: merchantDelete, create: async () => {} }),
    };
  },
};
vi.mock("../firestore.server", () => ({ default: fakeFirestore }));

const purgeShopInInk = vi.fn();
vi.mock("./ink-api.server", () => ({ purgeShopInInk }));

async function redact() {
  webhook.mockResolvedValue({ topic: "SHOP_REDACT", shop: SHOP });
  const { action } = await import("../routes/webhooks.shop.redact");
  return action({ request: new Request("https://app.test/webhooks/shop/redact", { method: "POST" }), params: {}, context: {} } as any);
}

beforeEach(() => {
  vi.resetModules();
  collections.length = 0;
  sessionQuery.get.mockReset();
  merchantDelete.mockReset().mockResolvedValue(undefined);
  purgeShopInInk.mockReset().mockResolvedValue({ ok: true, status: 200, body: { counts: { proofs: 3 } } });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("shop/redact on the Ritualist (APP_FLAVOR unset)", () => {
  beforeEach(() => vi.stubEnv("APP_FLAVOR", ""));

  it("asks ink's session collection, and with no ink session purges exactly as before", async () => {
    sessionQuery.get.mockResolvedValue({ empty: true });
    const res = await redact();
    expect(res.status).toBe(200);
    expect(collections[0]).toBe("shopify_sessions_ink");
    expect(merchantDelete).toHaveBeenCalledTimes(1);
    expect(purgeShopInInk).toHaveBeenCalledWith(SHOP);
  });

  it("purges nothing while ink is still installed on the store", async () => {
    sessionQuery.get.mockResolvedValue({ empty: false });
    const res = await redact();
    expect(res.status).toBe(200);
    expect(merchantDelete).not.toHaveBeenCalled();
    expect(purgeShopInInk).not.toHaveBeenCalled();
  });

  it("defers (500, Shopify retries) when Firestore cannot say — an unknown never purges", async () => {
    sessionQuery.get.mockRejectedValue(new Error("unavailable"));
    const res = await redact();
    expect(res.status).toBe(500);
    expect(merchantDelete).not.toHaveBeenCalled();
    expect(purgeShopInInk).not.toHaveBeenCalled();
  });
});

describe("shop/redact on ink (APP_FLAVOR=ink)", () => {
  beforeEach(() => vi.stubEnv("APP_FLAVOR", "ink"));

  it("asks the Ritualist's session collection, and purges only when the Ritualist is gone too", async () => {
    sessionQuery.get.mockResolvedValue({ empty: false });
    expect((await redact()).status).toBe(200);
    expect(collections).toContain("shopify_sessions");
    expect(purgeShopInInk).not.toHaveBeenCalled();

    sessionQuery.get.mockResolvedValue({ empty: true });
    expect((await redact()).status).toBe(200);
    expect(purgeShopInInk).toHaveBeenCalledWith(SHOP);
  });
});
