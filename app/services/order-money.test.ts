// The money rides the enrol (Track C): lifted from the orders/create body
// Shopify already sent, kept as Shopify sent it, and ABSENT when absent —
// never "" or 0, because the backend must be able to tell "the store said
// nothing" from "the store said zero".
import { describe, expect, it } from "vitest";
import { orderMoneyFromWebhook } from "./order-money";

const ORDER = {
  id: 6001,
  total_price: "119.96",
  subtotal_price: "149.95",
  total_discounts: "29.99",
  currency: "usd",
  discount_codes: [{ code: "LABORDAY20", amount: "29.99", type: "percentage" }],
  discount_applications: [
    { target_type: "line_item", type: "discount_code", value: "20.0", value_type: "percentage", allocation_method: "across", target_selection: "all", code: "LABORDAY20" },
    { target_type: "line_item", type: "automatic", value: "5.0", value_type: "fixed_amount", allocation_method: "across", target_selection: "all", title: "Fall automatic" },
  ],
};

describe("orderMoneyFromWebhook", () => {
  it("lifts the total, currency, subtotal, discounts, the codes and the applications, as sent", () => {
    const m = orderMoneyFromWebhook(ORDER);
    expect(m).toEqual({
      total_price: "119.96",
      currency: "USD",
      subtotal_price: "149.95",
      total_discounts: "29.99",
      discount_codes: [{ code: "LABORDAY20", amount: "29.99", type: "percentage" }],
      discount_applications: [
        { type: "discount_code", code: "LABORDAY20", value: "20.0", value_type: "percentage", target_type: "line_item" },
        { type: "automatic", title: "Fall automatic", value: "5.0", value_type: "fixed_amount", target_type: "line_item" },
      ],
    });
  });

  it("absent stays absent — an order with no money fields yields an empty object, never zeros", () => {
    expect(orderMoneyFromWebhook({ id: 1 })).toEqual({});
    expect(orderMoneyFromWebhook(null)).toEqual({});
    expect(orderMoneyFromWebhook({ total_price: "", currency: "", discount_codes: [], discount_applications: [] })).toEqual({});
  });

  it("junk is dropped, not carried: a NaN total, a non-list codes field, an empty code", () => {
    const m = orderMoneyFromWebhook({ total_price: "abc", currency: "dollars", discount_codes: "x", discount_applications: [{ code: "" }, null] });
    expect(m.total_price).toBeUndefined();
    expect(m.currency).toBe("DOL");
    expect(m.discount_codes).toBeUndefined();
    expect(m.discount_applications).toBeUndefined();
  });

  it("a zero total is a declared zero, and rides", () => {
    expect(orderMoneyFromWebhook({ total_price: "0.00", currency: "USD" })).toEqual({ total_price: "0.00", currency: "USD" });
  });
});
