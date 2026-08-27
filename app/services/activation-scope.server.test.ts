import { describe, expect, it } from "vitest";
import {
  normalizeScope,
  normalizeStateCode,
  orderActivates,
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
