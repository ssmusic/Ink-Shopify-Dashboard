import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const collections = new Map<string, Map<string, any>>();
const bucket = (name: string) => {
  if (!collections.has(name)) collections.set(name, new Map());
  return collections.get(name)!;
};
const document = (name: string, id: string): any => ({
  id,
  create: async (v: any) => {
    if (bucket(name).has(id))
      throw Object.assign(new Error("exists"), { code: 6 });
    bucket(name).set(id, v);
  },
  delete: async () => {
    bucket(name).delete(id);
  },
  update: async (v: any) => {
    bucket(name).set(id, { ...bucket(name).get(id), ...v });
  },
});
const firestore = {
  collection: (name: string) => ({
    doc: (id: string) => document(name, id),
    where: (field: string, _: string, value: any) => {
      const get = async () => {
        const docs = [...bucket(name)]
          .filter(([, v]) => v[field] === value)
          .map(([id, v]) => ({ id, ref: document(name, id), data: () => v }));
        return { empty: !docs.length, docs };
      };
      return { get, limit: () => ({ get }) };
    },
  }),
  batch: () => {
    const refs: any[] = [];
    return {
      delete: (ref: any) => refs.push(ref),
      commit: async () => {
        for (const r of refs) await r.delete();
      },
    };
  },
};
const otherAppHoldsSession = vi.fn();
const purgeShopInInk = vi.fn();
const redactCustomerInInk = vi.fn();
const webhook = vi.fn();
vi.mock("../firestore.server", () => ({ default: firestore }));
vi.mock("../firestore-session-storage.server", () => ({
  otherAppHoldsSession,
  SESSION_COLLECTION: "shopify_sessions_ink",
}));
vi.mock("./ink-api.server", () => ({ purgeShopInInk, redactCustomerInInk }));
vi.mock("./plan-precedence.server", () => ({
  restoreInkPlanOnRitualistUninstall: vi.fn(),
}));
vi.mock("../shopify.server", () => ({ authenticate: { webhook } }));
const { handleInkPrivacy, readPrivacyRequests, PRIVACY_COLLECTION } =
  await import("./ink-privacy.server");
