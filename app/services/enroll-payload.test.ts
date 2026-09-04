// The enrol body, pinned (Track C): the money lands inside order_details
// beside the fields that were already there, only when the webhook carried
// it; the two other call sites (warehouse, tagged shipments) pass no context
// and their body is byte-identical to before.
import { describe, expect, it } from "vitest";
import { buildEnrollPayload } from "./enroll-payload";

const base = {
  orderId: "6001",
  nfcToken: "nfc_x",
  orderNumber: "#1026",
  customerEmail: "dana@example.com",
  shippingAddress: { name: "Dana", line1: "1 Main", city: "LA", state: "CA", zip: "90026", country: "US" },
  productDetails: [{ name: "Boot", price: "149.95", quantity: 1 }],
  carrierName: "USPS",
  trackingNumber: "9400",
  customerPhone: "+1555",
};

describe("buildEnrollPayload", () => {
  it("stamps the money onto order_details when the webhook carried it", () => {
    const p = buildEnrollPayload({
      ...base,
      orderContext: {
        orderStatusUrl: "https://sm-test.myshopify.com/orders/abc",
        shopDomain: "sm-test.myshopify.com",
        money: { total_price: "119.96", currency: "USD", discount_codes: [{ code: "LABORDAY20" }] },
      },
    });
    expect(p.order_details.total_price).toBe("119.96");
    expect(p.order_details.currency).toBe("USD");
    expect(p.order_details.discount_codes).toEqual([{ code: "LABORDAY20" }]);
    expect(p.order_details.order_status_url).toBe("https://sm-test.myshopify.com/orders/abc");
    expect(p.order_details.shop_domain).toBe("sm-test.myshopify.com");
    expect(p.order_details.customer_name).toBe("Dana");
    expect(p.carrier_name).toBe("USPS");
    expect(p.tracking_number).toBe("9400");
  });

  it("no context, no money keys at all — the warehouse and tagged-shipments bodies are unchanged", () => {
    const p = buildEnrollPayload(base);
    expect(Object.keys(p.order_details).sort()).toEqual(
      ["customer_email", "customer_name", "customer_phone", "order_number", "product_details", "shipping_address"],
    );
    expect(p.order_details.customer_phone).toBe("+1555");
    const empty = buildEnrollPayload({ ...base, orderContext: { orderStatusUrl: null, shopDomain: null, money: {} } });
    expect("total_price" in empty.order_details).toBe(false);
    expect("order_status_url" in empty.order_details).toBe(false);
  });
});
