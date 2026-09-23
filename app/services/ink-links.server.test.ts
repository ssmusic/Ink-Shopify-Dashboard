// WHERE INK'S SCREEN LINKS OUT — the dashboard door and each order's record.

import { afterEach, describe, expect, it, vi } from "vitest";

const {
  RECENT_ORDERS_QUERY,
  RECENT_ORDERS_DETAIL_QUERY,
  readRecentOrderRecords,
  readRecentOrderPage,
  recordUrlFor,
} = await import("./ink-links.server");
const { INK_SCOPES } = await import("./ink-scopes.server");

afterEach(() => {
  vi.unstubAllEnvs();
});

const PROOF = "proof_b3ea86a2c6aa96d2d4ee1e8b";

describe("recordUrlFor", () => {
  it("is the order's public record on www.in.ink", () => {
    expect(recordUrlFor(PROOF)).toBe(`https://www.in.ink/verify/${PROOF}`);
  });
  it("is nothing for a value that is not a proof id — never a token, never a guess", () => {
    for (const v of [
      null,
      undefined,
      "",
      "nfc_abc",
      "proof_XYZ",
      `${PROOF}/../x`,
    ])
      expect(recordUrlFor(v)).toBeNull();
  });
});

describe("readRecentOrderRecords", () => {
  const detailBody = {
    data: {
      shop: { ianaTimezone: "America/New_York" },
      orders: {
        nodes: [
          {
            id: "gid://shopify/Order/2",
            name: "#1002",
            createdAt: "2026-09-22T03:30:00Z",
            email: "buyer@example.com",
            totalPriceSet: {
              shopMoney: { amount: "58.00", currencyCode: "USD" },
            },
            shippingAddress: {
              name: "Made Up",
              address1: "1 Test St",
              city: "Brooklyn",
              provinceCode: "NY",
              zip: "11201",
            },
            lineItems: {
              nodes: [
                {
                  title: "Bar Tape",
                  quantity: 2,
                  sku: "BT-1",
                  originalUnitPriceSet: { shopMoney: { amount: "29.00" } },
                },
              ],
            },
            metafields: {
              nodes: [
                { key: "verification_status", value: "active" },
                { key: "proof_reference", value: PROOF },
              ],
            },
            proof: { value: PROOF },
          },
          {
            id: "gid://shopify/Order/1",
            name: "#1001",
            createdAt: "2026-09-21T10:00:00Z",
            email: null,
            totalPriceSet: null,
            shippingAddress: null,
            lineItems: { nodes: [] },
            metafields: { nodes: [] },
            proof: null,
          },
        ],
      },
    },
  };

  it("reads what the Ritualist's Shipments row shows, with ink's scopes alone", () => {
    // Never a Customer object (read_customers) and never a line image
    // (read_products): Shopify fails the whole query over either (#1019).
    expect(INK_SCOPES).toContain("write_orders");
    expect(RECENT_ORDERS_DETAIL_QUERY).not.toMatch(/customer\s*\{/);
    expect(RECENT_ORDERS_DETAIL_QUERY).not.toMatch(/\bimage\b/);
    expect(RECENT_ORDERS_DETAIL_QUERY).toMatch(/\bemail\b/);
    expect(RECENT_ORDERS_DETAIL_QUERY).toMatch(
      /shippingAddress \{ name address1 address2 city provinceCode zip country \}/,
    );
    expect(RECENT_ORDERS_DETAIL_QUERY).toMatch(/lineItems\(first: 20\)/);
    // The fallback stays the minimal read it always was.
    expect(RECENT_ORDERS_QUERY).not.toMatch(
      /customer|shippingAddress|lineItems|email/,
    );
  });

  it("builds each row's accordion the way the Ritualist's loader does, and links the enrolled ones", async () => {
    const graphql = vi.fn(async () => ({ json: async () => detailBody }));
    const rows = await readRecentOrderRecords({ graphql }, 5);
    expect(graphql).toHaveBeenCalledTimes(1);
    expect(graphql).toHaveBeenCalledWith(RECENT_ORDERS_DETAIL_QUERY, {
      variables: { first: 5 },
    });
    expect(rows[0]).toMatchObject({
      id: "gid://shopify/Order/2",
      name: "#1002",
      recordUrl: `https://www.in.ink/verify/${PROOF}`,
      proofId: PROOF,
    });
    expect(rows[0].detail).toEqual({
      id: "2",
      orderNumber: "#1002",
      customerName: "Made Up",
      customerEmail: "buyer@example.com",
      customerAddress: {
        address1: "1 Test St",
        address2: "",
        country: "",
        city: "Brooklyn",
        provinceCode: "NY",
        zip: "11201",
      },
      date: "Sep 21, 2026", // the store's timezone, as the Ritualist's list does
      total: "58.00",
      subtotal: "58.00",
      currency: "USD",
      status: "pending",
      itemsTruncated: false,
      items: [{ title: "Bar Tape", quantity: 2, price: "29.00", sku: "BT-1" }],
      metafields: {},
    });
    expect(rows[1]).toMatchObject({
      name: "#1001",
      recordUrl: null,
      proofId: null,
    });
    expect(rows[1].detail).toMatchObject({
      customerName: "Name unavailable",
      customerEmail: "",
      status: "pending",
      items: [],
    });
  });

  it("falls back to the minimal read when the detail read is refused — the list never disappears", async () => {
    const graphql = vi.fn(async (query: string) => {
      if (query === RECENT_ORDERS_DETAIL_QUERY)
        throw new Error("This app is not approved to use the email field.");
      return {
        json: async () => ({
          data: {
            orders: {
              nodes: [
                {
                  id: "gid://shopify/Order/2",
                  name: "#1002",
                  createdAt: "2026-09-22T10:00:00Z",
                  proof: { value: PROOF },
                },
              ],
            },
          },
        }),
      };
    });
    const rows = await readRecentOrderRecords({ graphql }, 5);
    expect(graphql).toHaveBeenLastCalledWith(RECENT_ORDERS_QUERY, {
      variables: { first: 5 },
    });
    expect(rows).toEqual([
      {
        id: "gid://shopify/Order/2",
        name: "#1002",
        createdAt: "2026-09-22T10:00:00Z",
        recordUrl: `https://www.in.ink/verify/${PROOF}`,
        proofId: PROOF,
        detail: null,
      },
    ]);
  });

  it("distinguishes a refused read from an empty list", async () => {
    const graphql = vi.fn(async () => {
      throw new Error("Access denied");
    });
    await expect(readRecentOrderRecords({ graphql })).rejects.toThrow(
      "Orders unavailable",
    );
  });
});

describe("order pagination and missing money", () => {
  it("reads older and newer pages and preserves the cursor on a protected-field fallback", async () => {
    const body = {
      data: {
        orders: {
          nodes: [],
          pageInfo: {
            hasNextPage: true,
            hasPreviousPage: true,
            startCursor: "start",
            endCursor: "end",
          },
        },
      },
    };
    const graphql = vi.fn(async (query: string) => {
      if (query === RECENT_ORDERS_DETAIL_QUERY)
        throw new Error("Protected fields unavailable");
      return { json: async () => body };
    });
    expect(
      (await readRecentOrderPage({ graphql }, { after: "older" })).pageInfo,
    ).toEqual(body.data.orders.pageInfo);
    expect(graphql).toHaveBeenLastCalledWith(RECENT_ORDERS_QUERY, {
      variables: { first: 5, after: "older" },
    });
    await readRecentOrderPage({ graphql }, { before: "newer" });
    expect(graphql).toHaveBeenLastCalledWith(RECENT_ORDERS_QUERY, {
      variables: { last: 5, before: "newer" },
    });
  });
  it("does not invent a currency when Shopify omitted it", async () => {
    const graphql = vi.fn(async () => ({
      json: async () => ({
        data: {
          orders: {
            nodes: [
              {
                id: "gid://shopify/Order/2",
                totalPriceSet: { shopMoney: { amount: "30" } },
              },
            ],
          },
        },
      }),
    }));
    expect(
      (await readRecentOrderRecords({ graphql }))[0].detail?.currency,
    ).toBe("");
  });
});
