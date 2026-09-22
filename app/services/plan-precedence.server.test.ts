// PLAN PRECEDENCE — the three orders, each against stubs for the backend
// door, the shared doc and the other app's sessions.
//
//   1. ink installs on a merchant the Ritualist made → nothing (ink-install
//      test pins the provision; here the claim side pins that a Ritualist's
//      doc is never PATCHed);
//   2. the Ritualist installs on a merchant ink made → plan: ritualist, once;
//   3. the Ritualist uninstalls while ink is installed → plan: ink; without
//      ink → nothing; a backend refusal is acked, a blip is retried, an
//      unknown is thrown.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const patchMerchant = vi.fn();
const getMerchant = vi.fn();
const updateMerchant = vi.fn();
const otherAppHoldsSession = vi.fn();
const resolveInkShopId = vi.fn();

class InkApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

vi.mock("./ink-api.server", () => ({ patchMerchant, InkApiError }));
vi.mock("./merchant.server", () => ({ getMerchant, updateMerchant }));
vi.mock("../firestore-session-storage.server", () => ({ otherAppHoldsSession }));
vi.mock("./ink-install.server", () => ({ resolveInkShopId }));

const SHOP = "made-up-shop.myshopify.com";

beforeEach(() => {
  vi.resetAllMocks();
  updateMerchant.mockResolvedValue(undefined);
  patchMerchant.mockResolvedValue({ plan: "ritualist" });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("order 2 — the Ritualist installs on a merchant ink made", () => {
  it("claims the plan once: PATCH plan: ritualist, stamped under the Ritualist's own field, toggles seeded", async () => {
    const { claimRitualistPlan } = await import("./plan-precedence.server");
    const existing = { shop: SHOP, ink_api_key: "ink_live_k", ink_shop_id: "shop_abc123" } as any;

    expect(await claimRitualistPlan({ shop: SHOP, existing })).toBe("claimed");

    expect(patchMerchant).toHaveBeenCalledTimes(1);
    expect(patchMerchant).toHaveBeenCalledWith("shop_abc123", { plan: "ritualist" });
    expect(updateMerchant).toHaveBeenCalledWith(SHOP, {
      ritualist_plan_claimed_at: expect.any(String),
      notification_settings: expect.objectContaining({ channels: expect.anything() }),
    });
    // The shared key is never among the fields written.
    expect(updateMerchant.mock.calls[0][1]).not.toHaveProperty("ink_api_key");
  });

  it("asks nothing the second time — the layout loader runs on every page", async () => {
    const { claimRitualistPlan } = await import("./plan-precedence.server");
    const existing = { ink_api_key: "k", ink_shop_id: "shop_abc123", ritualist_plan_claimed_at: "2026-09-22T00:00:00Z" } as any;

    expect(await claimRitualistPlan({ shop: SHOP, existing })).toBe("already_claimed");
    expect(patchMerchant).not.toHaveBeenCalled();
    expect(updateMerchant).not.toHaveBeenCalled();
  });

  it("keeps a merchant's existing toggles when it has them", async () => {
    const { claimRitualistPlan } = await import("./plan-precedence.server");
    const existing = { ink_api_key: "k", ink_shop_id: "shop_abc123", notification_settings: { channels: { email: false } } } as any;

    await claimRitualistPlan({ shop: SHOP, existing });
    expect(updateMerchant).toHaveBeenCalledWith(SHOP, { ritualist_plan_claimed_at: expect.any(String) });
  });

  it("order 1's mirror: a doc the Ritualist itself made (no ink_shop_id) is never PATCHed — every merchant today", async () => {
    const { claimRitualistPlan } = await import("./plan-precedence.server");
    const existing = { shop: SHOP, ink_api_key: "ink_live_k", notification_settings: {} } as any;

    expect(await claimRitualistPlan({ shop: SHOP, existing })).toBe("not_an_ink_merchant");
    expect(patchMerchant).not.toHaveBeenCalled();
    expect(updateMerchant).not.toHaveBeenCalled();
  });

  it("does not stamp a claim the backend refused, so the next load asks again (the door learns `plan` on deploy)", async () => {
    patchMerchant.mockRejectedValue(new InkApiError("Failed to update merchant: No updatable fields provided", 400));
    const { claimRitualistPlan } = await import("./plan-precedence.server");
    const existing = { ink_api_key: "k", ink_shop_id: "shop_abc123" } as any;

    expect(await claimRitualistPlan({ shop: SHOP, existing })).toBe("failed");
    expect(updateMerchant).not.toHaveBeenCalled();
  });
});

describe("order 3 — the Ritualist uninstalls", () => {
  it("hands the merchant back to ink when ink is still installed: plan: ink, the stamp cleared, the key untouched", async () => {
    otherAppHoldsSession.mockResolvedValue(true);
    getMerchant.mockResolvedValue({ ink_api_key: "ink_live_k", ink_shop_id: "shop_abc123", ritualist_plan_claimed_at: "2026-09-22T00:00:00Z" });
    resolveInkShopId.mockResolvedValue("shop_abc123");
    patchMerchant.mockResolvedValue({ plan: "ink" });

    const { restoreInkPlanOnRitualistUninstall } = await import("./plan-precedence.server");
    expect(await restoreInkPlanOnRitualistUninstall(SHOP)).toBe("restored");

    expect(otherAppHoldsSession).toHaveBeenCalledWith(SHOP);
    expect(patchMerchant).toHaveBeenCalledWith("shop_abc123", { plan: "ink" });
    expect(updateMerchant).toHaveBeenCalledWith(SHOP, { ritualist_plan_claimed_at: null });
    expect(updateMerchant.mock.calls[0][1]).not.toHaveProperty("ink_api_key");
  });

  it("leaves the plan alone when ink is not installed — the store is leaving", async () => {
    otherAppHoldsSession.mockResolvedValue(false);
    const { restoreInkPlanOnRitualistUninstall } = await import("./plan-precedence.server");

    expect(await restoreInkPlanOnRitualistUninstall(SHOP)).toBe("ink_not_installed");
    expect(getMerchant).not.toHaveBeenCalled();
    expect(patchMerchant).not.toHaveBeenCalled();
    expect(updateMerchant).not.toHaveBeenCalled();
  });

  it("acks a refusal (4xx — a door that does not know `plan` yet) and says how to hand back by hand", async () => {
    otherAppHoldsSession.mockResolvedValue(true);
    getMerchant.mockResolvedValue({ ink_shop_id: "shop_abc123" });
    resolveInkShopId.mockResolvedValue("shop_abc123");
    patchMerchant.mockRejectedValue(new InkApiError("Failed to update merchant: No updatable fields provided", 400));

    const { restoreInkPlanOnRitualistUninstall } = await import("./plan-precedence.server");
    expect(await restoreInkPlanOnRitualistUninstall(SHOP)).toBe("refused");
    expect(updateMerchant).not.toHaveBeenCalled();
    expect(String((console.error as any).mock.calls.at(-1)?.[0])).toContain("PATCH /admin/merchants/shop_abc123");
  });

  it("reports a blip (5xx / network) as transient so the webhook can 500 and Shopify retries", async () => {
    otherAppHoldsSession.mockResolvedValue(true);
    getMerchant.mockResolvedValue({ ink_shop_id: "shop_abc123" });
    resolveInkShopId.mockResolvedValue("shop_abc123");
    const { restoreInkPlanOnRitualistUninstall } = await import("./plan-precedence.server");

    patchMerchant.mockRejectedValue(new InkApiError("Failed to update merchant: 503 Service Unavailable", 503));
    expect(await restoreInkPlanOnRitualistUninstall(SHOP)).toBe("transient_failure");

    patchMerchant.mockRejectedValue(new InkApiError("Failed to update merchant: fetch failed", 0));
    expect(await restoreInkPlanOnRitualistUninstall(SHOP)).toBe("transient_failure");
    expect(updateMerchant).not.toHaveBeenCalled();
  });

  it("falls back to the list scan for the shop_id, and says so when nobody knows it", async () => {
    otherAppHoldsSession.mockResolvedValue(true);
    getMerchant.mockResolvedValue({ ink_api_key: "k" });
    resolveInkShopId.mockResolvedValue("");
    const { restoreInkPlanOnRitualistUninstall } = await import("./plan-precedence.server");

    expect(await restoreInkPlanOnRitualistUninstall(SHOP)).toBe("no_shop_id");
    expect(patchMerchant).not.toHaveBeenCalled();
  });

  it("throws when Firestore cannot say whether ink is installed — an unknown must not decide a plan", async () => {
    otherAppHoldsSession.mockRejectedValue(new Error("unavailable"));
    const { restoreInkPlanOnRitualistUninstall } = await import("./plan-precedence.server");
    await expect(restoreInkPlanOnRitualistUninstall(SHOP)).rejects.toThrow("unavailable");
    expect(patchMerchant).not.toHaveBeenCalled();
  });
});
