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
  RECORD_READ_TIMEOUT_MS: 15_000,
  EXPORT_READ_TIMEOUT_MS: 30_000,
}));
vi.mock("./ink-api.server", () => ({ createRecordPurchase }));
const findRecordCharge = vi.fn();
const recordChargeGone = vi.fn();
vi.mock("./record-door.server", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  createRecordCharge,
  readRecordCharge,
  findRecordCharge,
  recordChargeGone,
}));
const { RecordChargeRefused } = await import("./record-door.server");
const { inkRecordAction, settleInkCharge, inkDoor } = await import(
  "./ink-billing.server"
);
const shop = "demo.myshopify.com";
const FOR_SALE = {
    locked: false,
    whole: true,
    elements: [],
    summary: { order_number: "#1010" },
    forSale: { price_cents: 2900, currency: "USD" },
  };
// Bought, or free: the whole record, nothing for sale.
const HANDED_OVER = { locked: false, whole: true, elements: [], summary: {}, forSale: null };
const proof = "proof_aaaaaaaaaaaaaaaaaaaaaaaa";
const admin = { graphql: vi.fn() };
const bundle = { manifest: { proof_id: proof, signed: true }, files: { "packet.json": "{}" } };
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
  // The merchant door answers a priced, unbought record WHOLE (ink-backend
  // #129): unlocked to read, the hand-over for sale.
  readRecord.mockResolvedValue(FOR_SALE);
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
  it("offers the hand-over, never the files, while it is for sale — the merchant door's whole view is not a purchase", async () => {
    const door = await inkDoor(admin, shop, "own-key", proof);
    expect(door).toMatchObject({ downloadable: false, pending: false });
    expect(door.offerLine).toContain("Buy the record");
    // The words of a priced record (no whole read): no files, no offer.
    readRecord.mockResolvedValue({ locked: true, elements: [], summary: {} });
    expect(await inkDoor(admin, shop, "own-key", proof)).toMatchObject({ downloadable: false, offerLine: null });
    // The switch off: the record is still for sale, but nothing is offered and nothing is handed over.
    readRecord.mockResolvedValue(FOR_SALE);
    vi.stubEnv("RECORD_PURCHASES_ENABLED", "false");
    expect(await inkDoor(admin, shop, "own-key", proof)).toMatchObject({ downloadable: false, offerLine: null });
  });
  it("offers Shopify purchase when the whole record is visible but the hand-over is not bought", async () => {
    expect(await inkDoor(admin, shop, "own-key", proof)).toMatchObject({ downloadable: false, offerLine: "Buy the record ($29 USD)" });
    expect((await inkRecordAction(admin, shop, "own-key", form())).ok).toBe(true);
    expect(createRecordCharge).toHaveBeenCalledOnce();
  });
  it("shows the whole record on screen before purchase; the three files wait for the hand-over, and each needs the export door", async () => {
    const bundle = { manifest: { proof_id: proof, signed: true }, files: { "packet.json": "{}" } };
    const audit = (record: unknown) => ({ proof_id: proof, audience: "merchant", record, summary: { opens: 0 }, verdict: { elements: [] }, chain: [] });
    // For sale: on screen is not the hand-over; the files are (orchestrator,
    // relaying Sam, 2026-09-23). The inspector opens; no file leaves.
    merchantRead.mockImplementation(async (_key: string, path: string) =>
      path.endsWith("/export") ? bundle : audit({ locked: false, purchased: false, price_cents: 2900, currency: "USD" }),
    );
    const onScreen = await inkRecordAction(admin, shop, "own-key", form("inspect"));
    expect(onScreen.ok).toBe(true);
    expect(onScreen.inspection?.proofId).toBe(proof);
    for (const intent of ["pdf", "csv", "download"]) {
      const out = await inkRecordAction(admin, shop, "own-key", form(intent));
      expect(out.ok, intent).toBe(false);
      expect(out.pdfBase64).toBeNull();
      expect(out.csvText).toBeNull();
      expect(out.download).toBeNull();
      expect(out.inspection).toBeNull();
    }
    // Bought, but the export door does not answer: no file.
    const bought = audit({ locked: false, purchased: true, price_cents: 2900, currency: "USD" });
    merchantRead.mockImplementation(async (_key: string, path: string) => (path.endsWith("/audit") ? bought : null));
    for (const intent of ["pdf", "download"]) expect((await inkRecordAction(admin, shop, "own-key", form(intent))).ok, intent).toBe(false);
    // Bought, and the export door answers for this record: all of it.
    merchantRead.mockImplementation(async (_key: string, path: string) => (path.endsWith("/export") ? bundle : bought));
    for (const intent of ["inspect", "pdf", "download"]) expect((await inkRecordAction(admin, shop, "own-key", form(intent))).ok, intent).toBe(true);
    // Sam, 2026-09-24: "just use json" — the CSV is no longer a file.
    expect((await inkRecordAction(admin, shop, "own-key", form("csv"))).ok).toBe(false);
  });
  it("rejects a download bundle for another proof", async () => {
    const bundle = { manifest: { proof_id: proof, signed: true }, files: { "packet.json": "{}" } };
    merchantRead.mockResolvedValue({ ...bundle, manifest: { ...bundle.manifest, proof_id: "proof_bbbbbbbbbbbbbbbbbbbbbbbb" } });
    for (const intent of ["pdf", "csv", "download"])
      expect((await inkRecordAction(admin, shop, "own-key", form(intent))).ok).toBe(false);
  });
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
  // A REFUSED CHARGE GIVES THE BUTTON BACK (Sam, 2026-09-24, corvara #1013:
  // Shopify answered "Custom apps cannot use the Billing API"; the press sat
  // at "creating" for good and the door said "The charge status could not be
  // confirmed" with no button). Shopify's own refusal creates nothing, so the
  // reservation is released and the merchant reads Shopify's reason.
  it("a charge Shopify refused releases the reservation, says Shopify's reason, and offers the button again", async () => {
    createRecordCharge.mockRejectedValueOnce(new RecordChargeRefused("Custom apps cannot use the Billing API"));
    const first = await inkRecordAction(admin, shop, "own-key", form());
    expect(first.ok).toBe(false);
    expect(first.note).toContain("Custom apps cannot use the Billing API");
    const door = await inkDoor(admin, shop, "own-key", proof);
    expect(door.pending).toBe(false);
    expect(door.offerLine).toMatch(/\$29/);
    const again = await inkRecordAction(admin, shop, "own-key", form());
    expect(again.ok).toBe(true);
    expect(createRecordCharge).toHaveBeenCalledTimes(2);
  });
  it("an old reservation with no answer heals: no charge on Shopify releases it, a charge found is adopted, a failed read leaves it", async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    // Reserve through the real path, then make it old and answerless.
    createRecordCharge.mockRejectedValueOnce(new Error("timeout"));
    await inkRecordAction(admin, shop, "own-key", form());
    const [id] = [...rows.keys()];
    rows.set(id, { ...rows.get(id), createdAt: old });

    findRecordCharge.mockResolvedValueOnce(undefined); // Shopify could not be asked
    expect((await inkDoor(admin, shop, "own-key", proof)).pending).toBe(true);

    findRecordCharge.mockResolvedValueOnce(null); // asked: no charge exists
    const healed = await inkDoor(admin, shop, "own-key", proof);
    expect(healed.pending).toBe(false);
    expect(healed.offerLine).toMatch(/\$29/);
    expect(rows.get(id).state).toBe("released");

    // A reservation whose charge DID land on Shopify is adopted, never re-charged.
    rows.set(id, { ...rows.get(id), state: "creating", createdAt: old });
    findRecordCharge.mockResolvedValueOnce("gid://shopify/AppPurchaseOneTime/7");
    readRecordCharge.mockResolvedValueOnce(null);
    const adopted = await inkDoor(admin, shop, "own-key", proof);
    expect(rows.get(id)).toMatchObject({ state: "pending", chargeId: "gid://shopify/AppPurchaseOneTime/7" });
    expect(adopted.offerLine).toBeNull();
  });
  // REINSTALL (App Store requirement 1.2.2): a charge made before an
  // uninstall can stop answering to the reinstalled app. Left alone, the
  // order said "approval in progress" with no Buy button for good.
  it("a pending charge Shopify no longer knows is released after a reinstall, and Buy is offered again", async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await inkRecordAction(admin, shop, "own-key", form());
    const [id] = [...rows.keys()];
    rows.set(id, { ...rows.get(id), createdAt: old });
    readRecordCharge.mockResolvedValue(null);

    recordChargeGone.mockResolvedValueOnce(false); // Shopify could not say
    expect((await inkDoor(admin, shop, "own-key", proof)).pending).toBe(true);
    expect(rows.get(id).state).toBe("pending");

    recordChargeGone.mockResolvedValueOnce(true); // Shopify says: no such charge here
    const door = await inkDoor(admin, shop, "own-key", proof);
    expect(recordChargeGone).toHaveBeenLastCalledWith(admin, "gid://shopify/AppPurchaseOneTime/1");
    expect(rows.get(id).state).toBe("released");
    expect(door.pending).toBe(false);
    expect(door.resumeUrl).toBeNull();
    expect(door.offerLine).toMatch(/\$29/);
    expect((await inkRecordAction(admin, shop, "own-key", form())).ok).toBe(true);
    expect(createRecordCharge).toHaveBeenCalledTimes(2);
  });
  it("never releases a fresh pending charge, or one Shopify approved", async () => {
    await inkRecordAction(admin, shop, "own-key", form());
    const [id] = [...rows.keys()];
    readRecordCharge.mockResolvedValue(null);
    recordChargeGone.mockResolvedValue(true);
    // Fresh: the merchant may be on Shopify's screen right now.
    expect((await inkDoor(admin, shop, "own-key", proof)).pending).toBe(true);
    expect(recordChargeGone).not.toHaveBeenCalled();
    // Approved on Shopify, record not minted yet: never offered again.
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    rows.set(id, { ...rows.get(id), createdAt: old, state: "paid_pending_record" });
    const door = await inkDoor(admin, shop, "own-key", proof);
    expect(rows.get(id).state).toBe("paid_pending_record");
    expect(door.offerLine).toBeNull();
  });
  it("a fresh reservation with no answer is left alone — a create may still be in flight", async () => {
    createRecordCharge.mockRejectedValueOnce(new Error("timeout"));
    await inkRecordAction(admin, shop, "own-key", form());
    findRecordCharge.mockResolvedValue(null);
    expect((await inkDoor(admin, shop, "own-key", proof)).pending).toBe(true);
    expect(findRecordCharge).not.toHaveBeenCalled();
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
    readRecord.mockResolvedValue(HANDED_OVER);
    expect((await inkRecordAction(admin, shop, "own-key", form())).ok).toBe(
      false,
    );
    // The public words of a priced record: nothing to buy from here.
    readRecord.mockResolvedValue({ locked: true, elements: [], summary: {} });
    expect((await inkRecordAction(admin, shop, "own-key", form())).ok).toBe(
      false,
    );
    readRecord.mockResolvedValue(FOR_SALE);
    vi.stubEnv("RECORD_PURCHASES_ENABLED", "false");
    expect((await inkRecordAction(admin, shop, "own-key", form())).ok).toBe(
      false,
    );
    expect(createRecordCharge).not.toHaveBeenCalled();
  });
  it("uses only the gated merchant export for a download — and never while the hand-over is for sale", async () => {
    merchantRead.mockResolvedValue(null);
    expect(
      (await inkRecordAction(admin, shop, "own-key", form("download"))).ok,
    ).toBe(false);
    const bundle = { manifest: { proof_id: proof, signed: true }, files: { "packet.json": "{}" } };
    const doors = (record: unknown) =>
      merchantRead.mockImplementation(async (_key: string, path: string) =>
        path.endsWith("/export") ? bundle : { proof_id: proof, audience: "merchant", record },
      );
    doors({ locked: false, purchased: true, price_cents: 2900, currency: "USD" });
    const out = await inkRecordAction(admin, shop, "own-key", form("download"));
    expect(out.download).toMatchObject({ manifest: { signed: true } });
    // The export gets its own long wait: 14 s for a busy record (2026-09-24).
    expect(merchantRead).toHaveBeenCalledWith(
      "own-key",
      `proofs/${proof}/export`,
      expect.any(Function),
      30_000,
    );
    // For sale (the merchant's whole view, not bought), or locked: nothing is handed over,
    // even if the export door were to answer.
    for (const record of [{ locked: false, purchased: false, price_cents: 2900, currency: "USD" }, { locked: true, price_cents: 2900, currency: "USD" }]) {
      doors(record);
      const out = await inkRecordAction(admin, shop, "own-key", form("download"));
      expect(out.ok).toBe(false);
      expect(out.download).toBeNull();
    }
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
    merchantRead.mockImplementation(async (_key: string, path: string) => path.endsWith("/export") ? bundle : audit);
    const out = await inkRecordAction(admin, shop, "own-key", form("pdf"));
    expect(out.ok).toBe(true);
    expect(out.filename).toBe(`ink-record-${proof}.pdf`);
    expect(Buffer.from(out.pdfBase64!, "base64").toString("latin1")).toContain("%PDF-1.4");
    expect(merchantRead).toHaveBeenCalledWith("own-key", `proofs/${proof}/audit`, expect.any(Function), 15_000);
    for (const patch of [
      { proof_id: "proof_bbbbbbbbbbbbbbbbbbbbbbbb" },
      { audience: "public" },
      { record: { locked: true } },
      // The merchant door's whole view of a priced record, not bought: the PDF is the hand-over.
      { record: { locked: false, purchased: false, price_cents: 2900, currency: "USD" } },
    ]) {
      merchantRead.mockResolvedValue({ ...audit, ...patch });
      expect((await inkRecordAction(admin, shop, "own-key", form("pdf"))).ok).toBe(false);
    }
  });
  it("opens the inspector on the merchant's own record, and gates the PDF behind the hand-over", async () => {
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
      path.endsWith("/export") ? bundle : path.endsWith("/opens") ? { opens: [{ at: "2026-09-23T12:00:00Z", distance_m: 719, outcome: "success" }] } : audit);
    const inspector = await inkRecordAction(admin, shop, "own-key", form("inspect"));
    expect(inspector.inspection?.events).toHaveLength(1);
    expect(inspector.inspection?.opens?.[0].distanceM).toBe(719);
    const pdf = await inkRecordAction(admin, shop, "own-key", form("pdf"));
    expect(pdf.pdfBase64).toBeTruthy();
    expect(pdf.filename).toBe(`ink-record-${proof}.pdf`);
    // The hand-over's lock, in either backend contract, is not the screen's:
    // the merchant's own record is inspected; its PDF waits for the hand-over.
    for (const record of [{ locked: true }, { locked: false, purchased: false, price_cents: 2900, currency: "USD" }]) {
      merchantRead.mockImplementation(async (_key: string, path: string) =>
        path.endsWith("/export") ? bundle : path.endsWith("/opens") ? { opens: [] } : { ...audit, record });
      expect((await inkRecordAction(admin, shop, "own-key", form("inspect"))).ok, JSON.stringify(record)).toBe(true);
      expect((await inkRecordAction(admin, shop, "own-key", form("pdf"))).ok, JSON.stringify(record)).toBe(false);
    }
    // Another shop's audit, or another proof's, is never inspected.
    for (const other of [{ ...audit, audience: "public" }, { ...audit, proof_id: "proof_bbbbbbbbbbbbbbbbbbbbbbbb" }]) {
      merchantRead.mockResolvedValue(other);
      expect((await inkRecordAction(admin, shop, "own-key", form("inspect"))).ok).toBe(false);
    }
  });
  it("distinguishes a free unlocked record from one saved in purchase history", async () => {
    readRecord.mockResolvedValue(HANDED_OVER);
    expect(await inkDoor(admin, shop, "own-key", proof)).toMatchObject({
      downloadable: true,
      inHistory: false,
    });
    readRecord.mockResolvedValue(FOR_SALE);
    await inkRecordAction(admin, shop, "own-key", form());
    await settleInkCharge(admin, shop, "own-key", proof);
    readRecord.mockResolvedValue(HANDED_OVER);
    expect(await inkDoor(admin, shop, "own-key", proof)).toMatchObject({
      downloadable: true,
      inHistory: true,
    });
  });
});
