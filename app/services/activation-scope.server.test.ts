import { describe, expect, it } from "vitest";
import {
  normalizeScope,
  normalizeStateCode,
  orderActivates,
  productsActivate,
  scopeOfMerchant,
  stateOfWebhookOrder,
} from "./activation-scope.server";

describe("every merchant on the platform today", () => {
  it("activates every order, because nobody has a slice", () => {
    // The Clare-V law: absent config = today's behaviour, byte for byte.
    expect(scopeOfMerchant({})).toBeNull();
    expect(scopeOfMerchant({ ink_api_key: "sk_live_x" })).toBeNull();
    expect(scopeOfMerchant(null)).toBeNull();
    expect(scopeOfMerchant(undefined)).toBeNull();
    expect(orderActivates({ shipping_address: { province_code: "TX" } }, null)).toBe(true);
    expect(orderActivates({}, null)).toBe(true);
  });

  it("is never darkened by config it cannot read", () => {
    // Empty, malformed, or a country we do not understand all mean "not
    // narrowed" — never "narrowed to nothing", which would silently stop
    // every page on a live store.
    expect(scopeOfMerchant({ activation_scope: { ship_to: { states: [] } } })).toBeNull();
    expect(scopeOfMerchant({ activation_scope: { ship_to: null } })).toBeNull();
    expect(scopeOfMerchant({ activation_scope: "california" })).toBeNull();
    expect(
      scopeOfMerchant({ activation_scope: { ship_to: { country: "CA", states: ["ON"] } } }),
    ).toBeNull();
    expect(
      orderActivates(
        { shipping_address: { province_code: "TX" } },
        normalizeScope({ ship_to: { states: ["nowhere"] } }),
      ),
    ).toBe(true);
  });
});

describe("reading the raw Shopify body", () => {
  it("prefers province_code — already a code, and costs no new query", () => {
    // Adding a field to ORDER_DETAIL_QUERY is the #1019 landmine; the raw
    // webhook body already carries this.
    expect(stateOfWebhookOrder({ shipping_address: { province_code: "CA" } })).toBe("CA");
    expect(
      stateOfWebhookOrder({ shipping_address: { province_code: "ca", province: "Texas" } }),
    ).toBe("CA");
  });

  it("falls back to the province NAME when no code is sent", () => {
    expect(stateOfWebhookOrder({ shipping_address: { province: "California" } })).toBe("CA");
    expect(stateOfWebhookOrder({ shipping_address: { province: "new york" } })).toBe("NY");
  });

  it("says null for no address, an unknown place, or abroad", () => {
    expect(stateOfWebhookOrder({})).toBeNull();
    expect(stateOfWebhookOrder(null)).toBeNull();
    expect(stateOfWebhookOrder({ shipping_address: {} })).toBeNull();
    expect(
      stateOfWebhookOrder({ shipping_address: { province: "Ontario", country_code: "CA" } }),
    ).toBeNull();
  });

  it("normalizes a state however it is written", () => {
    expect(normalizeStateCode("CA")).toBe("CA");
    expect(normalizeStateCode(" california ")).toBe("CA");
    expect(normalizeStateCode("District of Columbia")).toBe("DC");
    expect(normalizeStateCode("Ontario")).toBeNull();
    expect(normalizeStateCode(7)).toBeNull();
  });
});

