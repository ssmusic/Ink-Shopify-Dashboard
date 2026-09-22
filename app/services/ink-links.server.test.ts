// WHERE INK'S SCREEN LINKS OUT — the dashboard door and each order's record.

import { afterEach, describe, expect, it, vi } from "vitest";

const mintMagicToken = vi.fn();
vi.mock("./ink-api.server", () => ({ mintMagicToken }));

const { RECENT_ORDERS_QUERY, dashboardDoorUrl, readRecentOrderRecords, recordUrlFor } = await import("./ink-links.server");
const { INK_SCOPES } = await import("./ink-scopes.server");

afterEach(() => { vi.unstubAllEnvs(); mintMagicToken.mockReset(); });

const PROOF = "proof_b3ea86a2c6aa96d2d4ee1e8b";

describe("recordUrlFor", () => {
  it("is the order's public record on www.in.ink", () => {
    expect(recordUrlFor(PROOF)).toBe(`https://www.in.ink/verify/${PROOF}`);
  });
  it("is nothing for a value that is not a proof id — never a token, never a guess", () => {
    for (const v of [null, undefined, "", "nfc_abc", "proof_XYZ", `${PROOF}/../x`]) expect(recordUrlFor(v)).toBeNull();
  });
});

describe("readRecentOrderRecords", () => {
  it("reads the recent orders with read_orders alone and links the enrolled ones", async () => {
    // ink holds read_orders; the query selects no customer, address or line.
    expect(INK_SCOPES).toContain("read_orders");
    expect(RECENT_ORDERS_QUERY).not.toMatch(/customer|shippingAddress|lineItems|email/);
    const graphql = vi.fn(async () => ({ json: async () => ({ data: { orders: { nodes: [
      { id: "gid://shopify/Order/2", name: "#1002", createdAt: "2026-09-22T10:00:00Z", proof: { value: PROOF } },
      { id: "gid://shopify/Order/1", name: "#1001", createdAt: "2026-09-21T10:00:00Z", proof: null },
    ] } } }) }));
    const rows = await readRecentOrderRecords({ graphql }, 5);
    expect(graphql).toHaveBeenCalledWith(RECENT_ORDERS_QUERY, { variables: { first: 5 } });
    expect(rows).toEqual([
      { id: "gid://shopify/Order/2", name: "#1002", createdAt: "2026-09-22T10:00:00Z", recordUrl: `https://www.in.ink/verify/${PROOF}`, proofId: PROOF },
      { id: "gid://shopify/Order/1", name: "#1001", createdAt: "2026-09-21T10:00:00Z", recordUrl: null, proofId: null },
    ]);
  });

  it("fails open: a refused read shows no orders, never an error page", async () => {
    const graphql = vi.fn(async () => { throw new Error("Access denied"); });
    expect(await readRecentOrderRecords({ graphql })).toEqual([]);
  });
});

describe("dashboardDoorUrl — the Ritualist's own magic-token door, reused", () => {
  it("mints a single-use token for this shop and opens www.in.ink/welcome with it", async () => {
    mintMagicToken.mockResolvedValue({ token: "mlt_a+b", shop_id: "shop_1", expires_at: "x" });
    expect(await dashboardDoorUrl("made-up-shop.myshopify.com")).toBe("https://www.in.ink/welcome?token=mlt_a%2Bb");
    expect(mintMagicToken).toHaveBeenCalledWith("made-up-shop.myshopify.com");
  });
  it("honours PARALLEL_APP_URL exactly as /app/dashboard does", async () => {
    vi.stubEnv("PARALLEL_APP_URL", "https://staging.example");
    mintMagicToken.mockResolvedValue({ token: "t" });
    expect(await dashboardDoorUrl("s")).toBe("https://staging.example/welcome?token=t");
  });
});
