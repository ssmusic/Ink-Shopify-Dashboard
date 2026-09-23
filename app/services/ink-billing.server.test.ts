import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const rows = new Map<string, any>();
let transactionTail = Promise.resolve();
const ref = (id: string) => ({
  id,
  get: async () => ({ exists: rows.has(id), data: () => rows.get(id) }),
  update: async (value: any) => {
    rows.set(id, { ...rows.get(id), ...value });
  },
});
const firestore = {
  collection: () => ({ doc: ref }),
  runTransaction: (fn: any) => {
    const run = transactionTail.then(() =>
      fn({
        get: (r: any) => r.get(),
        set: (r: any, v: any) => rows.set(r.id, v),
      }),
    );
    transactionTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  },
};
const readRecord = vi.fn();
const merchantRead = vi.fn();
const createRecordPurchase = vi.fn();
const createRecordCharge = vi.fn();
const readRecordCharge = vi.fn();
vi.mock("../firestore.server", () => ({ default: firestore }));
vi.mock("./ink-record.server", async (importOriginal) => ({ ...(await importOriginal<any>()), readRecord }));
vi.mock("./ink-reader.server", () => ({
  merchantRead,
  PROOF_ID: /^proof_[0-9a-f]{24}$/,
}));
vi.mock("./ink-api.server", () => ({ createRecordPurchase }));
vi.mock("./record-door.server", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  createRecordCharge,
  readRecordCharge,
}));
const { inkRecordAction, settleInkCharge, inkDoor } = await import(
  "./ink-billing.server"
);
const shop = "demo.myshopify.com";
const proof = "proof_aaaaaaaaaaaaaaaaaaaaaaaa";
const admin = { graphql: vi.fn() };
const form = (intent = "buy", id = proof) => {
  const f = new FormData();
  f.set("intent", intent);
  f.set("proof_id", id);
  f.set("price_cents", "1");
  f.set("order_name", "forged");
  return f;
};
beforeEach(() => {
  rows.clear();
  vi.clearAllMocks();
  transactionTail = Promise.resolve();
  vi.stubEnv("RECORD_PURCHASES_ENABLED", "true");
  vi.stubEnv("RECORD_PURCHASE_TEST", "false");
  vi.stubEnv("SHOPIFY_API_KEY", "public-app-id");
  readRecord.mockResolvedValue({
    locked: true,
    summary: { order_number: "#1010" },
    price: { price_cents: 2900, currency: "USD" },
  });
  createRecordCharge.mockResolvedValue({
    chargeId: "gid://shopify/AppPurchaseOneTime/1",
    confirmationUrl: "https://admin.shopify.com/approve",
  });
  readRecordCharge.mockResolvedValue({
    id: "gid://shopify/AppPurchaseOneTime/1",
    status: "ACTIVE",
    test: false,
    price_cents: 2900,
    currency: "USD",
  });
  merchantRead.mockResolvedValue({ proof_id: proof, shop_id: "shop_owned" });
  createRecordPurchase.mockResolvedValue({
    id: "purchase",
    proof_id: proof,
    shop_id: "shop_owned",
    charge_id: "gid://shopify/AppPurchaseOneTime/1",
    price_cents: 2900,
    currency: "USD",
    test: false,
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("ink Shopify billing", () => {
  it("takes its price and order name from the authenticated record, never the form", async () => {
    expect((await inkRecordAction(admin, shop, "own-key", form())).ok).toBe(
      true,
    );
    expect(createRecordCharge).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        orderName: "#1010",
        price: { price_cents: 2900, currency: "USD" },
        returnUrl: expect.stringContaining(
          "admin.shopify.com/store/demo/apps/public-app-id/app/record",
        ),
      }),
    );
  });
  it("reserves an order atomically before a charge, including concurrent submissions", async () => {
    const results = await Promise.all([
      inkRecordAction(admin, shop, "own-key", form()),
      inkRecordAction(admin, shop, "own-key", form()),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(createRecordCharge).toHaveBeenCalledOnce();
  });
  it("will not create a second charge after an uncertain create response", async () => {
    createRecordCharge.mockRejectedValue(new Error("timeout"));
    await inkRecordAction(admin, shop, "own-key", form());
    const retry = await inkRecordAction(admin, shop, "own-key", form());
    expect(retry.note).toContain("Contact support before trying again");
    expect(createRecordCharge).toHaveBeenCalledOnce();
  });
  it("settles a saved, matching ACTIVE charge even if the kill switch has since closed", async () => {
    await inkRecordAction(admin, shop, "own-key", form());
    vi.stubEnv("RECORD_PURCHASES_ENABLED", "false");
    await settleInkCharge(admin, shop, "own-key", proof);
    expect(createRecordPurchase).toHaveBeenCalledWith({
      proof_id: proof,
      shop_id: "shop_owned",
      charge_id: "gid://shopify/AppPurchaseOneTime/1",
      price_cents: 2900,
      currency: "USD",
      test: false,
    });
    await settleInkCharge(admin, shop, "own-key", proof);
    expect(createRecordPurchase).toHaveBeenCalledOnce();
  });
  it("keeps settlement pending when the backend confirms a different record", async () => {
    await inkRecordAction(admin, shop, "own-key", form());
    createRecordPurchase.mockResolvedValue({
      id: "wrong",
      proof_id: "another-proof",
    });
    await expect(
      settleInkCharge(admin, shop, "own-key", proof),
    ).rejects.toThrow("did not match");
    expect([...rows.values()][0].state).toBe("paid_pending_record");
    expect(await inkDoor(admin, shop, "own-key", proof)).toMatchObject({
      pending: true,
      paidPendingRecord: true,
      resumeUrl: null,
      offerLine: null,
      downloadable: false,
    });
  });
  it("never offers another charge while an approved purchase is unavailable", async () => {
    await inkRecordAction(admin, shop, "own-key", form());
    createRecordPurchase.mockRejectedValue(new Error("backend unavailable"));
    const door = await inkDoor(admin, shop, "own-key", proof);
    expect(door).toMatchObject({
      pending: true,
      paidPendingRecord: true,
      resumeUrl: null,
      offerLine: null,
    });
    expect((await inkRecordAction(admin, shop, "own-key", form())).ok).toBe(false);
    expect(createRecordCharge).toHaveBeenCalledOnce();
  });
  it("does not offer a second charge if an earlier purchase is marked complete but the record read is locked", async () => {
    await inkRecordAction(admin, shop, "own-key", form());
    await settleInkCharge(admin, shop, "own-key", proof);
    expect(await inkDoor(admin, shop, "own-key", proof)).toMatchObject({
      pending: true,
      paidPendingRecord: true,
      offerLine: null,
      downloadable: false,
    });
  });
  it.each([
    { price_cents: 1 },
    { currency: "EUR" },
    { test: true },
    { id: "gid://shopify/AppPurchaseOneTime/2" },
    { status: "PENDING" },
  ])(
    "does not mint on mismatched or unapproved Shopify response %j",
    async (patch) => {
      await inkRecordAction(admin, shop, "own-key", form());
      readRecordCharge.mockResolvedValue({
        id: "gid://shopify/AppPurchaseOneTime/1",
        status: "ACTIVE",
        test: false,
        price_cents: 2900,
        currency: "USD",
        ...patch,
      });
      await settleInkCharge(admin, shop, "own-key", proof);
      expect(createRecordPurchase).not.toHaveBeenCalled();
    },
  );
  it("does not bind an arbitrary returning charge to an order or another shop", async () => {
    await settleInkCharge(admin, shop, "own-key", proof);
    expect(readRecordCharge).not.toHaveBeenCalled();
    await inkRecordAction(admin, shop, "own-key", form());
    await settleInkCharge(admin, "other.myshopify.com", "other-key", proof);
    expect(createRecordPurchase).not.toHaveBeenCalled();
    merchantRead.mockResolvedValue(null);
    await settleInkCharge(admin, shop, "own-key", proof);
    expect(createRecordPurchase).not.toHaveBeenCalled();
  });
  it("refuses purchases without an owned locked record or when purchases are disabled", async () => {
    readRecord.mockResolvedValue(null);
    expect((await inkRecordAction(admin, shop, "own-key", form())).ok).toBe(
      false,
    );
    readRecord.mockResolvedValue({ locked: false, summary: {} });
    expect((await inkRecordAction(admin, shop, "own-key", form())).ok).toBe(
      false,
    );
    vi.stubEnv("RECORD_PURCHASES_ENABLED", "false");
    expect((await inkRecordAction(admin, shop, "own-key", form())).ok).toBe(
      false,
    );
    expect(createRecordCharge).not.toHaveBeenCalled();
  });
  it("uses only the gated merchant export for a download", async () => {
    merchantRead.mockResolvedValue(null);
    expect(
      (await inkRecordAction(admin, shop, "own-key", form("download"))).ok,
    ).toBe(false);
    merchantRead.mockResolvedValue({
      manifest: { signed: true },
      files: { "packet.json": "{}" },
    });
    const out = await inkRecordAction(admin, shop, "own-key", form("download"));
    expect(out.download).toMatchObject({ manifest: { signed: true } });
    expect(merchantRead).toHaveBeenCalledWith(
      "own-key",
      `proofs/${proof}/export`,
    );
  });
  it("serves a PDF only from this merchant's unlocked audit response", async () => {
    const audit = {
      proof_id: proof,
      audience: "merchant",
      summary: { order_number: "#1010", opens: 1 },
      verdict: { elements: [{ element: "order", label: "Order", status: "attested", value: { order_number: "#1010" } }] },
      chain: [],
      legacy_events: [],
      record: { locked: false },
    };
    merchantRead.mockResolvedValue(audit);
    const out = await inkRecordAction(admin, shop, "own-key", form("pdf"));
    expect(out.ok).toBe(true);
    expect(out.filename).toBe(`ink-record-${proof}.pdf`);
    expect(Buffer.from(out.pdfBase64!, "base64").toString("latin1")).toContain("%PDF-1.4");
    expect(merchantRead).toHaveBeenCalledWith("own-key", `proofs/${proof}/audit`);
    for (const patch of [{ proof_id: "proof_bbbbbbbbbbbbbbbbbbbbbbbb" }, { audience: "public" }, { record: { locked: true } }]) {
      merchantRead.mockResolvedValue({ ...audit, ...patch });
      expect((await inkRecordAction(admin, shop, "own-key", form("pdf"))).ok).toBe(false);
    }
  });
  it("gates the full inspector and CSV behind the same owned record", async () => {
    const audit = {
      proof_id: proof,
      audience: "merchant",
      summary: { order_number: "#1010", opens: 1 },
      verdict: { elements: [{ element: "the_open", label: "The open", status: "verified", value: { opens: 1 } }] },
      chain: [{ event_id: "event_12345678", event_type: "TAP_RECORDED", seq: 1, signed_bytes: "exact bytes", payload_hash: "abc", signature: "supplied" }],
      legacy_events: [],
      record: { locked: false },
    };
    merchantRead.mockImplementation(async (_key: string, path: string) =>
      path.endsWith("/opens") ? { opens: [{ at: "2026-09-23T12:00:00Z", distance_m: 719, outcome: "success" }] } : audit);
    const inspector = await inkRecordAction(admin, shop, "own-key", form("inspect"));
    expect(inspector.inspection?.events).toHaveLength(1);
    expect(inspector.inspection?.opens?.[0].distanceM).toBe(719);
    const csv = await inkRecordAction(admin, shop, "own-key", form("csv"));
    expect(csv.csvText).toContain("event_12345678");
    expect(csv.filename).toBe(`ink-record-${proof}.csv`);
    merchantRead.mockResolvedValue({ ...audit, record: { locked: true } });
    expect((await inkRecordAction(admin, shop, "own-key", form("inspect"))).ok).toBe(false);
    expect((await inkRecordAction(admin, shop, "own-key", form("csv"))).ok).toBe(false);
  });
  it("distinguishes a free unlocked record from one saved in purchase history", async () => {
    readRecord.mockResolvedValue({ locked: false, summary: {} });
    expect(await inkDoor(admin, shop, "own-key", proof)).toMatchObject({
      downloadable: true,
      inHistory: false,
    });
    readRecord.mockResolvedValue({
      locked: true,
      summary: { order_number: "#1010" },
      price: { price_cents: 2900, currency: "USD" },
    });
    await inkRecordAction(admin, shop, "own-key", form());
    await settleInkCharge(admin, shop, "own-key", proof);
    readRecord.mockResolvedValue({ locked: false, summary: {} });
    expect(await inkDoor(admin, shop, "own-key", proof)).toMatchObject({
      downloadable: true,
      inHistory: true,
    });
  });
});
