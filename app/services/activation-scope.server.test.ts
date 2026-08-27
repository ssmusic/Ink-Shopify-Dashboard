import { describe, expect, it } from "vitest";
import {
  normalizeScope,
  normalizeStateCode,
  countryOfWebhookOrder,
  orderActivates,
  postcodeOfWebhookOrder,
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
    // The legacy `country: "US"` is read and then DROPPED — it qualified the
    // states rather than naming a place, so it is not written back.
    expect(
      scopeOfMerchant({ activation_scope: { ship_to: { country: "US", states: ["ca"] } } }),
    ).toEqual({ ship_to: { states: ["CA"] } });
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
      ship_to: { states: ["CA"] },
      volume: { cap: 50 },
      products: { match: "Boot" },
    });
  });
});

// ── THIS IS AN INTERNATIONAL PRODUCT ─────────────────────────────────────
describe("a pilot on a country", () => {
  const uk = normalizeScope({ ship_to: { countries: ["GB"] } });

  it("reads country_code first, then the name", () => {
    expect(countryOfWebhookOrder({ shipping_address: { country_code: "GB" } })).toBe("GB");
    expect(countryOfWebhookOrder({ shipping_address: { country: "United Kingdom" } })).toBe("GB");
    // The names people and storefronts actually use.
    expect(normalizeScope({ ship_to: { countries: ["uk"] } })?.ship_to?.countries).toEqual(["GB"]);
  });

  it("activates an order shipping there and no other", () => {
    expect(orderActivates({ shipping_address: { country_code: "GB" } }, uk)).toBe(true);
    expect(orderActivates({ shipping_address: { country_code: "US" } }, uk)).toBe(false);
  });

  it("FAILS CLOSED on a country it cannot place", () => {
    expect(orderActivates({ shipping_address: { country: "Freedonia" } }, uk)).toBe(false);
    expect(orderActivates({}, uk)).toBe(false);
  });

  it("matches places with OR — the UK, and California", () => {
    const both = normalizeScope({ ship_to: { countries: ["GB"], states: ["CA"] } });
    expect(orderActivates({ shipping_address: { country_code: "GB" } }, both)).toBe(true);
    expect(
      orderActivates({ shipping_address: { country_code: "US", province_code: "CA" } }, both),
    ).toBe(true);
    expect(
      orderActivates({ shipping_address: { country_code: "US", province_code: "TX" } }, both),
    ).toBe(false);
  });
});

describe("a US-only slice written before this was international", () => {
  it("keeps its states and is NOT widened to all of America", () => {
    const legacy = normalizeScope({ ship_to: { country: "US", states: ["CA"] } });
    expect(legacy?.ship_to?.states).toEqual(["CA"]);
    expect(legacy?.ship_to?.countries).toBeUndefined();
    expect(
      orderActivates({ shipping_address: { country_code: "US", province_code: "TX" } }, legacy),
    ).toBe(false);
  });
});

describe("a merchant can type their product's real name", () => {
  // Measured on the real fixture ledger 2026-08-27: "Côte" matched nothing
  // while "cote" matched, because only one side of the comparison had its
  // accents flattened. The gate must agree with the workspace, or a
  // merchant sees one set of orders and their customers get another.
  const lines = [{ title: "La Côte Tote" }];

  it("matches an accented product by its accented name, in any case", () => {
    for (const typed of ["Côte", "côte", "CÔTE"]) {
      expect(productsActivate(lines, normalizeScope({ products: { match: typed } }))).toBe(true);
    }
  });

  it("does not match a product the order does not hold", () => {
    expect(productsActivate(lines, normalizeScope({ products: { match: "backpack" } }))).toBe(false);
  });
});

describe("a pilot on a ZIP or postcode", () => {
  it("reads it off the raw body and normalizes ZIP+4 to its five", () => {
    expect(postcodeOfWebhookOrder({ shipping_address: { zip: "90026-1234" } })).toBe("90026");
    expect(postcodeOfWebhookOrder({ shipping_address: { zip: "sw1a 1aa" } })).toBe("SW1A1AA");
    expect(postcodeOfWebhookOrder({ shipping_address: {} })).toBeNull();
    expect(postcodeOfWebhookOrder(null)).toBeNull();
  });

  it("activates an exact match and a PREFIX", () => {
    const one = normalizeScope({ ship_to: { postcodes: ["90026"] } });
    expect(orderActivates({ shipping_address: { zip: "90026" } }, one)).toBe(true);
    expect(orderActivates({ shipping_address: { zip: "90210" } }, one)).toBe(false);

    const region = normalizeScope({ ship_to: { postcodes: ["900"] } });
    expect(orderActivates({ shipping_address: { zip: "90026" } }, region)).toBe(true);
    expect(orderActivates({ shipping_address: { zip: "90210" } }, region)).toBe(false);
  });

  it("is not US-only", () => {
    const london = normalizeScope({ ship_to: { postcodes: ["SW1A"] } });
    expect(orderActivates({ shipping_address: { zip: "SW1A 1AA" } }, london)).toBe(true);
    expect(orderActivates({ shipping_address: { zip: "EC1A1BB" } }, london)).toBe(false);
  });

  it("FAILS CLOSED with no postcode on the order", () => {
    const one = normalizeScope({ ship_to: { postcodes: ["90026"] } });
    expect(orderActivates({ shipping_address: { city: "Los Angeles" } }, one)).toBe(false);
    expect(orderActivates({}, one)).toBe(false);
  });

  it("sits beside countries and states, matched with OR", () => {
    const mixed = normalizeScope({
      ship_to: { countries: ["GB"], states: ["CA"], postcodes: ["10011"] },
    });
    expect(orderActivates({ shipping_address: { country_code: "GB" } }, mixed)).toBe(true);
    expect(orderActivates({ shipping_address: { province_code: "CA" } }, mixed)).toBe(true);
    expect(orderActivates({ shipping_address: { zip: "10011" } }, mixed)).toBe(true);
    expect(orderActivates({ shipping_address: { province_code: "TX", zip: "73301" } }, mixed)).toBe(false);
  });
});
