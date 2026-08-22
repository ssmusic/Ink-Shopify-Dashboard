import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// THE FORWARDING CONTRACT (2026-08-21). Shopify pushes shipment_status on
// every fulfillments/update for ANY carrier — the exact states its own
// tracking page shows. The embed used to forward only the tracking NUMBER;
// the status died here, so a page whose Shippo registration failed stayed
// dark while the merchant's store knew the answer. Source-contract style,
// same as route-contracts.test.ts: these strings ARE the wiring.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("Shopify's shipment_status reaches the backend", () => {
  it("fulfillments_update forwards it with the tracking hop", () => {
    const src = read("app/routes/webhooks.fulfillments_update.tsx");
    expect(src).toContain("shipment_status: shipmentStatus || undefined");
  });

  it("fulfillments_create forwards it when present", () => {
    const src = read("app/routes/webhooks.fulfillments_create.tsx");
    expect(src).toContain("shipment_status: payload.shipment_status || undefined");
  });

  it("the service payload names the field, so a refactor cannot drop it silently", () => {
    const src = read("app/services/nfs.server.ts");
    expect(src).toContain("shipment_status?: string");
  });
});
