import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const webhook = vi.fn();
const updateTracking = vi.fn();
const markDelivered = vi.fn();
const rewrite = vi.fn();
const merchant = vi.fn();
vi.mock("../shopify.server", () => ({ authenticate: { webhook } }));
vi.mock("../firestore.server", () => ({ default: {} }));
vi.mock("./merchant-doc.server", () => ({ findMerchantDoc: merchant }));
vi.mock("./nfs.server", () => ({ NFSService: { updateTracking, markDelivered } }));
vi.mock("./branded-tracking-link.server", () => ({ assertBrandedTrackingUrl: rewrite }));
vi.mock("./notifications.server", () => ({ NotificationService: {} }));
const create = (await import("../routes/webhooks.fulfillments_create")).action;
const update = (await import("../routes/webhooks.fulfillments_update")).action;
const proof = "proof_aaaaaaaaaaaaaaaaaaaaaaaa";
const args = { request: new Request("https://app.test/webhook", { method: "POST" }), params: {}, context: {} } as any;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_FLAVOR", "ink");
  for (const level of ["log", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
  webhook.mockResolvedValue({
    shop: "demo.myshopify.com", topic: "FULFILLMENTS_UPDATE",
    payload: { id: 123, order_id: 456, tracking_number: "TEST", shipment_status: "delivered", updated_at: "2026-09-23T10:00:00Z" },
    admin: { graphql: async () => ({ json: async () => ({ data: { order: { name: "#1001", metafield: { value: proof }, proofMetafield: { value: proof } } } }) }) },
  });
  merchant.mockResolvedValue({ apiKey: "own-key", data: { ink_api_key: "own-key" } });
  updateTracking.mockResolvedValue({ shippo_registered: true });
  markDelivered.mockResolvedValue({ ok: true });
  rewrite.mockResolvedValue({ outcome: "updated" });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("ink fulfillment acknowledgement", () => {
  it.each([create, update])("does not swallow failed webhook authentication", async action => {
    const unauthorized = new Response("Unauthorized", { status: 401 });
    webhook.mockRejectedValue(unauthorized);
    await expect(action(args)).rejects.toBe(unauthorized);
    expect(updateTracking).not.toHaveBeenCalled();
  });
  it.each([create, update])("requests redelivery when tracking forwarding fails", async action => {
    updateTracking.mockRejectedValue(new Error("backend unavailable"));
    expect((await action(args)).status).toBe(503);
  });
  it.each([create, update])("requests redelivery when Shopify refuses the tracking link", async action => {
    rewrite.mockResolvedValue({ outcome: "failed" });
    expect((await action(args)).status).toBe(503);
  });
  it("retries delivery writes and preserves the reported timestamp", async () => {
    markDelivered.mockRejectedValue(new Error("backend unavailable"));
    expect((await update(args)).status).toBe(503);
    expect(markDelivered).toHaveBeenCalledWith(proof, "own-key", expect.objectContaining({ delivered_at: "2026-09-23T10:00:00Z" }));
  });
  it("does not invent the current time when a delivery timestamp is missing", async () => {
    const event = await webhook(); delete event.payload.updated_at;
    expect((await update(args)).status).toBe(503);
    expect(markDelivered).not.toHaveBeenCalled();
  });
  it.each([create, update])("still acknowledges a complete ink fulfillment", async action => {
    expect((await action(args)).status).toBe(200);
  });
  it.each([create, update])("keeps the paid failure acknowledgement unchanged", async action => {
    vi.stubEnv("APP_FLAVOR", "");
    updateTracking.mockRejectedValue(new Error("backend unavailable"));
    expect((await action(args)).status).toBe(200);
  });
});
