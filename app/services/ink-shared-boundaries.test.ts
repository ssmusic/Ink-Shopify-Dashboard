import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const backendGet = vi.fn();
const getMerchant = vi.fn();
const getProof = vi.fn();
const resolveInkShopId = vi.fn();
vi.mock("../firestore.server", () => ({
  default: { collection: () => ({ doc: () => ({ get: backendGet }) }) },
}));
vi.mock("../shopify.server", () => ({ authenticate: {} }));
vi.mock("./merchant.server", () => ({ getMerchant }));
vi.mock("./ink-install.server", () => ({ resolveInkShopId }));
vi.mock("./ink-api.server", () => ({ getProof }));
const { readInkMerchant } = await import("./ink-merchant.server");
const { resolveBrandPageUrl } = await import("./brand-page-url.server");
beforeEach(() => {
  vi.clearAllMocks();
  getMerchant.mockResolvedValue({
    ink_api_key: "own-key",
    ink_flash_forward: "carrier",
  });
  resolveInkShopId.mockResolvedValue("shop_A");
  backendGet.mockResolvedValue({
    exists: true,
    data: () => ({ brand_slug: "known-host", flash_forward: "order_status" }),
  });
  getProof.mockResolvedValue({ nfc_token: "nfc_example", shop_id: "shop_A" });
});
afterEach(() => vi.unstubAllEnvs());
describe("shared helper flavor boundaries", () => {
  it("ink reads its saved destination without reading backend Firestore", async () => {
    vi.stubEnv("APP_FLAVOR", "ink");
    expect((await readInkMerchant("demo.myshopify.com")).backend).toEqual({
      flash_forward: "carrier",
    });
    expect(backendGet).not.toHaveBeenCalled();
  });
  it("the Ritualist still receives its original backend document", async () => {
    vi.stubEnv("APP_FLAVOR", "");
    expect((await readInkMerchant("demo.myshopify.com")).backend).toEqual({
      brand_slug: "known-host",
      flash_forward: "order_status",
    });
    expect(backendGet).toHaveBeenCalledOnce();
  });
  it("ink uses its confirmed host or the canonical token URL without an admin read", async () => {
    vi.stubEnv("APP_FLAVOR", "ink");
    const args = {
      merchantApiKey: "own-key",
      proofId: "proof_aaaaaaaaaaaaaaaaaaaaaaaa",
      shop: "demo.myshopify.com",
      merchantData: { ink_brand_slug: "confirmed-host" },
    };
    expect((await resolveBrandPageUrl(args)).pageUrl).toBe(
      "https://confirmed-host.in.ink/r/nfc_example",
    );
    expect(
      (await resolveBrandPageUrl({ ...args, merchantData: {} })).pageUrl,
    ).toBe("https://www.in.ink/r/nfc_example");
    expect(backendGet).not.toHaveBeenCalled();
  });
  it("the Ritualist still merges its backend brand document", async () => {
    vi.stubEnv("APP_FLAVOR", "");
    const result = await resolveBrandPageUrl({
      merchantApiKey: "own-key",
      proofId: "proof_aaaaaaaaaaaaaaaaaaaaaaaa",
      shop: "demo.myshopify.com",
      merchantData: {},
    });
    expect(result.pageUrl).toBe("https://known-host.in.ink/r/nfc_example");
    expect(backendGet).toHaveBeenCalledOnce();
  });
});