const shop = "demo.myshopify.com";
const payload = {
  data_request: { id: 123 },
  customer: { id: 456, email: "private@example.test", phone: "555" },
  orders_requested: [789],
};
beforeEach(() => {
  collections.clear();
  vi.clearAllMocks();
  vi.stubEnv("APP_FLAVOR", "ink");
  otherAppHoldsSession.mockResolvedValue(false);
  purgeShopInInk.mockResolvedValue({ ok: true });
  redactCustomerInInk.mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllEnvs());
describe("ink privacy requests", () => {
  it("persists access requests before acknowledgement, idempotently and without phone", async () => {
    expect((await handleInkPrivacy("data_request", shop, payload)).status).toBe(
      200,
    );
    const first = [...bucket(PRIVACY_COLLECTION).values()][0];
    expect(first).toMatchObject({
      state: "pending",
      customerId: "456",
      requestId: "123",
      orderIds: ["789"],
    });
    expect(first).not.toHaveProperty("phone");
    await handleInkPrivacy("data_request", shop, payload);
    expect(bucket(PRIVACY_COLLECTION).size).toBe(1);
    expect([...bucket(PRIVACY_COLLECTION).values()][0].dueAt).toBe(first.dueAt);
    expect(
      Date.parse(first.dueAt) - Date.parse(first.receivedAt),
    ).toBeGreaterThanOrEqual(30 * 86400000 - 10);
  });
  it("only exposes receipt metadata to the authenticated Settings screen", async () => {
    await handleInkPrivacy("data_request", shop, payload);
    await handleInkPrivacy("data_request", "other.myshopify.com", payload);
    const out = await readPrivacyRequests(shop);
    expect(out).toHaveLength(1);
    expect(JSON.stringify(out)).not.toMatch(
      /private|customerId|orderIds|phone/,
    );
  });
  it.each([404, 500, 0])(
    "does not acknowledge a failed deletion (%s) as complete",
    async (status) => {
      redactCustomerInInk.mockResolvedValue({ ok: false, status });
      expect((await handleInkPrivacy("redact", shop, payload)).status).toBe(
        503,
      );
      expect(bucket(PRIVACY_COLLECTION).size).toBe(1);
      expect(redactCustomerInInk).toHaveBeenCalledWith({
        shopDomain: shop,
        customerId: "456",
        customerEmail: "private@example.test",
        orderIds: ["789"],
      });
    },
  );
  it("scrubs access-request identifiers on redaction but does not claim their export was delivered", async () => {
    await handleInkPrivacy("data_request", shop, payload);
    expect((await handleInkPrivacy("redact", shop, payload)).status).toBe(200);
    expect([...bucket(PRIVACY_COLLECTION).values()]).toEqual([
      expect.objectContaining({
        topic: "customers/data_request",
        customerId: null,
        email: null,
        orderIds: [],
        state: "response_required_after_redaction",
      }),
    ]);
  });
  it("scrubs matching order-only access requests during customer redaction", async () => {
    await handleInkPrivacy("data_request", shop, { orders_requested: [789] });
    await handleInkPrivacy("redact", shop, { orders_to_redact: [789] });
    expect([...bucket(PRIVACY_COLLECTION).values()]).toEqual([
      expect.objectContaining({
        orderIds: [],
        state: "response_required_after_redaction",
      }),
    ]);
  });
  it("deletes ink sessions even when uninstall arrives without a resolved session", async () => {
    bucket("shopify_sessions_ink").set("own", { shop });
    bucket("shopify_sessions_ink").set("other", {
      shop: "other.myshopify.com",
    });
    webhook.mockResolvedValue({
      shop,
      topic: "APP_UNINSTALLED",
      session: undefined,
    });
    const { action } = await import("../routes/webhooks.app.uninstalled");
    expect(
      (
        await action({
          request: new Request("https://app.test/webhook", { method: "POST" }),
        } as any)
      ).status,
    ).toBe(200);
    expect([...bucket("shopify_sessions_ink").keys()]).toEqual(["other"]);
  });
  it("retains a pending shop request and merchant configuration after a backend purge failure", async () => {
    bucket("merchants").set(shop, { key: "private" });
    purgeShopInInk.mockResolvedValue({ ok: false, status: 404 });
    expect((await handleInkPrivacy("shop", shop, {})).status).toBe(503);
    expect(bucket("merchants").has(shop)).toBe(true);
    expect([...bucket(PRIVACY_COLLECTION).values()][0]).toMatchObject({
      topic: "shop/redact",
      state: "pending",
    });
  });
  it("erases app sessions and charge references after a successful shop purge, scoped to this shop", async () => {
    for (const name of [
      "shopify_sessions_ink",
      "ink_record_charges",
      "record_charges",
    ]) {
      bucket(name).set("own", { shop });
      bucket(name).set("other", { shop: "other.myshopify.com" });
    }
    bucket("merchants").set(shop, { key: "private" });
    expect((await handleInkPrivacy("shop", shop, {})).status).toBe(200);
    for (const name of [
      "shopify_sessions_ink",
      "ink_record_charges",
      "record_charges",
    ])
      expect([...bucket(name).keys()]).toEqual(["other"]);
    expect(bucket("merchants").has(shop)).toBe(false);
    expect(bucket(PRIVACY_COLLECTION).size).toBe(0);
  });
  it("preserves the active other app while deleting ink-owned data", async () => {
    otherAppHoldsSession.mockResolvedValue(true);
    bucket("merchants").set(shop, { key: "private" });
    bucket("ink_record_charges").set("own", { shop });
    expect((await handleInkPrivacy("shop", shop, {})).status).toBe(200);
    expect(purgeShopInInk).not.toHaveBeenCalled();
    expect(bucket("merchants").has(shop)).toBe(true);
    expect(bucket("ink_record_charges").size).toBe(0);
  });
  it.each([
    "webhooks.customers.data_request",
    "webhooks.customers.redact",
    "webhooks.shop.redact",
  ])("authenticates %s before any data operation", async (file) => {
    const invalid = new Response("Unauthorized", { status: 401 });
    webhook.mockRejectedValue(invalid);
    const { action } = await import(`../routes/${file}.tsx`);
    await expect(
      action({
        request: new Request("https://app.test/webhook", { method: "POST" }),
      }),
    ).rejects.toBe(invalid);
    expect(collections.size).toBe(0);
    expect(purgeShopInInk).not.toHaveBeenCalled();
    expect(redactCustomerInInk).not.toHaveBeenCalled();
  });
});
