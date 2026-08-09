// A TYPED FIELD NOBODY SERVED.
//
// The customer wire has carried `product_url` on line items for a long time —
// the adapter forwards it, `LineItem` declares it, the tap page can read it —
// and this webhook never filled it. So it has been null on every
// Shopify-enrolled order, and "view this product" was unbuildable for a reason
// nobody could see. Measured, not assumed: the 60-proof Taylor Stitch live
// corpus carries ZERO product_urls.
//
// Same shape as the sku/product_type drop (#820) and the third instance of it:
// a field that exists at both ends and is dropped in the middle is invisible to
// tsc, the suite and review.

import { describe, expect, it } from "vitest";
import { productDetailFromLineItem } from "./order-line-item";

const node = (over: Record<string, unknown> = {}) => ({
  title: "Lanyard Tote",
  sku: "LT-001",
  quantity: 2,
  originalUnitPriceSet: { shopMoney: { amount: "128.00" } },
  image: { url: "https://cdn.shopify.com/tote.jpg" },
  ...over,
});

describe("what a line item tells the proof", () => {
  it("carries the product's own storefront page", () => {
    const out = productDetailFromLineItem(
      node({ product: { onlineStoreUrl: "https://stevemadden.com/products/lanyard-tote" } }),
    );

    expect(out.product_url).toBe("https://stevemadden.com/products/lanyard-tote");
  });

  it("OMITS it when the product isn't published to the storefront", () => {
    // onlineStoreUrl is null for a product not on the Online Store channel.
    // Absent is the honest answer, and the tap page hides the link on absence
    // (law 7) — which only works if absent means absent, never "".
    const out = productDetailFromLineItem(node({ product: { onlineStoreUrl: null } }));

    expect("product_url" in out).toBe(false);
  });

  it("omits it when Shopify sends no product at all", () => {
    const out = productDetailFromLineItem(node());

    expect("product_url" in out).toBe(false);
  });

  it("leaves the commerce evidence exactly as it was", () => {
    // The sku/product_type drop cost a release. Nothing else moves here.
    const out = productDetailFromLineItem(node());

    expect(out).toEqual({
      name: "Lanyard Tote",
      sku: "LT-001",
      quantity: 2,
      price: "128.00",
      image_url: "https://cdn.shopify.com/tote.jpg",
    });
  });

  it("keeps its nerve on a half-empty node", () => {
    const out = productDetailFromLineItem({ title: "Bare" });

    expect(out).toEqual({
      name: "Bare",
      sku: "",
      quantity: 1,
      price: "0",
      image_url: null,
    });
  });
});
