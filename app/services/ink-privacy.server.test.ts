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
  get: async () => ({
    exists: bucket(name).has(id),
    data: () => bucket(name).get(id),
  }),
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
  runTransaction: async (fn: (tx: any) => Promise<any>) => fn({
    get: (ref: any) => ref.get(),
    update: (ref: any, value: any) => ref.update(value),
  }),
};
const otherAppHoldsSession = vi.fn();
const thisAppHoldsSession = vi.fn();
const purgeShopInInk = vi.fn();
const redactCustomerInInk = vi.fn();
const exportCustomerFromInk = vi.fn();
const webhook = vi.fn();
vi.mock("../firestore.server", () => ({ default: firestore }));
vi.mock("../firestore-session-storage.server", () => ({
  otherAppHoldsSession,
  thisAppHoldsSession,
  SESSION_COLLECTION: "shopify_sessions_ink",
}));
vi.mock("./ink-api.server", () => ({ purgeShopInInk, redactCustomerInInk, exportCustomerFromInk }));
vi.mock("./plan-precedence.server", () => ({
  restoreInkPlanOnRitualistUninstall: vi.fn(),
}));
vi.mock("../shopify.server", () => ({ authenticate: { webhook } }));
const { handleInkPrivacy, processPendingPrivacy, readPrivacyRequests, exportPrivacyRequest, PRIVACY_COLLECTION } =
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
  thisAppHoldsSession.mockResolvedValue(false);
  purgeShopInInk.mockResolvedValue({ ok: true });
  redactCustomerInInk.mockResolvedValue({ ok: true });
  exportCustomerFromInk.mockResolvedValue({
    ok: true,
    status: 200,
    body: { ok: true, shop_resolved: true, export: { kind: "ink.customer_data_export", counts: { orders: 1 }, orders: [{ proof_id: "proof_x" }] } },
  });
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
    "saves a deletion before acknowledgement and retries backend failure (%s)",
    async (status) => {
      redactCustomerInInk.mockResolvedValue({ ok: false, status });
      expect((await handleInkPrivacy("redact", shop, payload)).status).toBe(
        200,
      );
      expect((await processPendingPrivacy()).failed).toBe(1);
      expect(bucket(PRIVACY_COLLECTION).size).toBe(1);
      expect([...bucket(PRIVACY_COLLECTION).values()][0]).toMatchObject({ state: "pending", attempts: 1 });
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
    expect((await processPendingPrivacy()).processed).toBe(1);
    expect([...bucket(PRIVACY_COLLECTION).values()]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        topic: "customers/data_request",
        customerId: null,
        email: null,
        orderIds: [],
        state: "response_required_after_redaction",
      }),
    ]));
  });
  it("scrubs matching order-only access requests during customer redaction", async () => {
    await handleInkPrivacy("data_request", shop, { orders_requested: [789] });
    await handleInkPrivacy("redact", shop, { orders_to_redact: [789] });
    await processPendingPrivacy();
    expect([...bucket(PRIVACY_COLLECTION).values()]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        orderIds: [],
        state: "response_required_after_redaction",
      }),
    ]));
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
    expect((await handleInkPrivacy("shop", shop, {})).status).toBe(200);
    expect((await processPendingPrivacy()).failed).toBe(1);
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
    expect((await processPendingPrivacy()).processed).toBe(1);
    for (const name of [
      "shopify_sessions_ink",
      "ink_record_charges",
      "record_charges",
    ])
      expect([...bucket(name).keys()]).toEqual(["other"]);
    expect(bucket("merchants").has(shop)).toBe(false);
    expect(bucket(PRIVACY_COLLECTION).size).toBe(0);
  });
  it("keeps a reinstalled store whole: no purge, no session erased, the receipt says why", async () => {
    thisAppHoldsSession.mockResolvedValue(true);
    bucket("shopify_sessions_ink").set("own", { shop });
    bucket("merchants").set(shop, { key: "private" });
    expect((await handleInkPrivacy("shop", shop, {})).status).toBe(200);
    expect((await processPendingPrivacy()).processed).toBe(1);
    expect(purgeShopInInk).not.toHaveBeenCalled();
    expect(bucket("shopify_sessions_ink").has("own")).toBe(true);
    expect(bucket("merchants").has(shop)).toBe(true);
    expect([...bucket(PRIVACY_COLLECTION).values()].map((v) => v.state)).toEqual(["skipped_reinstalled"]);
  });

  it("preserves the active other app while deleting ink-owned data", async () => {
    otherAppHoldsSession.mockResolvedValue(true);
    bucket("merchants").set(shop, { key: "private" });
    bucket("ink_record_charges").set("own", { shop });
    await handleInkPrivacy("data_request", shop, payload);
    const receiptId = [...bucket(PRIVACY_COLLECTION).keys()][0];
    expect((await handleInkPrivacy("shop", shop, {})).status).toBe(200);
    expect((await processPendingPrivacy()).processed).toBe(1);
    expect(purgeShopInInk).not.toHaveBeenCalled();
    expect(bucket("merchants").has(shop)).toBe(true);
    expect(bucket("ink_record_charges").size).toBe(0);
    expect(bucket(PRIVACY_COLLECTION).has(receiptId)).toBe(true);
  });
  it("keeps the two apps' deletion receipts separate on a shared shop", async () => {
    expect((await handleInkPrivacy("shop", shop, {})).status).toBe(200);
    vi.stubEnv("APP_FLAVOR", "");
    expect((await handleInkPrivacy("shop", shop, {})).status).toBe(200);
    const values = [...bucket(PRIVACY_COLLECTION).values()];
    expect(values).toHaveLength(2);
    expect(values.map((v) => v.appFlavor).sort()).toEqual(["ink", "ritualist"]);
  });
  it("lets the Ritualist erase only its own charge bindings while Ink. remains installed", async () => {
    vi.stubEnv("APP_FLAVOR", "");
    otherAppHoldsSession.mockResolvedValue(true);
    bucket("record_charges").set("ritualist", { shop });
    bucket("ink_record_charges").set("ink", { shop });
    await handleInkPrivacy("shop", shop, {});
    expect((await processPendingPrivacy("ritualist")).processed).toBe(1);
    expect(purgeShopInInk).not.toHaveBeenCalled();
    expect(bucket("record_charges").size).toBe(0);
    expect(bucket("ink_record_charges").size).toBe(1);
  });
  it("does not take a job while another worker holds an unexpired lease", async () => {
    await handleInkPrivacy("redact", shop, payload);
    const [key, receipt] = [...bucket(PRIVACY_COLLECTION)][0];
    bucket(PRIVACY_COLLECTION).set(key, {
      ...receipt, state: "processing", leaseUntil: new Date(Date.now() + 120000).toISOString(),
    });
    expect((await processPendingPrivacy()).processed).toBe(0);
    expect(redactCustomerInInk).not.toHaveBeenCalled();
  });
  it("resumes a failed deletion from its saved receipt", async () => {
    redactCustomerInInk.mockResolvedValueOnce({ ok: false, status: 500 }).mockResolvedValueOnce({ ok: true, status: 200 });
    await handleInkPrivacy("redact", shop, payload);
    expect((await processPendingPrivacy()).failed).toBe(1);
    const [key, receipt] = [...bucket(PRIVACY_COLLECTION)][0];
    bucket(PRIVACY_COLLECTION).set(key, { ...receipt, nextAttemptAt: new Date(0).toISOString() });
    expect((await processPendingPrivacy()).processed).toBe(1);
    expect(bucket(PRIVACY_COLLECTION).get(key)).toMatchObject({
      state: "completed", customerId: null, email: null, orderIds: [], attempts: 1,
    });
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

describe("a customer data request, answered", () => {
  const onlyRequest = () => [...bucket(PRIVACY_COLLECTION).entries()][0];

  it("downloads what ink holds for that customer, asked of the backend with the request's own identifiers, and marks it downloaded", async () => {
    await handleInkPrivacy("data_request", shop, payload);
    const [id] = onlyRequest();
    const out = await exportPrivacyRequest(shop, id);
    expect(out).toMatchObject({ ok: true, filename: "ink-customer-data-123.json" });
    expect(exportCustomerFromInk).toHaveBeenCalledWith({
      shopDomain: shop,
      customerId: "456",
      customerEmail: "private@example.test",
      orderIds: ["789"],
    });
    if (!out.ok) throw new Error("expected a download");
    expect(out.download).toMatchObject({ kind: "ink.customer_data_export", request_id: "123", orders: [{ proof_id: "proof_x" }] });
    expect(onlyRequest()[1]).toMatchObject({ state: "downloaded" });
    const listed = await readPrivacyRequests(shop);
    expect(listed[0]).toMatchObject({ state: "downloaded" });
    expect(listed[0].downloadedAt).toEqual(expect.any(String));
    expect(JSON.stringify(listed)).not.toMatch(/private|customerId|orderIds|phone/);
  });

  it("stores no copy of the customer's data in this app", async () => {
    await handleInkPrivacy("data_request", shop, payload);
    await exportPrivacyRequest(shop, onlyRequest()[0]);
    expect(JSON.stringify([...bucket(PRIVACY_COLLECTION).values()])).not.toContain("proof_x");
  });

  it("refuses another shop's request, a deletion receipt and a malformed id, and asks the backend nothing", async () => {
    await handleInkPrivacy("data_request", "other.myshopify.com", payload);
    const [otherId] = onlyRequest();
    expect(await exportPrivacyRequest(shop, otherId)).toMatchObject({ ok: false });
    collections.clear();
    redactCustomerInInk.mockResolvedValue({ ok: false, status: 500 });
    await handleInkPrivacy("redact", shop, payload);
    expect(await exportPrivacyRequest(shop, onlyRequest()[0])).toMatchObject({ ok: false });
    expect(await exportPrivacyRequest(shop, "../merchants/x")).toMatchObject({ ok: false });
    expect(exportCustomerFromInk).not.toHaveBeenCalled();
  });

  it("says so, in the file, when the customer was erased before anyone downloaded it", async () => {
    await handleInkPrivacy("data_request", shop, payload);
    await handleInkPrivacy("redact", shop, payload);
    await processPendingPrivacy();
    const out = await exportPrivacyRequest(shop, onlyRequest()[0]);
    if (!out.ok) throw new Error("expected the note file");
    expect(String(out.download.note)).toContain("deleted by a Shopify deletion request");
    expect(out.download.orders).toEqual([]);
    expect(exportCustomerFromInk).not.toHaveBeenCalled();
  });

  it("keeps a downloaded copy downloaded when the customer is erased afterwards", async () => {
    await handleInkPrivacy("data_request", shop, payload);
    await exportPrivacyRequest(shop, onlyRequest()[0]);
    await handleInkPrivacy("redact", shop, payload);
    await processPendingPrivacy();
    expect(onlyRequest()[1]).toMatchObject({ state: "downloaded", customerId: null, email: null, orderIds: [] });
  });

  it("never marks a failed export downloaded", async () => {
    exportCustomerFromInk.mockResolvedValue({ ok: false, status: 0, body: { error: "timeout" } });
    await handleInkPrivacy("data_request", shop, payload);
    expect(await exportPrivacyRequest(shop, onlyRequest()[0])).toMatchObject({ ok: false });
    expect(onlyRequest()[1]).toMatchObject({ state: "pending" });
  });

  it("answers a store the backend does not know with a file that says ink holds nothing", async () => {
    exportCustomerFromInk.mockResolvedValue({ ok: true, status: 200, body: { ok: true, shop_resolved: false, export: null } });
    await handleInkPrivacy("data_request", shop, payload);
    const out = await exportPrivacyRequest(shop, onlyRequest()[0]);
    if (!out.ok) throw new Error("expected the note file");
    expect(out.download).toMatchObject({ note: "ink holds no records for this store.", orders: [] });
  });
});
