// NOTHING OPTIONAL RIDES THE ENROLL-CRITICAL QUERY.
//
// Real order #1019, 2026-08-09. PR #82 added `product { onlineStoreUrl }` to
// ORDER_DETAIL_QUERY — the single query that feeds auto-enrollment. The app
// has never held `read_products`, and Shopify does not omit a field it cannot
// authorize: it fails the entire query. So the order came back
//
//     Access denied for product field. Required access: `read_products`
//
// and with it went the order name, the customer, the ship-to, the line items,
// the idempotency metafield and the fulfillments — everything a proof is made
// of. No proof was created. Because the failure was caught and warned, the
// handler then printed `✅ Successfully processed` and returned 200, which
// also told Shopify never to retry. Every new order on every install failed
// this way, silently, for the two hours it took a human to notice the order
// was missing from the app.
//
// Two independent guards, because two independent things went wrong:
//   1. the enrichment must not be able to take enrollment down again, ever
//      (even once the scope lands — the NEXT optional field is the risk)
//   2. a failed enroll must say so and ask for the retry
//
// Both were watched failing against the pre-change source before being
// trusted (§0.0 rule 5): guard 1 reports the `product {` selection inside
// ORDER_DETAIL_QUERY, guard 2's attachProductUrls import does not exist.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { attachProductUrls, productDetailFromLineItem } from "./order-line-item";

const ROUTE_SRC = readFileSync(
  fileURLToPath(new URL("../routes/webhooks.orders_create.ts", import.meta.url)),
  "utf8",
);

/** The text of one `const NAME = \`…\`;` template literal in the route. */
function templateLiteral(name: string): string {
  const start = ROUTE_SRC.indexOf(`${name} = \``);
  if (start === -1) throw new Error(`${name} not found in webhooks.orders_create.ts`);
  const open = ROUTE_SRC.indexOf("`", start);
  const close = ROUTE_SRC.indexOf("`", open + 1);
  if (close === -1) throw new Error(`${name} literal is unterminated`);
  return ROUTE_SRC.slice(open + 1, close);
}

describe("the enroll-critical query carries nothing optional", () => {
  it("does not select any product field — that needs read_products, and an unauthorized field fails the WHOLE query", () => {
    const critical = templateLiteral("ORDER_DETAIL_QUERY");
    expect(critical).not.toMatch(/\bproduct\s*\{/);
    expect(critical).not.toContain("onlineStoreUrl");
  });

  it("still selects everything a proof is actually made of", () => {
    const critical = templateLiteral("ORDER_DETAIL_QUERY");
    for (const required of [
      "name",
      "customer",
      "shippingAddress",
      "totalPriceSet",
      "lineItems",
      "sku",
      "image",
      "metafield",
      "fulfillments",
    ]) {
      expect(critical).toContain(required);
    }
  });

  it("asks for the product URLs on a separate wire", () => {
    const enrichment = templateLiteral("PRODUCT_URLS_QUERY");
    expect(enrichment).toMatch(/\bproduct\s*\{/);
    expect(enrichment).toContain("onlineStoreUrl");
    // Its own operation — not a fragment spliced back into the critical one.
    expect(enrichment).toContain("query AutoEnrollProductUrls");
  });

  it("fetches those URLs fail-open, and logs the refusal rather than hiding it", () => {
    // The fetch helper swallows the error (so enroll survives) but must warn
    // (so the outage cannot be permanent and silent — TECH_BIBLE law 32).
    const helper = ROUTE_SRC.slice(
      ROUTE_SRC.indexOf("async function fetchProductUrls"),
      ROUTE_SRC.indexOf("const TAG_MUTATION"),
    );
    expect(helper).toContain("catch");
    expect(helper).toContain("return null");
    expect(helper).toMatch(/console\.warn/);
  });
});

describe("a failed enroll is reported, and retried", () => {
  it("returns 500 on enroll failure so Shopify redelivers", () => {
    expect(ROUTE_SRC).toContain("enrollFailure");
    const tail = ROUTE_SRC.slice(ROUTE_SRC.indexOf("if (enrollFailure)"));
    expect(tail).toMatch(/status:\s*500/);
  });

  it("prints the success line only when the enroll did not fail", () => {
    const successIdx = ROUTE_SRC.indexOf("Successfully processed order");
    const guardIdx = ROUTE_SRC.indexOf("if (enrollFailure)");
    expect(guardIdx).toBeGreaterThan(-1);
    // The guard returns before the success line can be reached.
    expect(guardIdx).toBeLessThan(successIdx);
  });

  it("logs the failure as an error naming the order, not a warn that reads like noise", () => {
    expect(ROUTE_SRC).toMatch(/Auto-enroll FAILED for \$\{orderName\}/);
  });
});

describe("attachProductUrls folds the enrichment in without ever damaging a detail", () => {
  const details = () => [
    productDetailFromLineItem({
      title: "Bevelyn Pump",
      sku: "BEV-1",
      quantity: 1,
      originalUnitPriceSet: { shopMoney: { amount: "109.95" } },
      image: { url: "https://cdn.shopify.com/bevelyn.jpg" },
    }),
    productDetailFromLineItem({ title: "Carrson Sandal", quantity: 2 }),
  ];

  it("attaches each URL by index", () => {
    const out = attachProductUrls(details(), [
      "https://www.stevemadden.com/products/bevelyn",
      "https://www.stevemadden.com/products/carrson",
    ]);
    expect(out[0].product_url).toBe("https://www.stevemadden.com/products/bevelyn");
    expect(out[1].product_url).toBe("https://www.stevemadden.com/products/carrson");
  });

  it("leaves details BYTE-IDENTICAL when the fetch was refused (null)", () => {
    const before = details();
    const out = attachProductUrls(before, null);
    expect(out).toEqual(before);
    expect(out.every((d) => !("product_url" in d))).toBe(true);
  });

  it("omits rather than writing an empty product_url when a product has no storefront page", () => {
    const out = attachProductUrls(details(), [null, "https://www.stevemadden.com/products/carrson"]);
    expect("product_url" in out[0]).toBe(false);
    expect(out[1].product_url).toBe("https://www.stevemadden.com/products/carrson");
  });

  it("leaves the tail unenriched when the two calls disagree on length", () => {
    const out = attachProductUrls(details(), ["https://www.stevemadden.com/products/bevelyn"]);
    expect(out[0].product_url).toBe("https://www.stevemadden.com/products/bevelyn");
    expect("product_url" in out[1]).toBe(false);
  });

  it("never mutates the input array", () => {
    const before = details();
    attachProductUrls(before, ["https://www.stevemadden.com/products/bevelyn", null]);
    expect("product_url" in before[0]).toBe(false);
  });
});