describe("a merchant running on chosen states", () => {
  const scope = normalizeScope({ ship_to: { country: "US", states: ["CA"] } });

  it("activates an order shipping into the slice", () => {
    expect(orderActivates({ shipping_address: { province_code: "CA" } }, scope)).toBe(true);
    expect(orderActivates({ shipping_address: { province: "California" } }, scope)).toBe(true);
  });

  it("does NOT activate an order shipping elsewhere", () => {
    expect(orderActivates({ shipping_address: { province_code: "TX" } }, scope)).toBe(false);
  });

  it("FAILS CLOSED when the order cannot say where it ships", () => {
    // We never guess in the direction that puts a page in a stranger's
    // hands. The order is still captured — capture is not activation.
    expect(orderActivates({}, scope)).toBe(false);
    expect(orderActivates({ shipping_address: { country_code: "CA" } }, scope)).toBe(false);
    expect(orderActivates(null, scope)).toBe(false);
  });

  it("holds a multi-state slice however it was written", () => {
    const multi = normalizeScope({ ship_to: { states: ["new york", "CA", "ca"] } });
    expect(multi?.ship_to?.states).toEqual(["CA", "NY"]);
    expect(orderActivates({ shipping_address: { province_code: "NY" } }, multi)).toBe(true);
    expect(orderActivates({ shipping_address: { province_code: "WA" } }, multi)).toBe(false);
  });

  it("reads the slice straight off the merchant doc", () => {
    expect(
      scopeOfMerchant({ activation_scope: { ship_to: { country: "US", states: ["ca"] } } }),
    ).toEqual({ ship_to: { country: "US", states: ["CA"] } });
  });
});

// ── THE OTHER WAYS A PILOT ROLLS OUT ─────────────────────────────────────
// Sam, 2026-08-27: a cap ("your next 200 orders") and a product line
// ("just our boots", or exact SKUs), beside the states.

describe("the ship-to check answers only what the raw body can say", () => {
  it("passes an order when the slice names no states at all", () => {
    // A cap-only or product-only pilot must not be refused here — this
    // function speaks for ship-to and nothing else.
    const capOnly = normalizeScope({ volume: { cap: 200 } });
    const productOnly = normalizeScope({ products: { match: "boot" } });
    expect(orderActivates({}, capOnly)).toBe(true);
    expect(orderActivates({ shipping_address: { province_code: "TX" } }, productOnly)).toBe(true);
  });
});

describe("a pilot on one product line", () => {
  const boots = normalizeScope({ products: { match: "boot" } });
  const bySku = normalizeScope({ products: { skus: ["sm-1234"] } });

  it("runs on an order HOLDING the product", () => {
    expect(productsActivate([{ title: "Chelsea Boot" }, { title: "Socks" }], boots)).toBe(true);
    expect(productsActivate([{ title: "Socks" }], boots)).toBe(false);
  });

  it("matches a SKU exactly, however either side is cased", () => {
    expect(bySku?.products?.skus).toEqual(["SM-1234"]);
    expect(productsActivate([{ sku: "sm-1234" }], bySku)).toBe(true);
    expect(productsActivate([{ sku: "SM-0000" }], bySku)).toBe(false);
  });

  it("passes everything when no product constraint is set", () => {
    expect(productsActivate([{ title: "Anything" }], null)).toBe(true);
    expect(productsActivate([], normalizeScope({ ship_to: { states: ["CA"] } }))).toBe(true);
  });

  it("FAILS CLOSED when the order lists nothing readable", () => {
    // Never guess from an absent catalogue in the direction that puts a
    // page in a stranger's hands.
    expect(productsActivate([], boots)).toBe(false);
    expect(productsActivate(null, boots)).toBe(false);
  });
});

describe("a cap is recorded but never answered here", () => {
  it("is kept, normalized, and left for the counter to decide", () => {
    expect(normalizeScope({ volume: { cap: 200 } })).toEqual({ volume: { cap: 200 } });
    // 0 is a pilot that is over before it starts; nobody asks for that.
    for (const cap of [0, -1, 2.5, "200"]) {
      expect(normalizeScope({ volume: { cap } })).toBeNull();
    }
  });

  it("keeps every part when a merchant narrows more than one way", () => {
    const all = normalizeScope({
      ship_to: { states: ["ca"] },
      products: { match: "Boot" },
      volume: { cap: 50 },
    });
    expect(all).toEqual({
      ship_to: { country: "US", states: ["CA"] },
      volume: { cap: 50 },
      products: { match: "Boot" },
    });
  });
});
