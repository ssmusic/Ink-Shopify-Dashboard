// THE RECORD'S DOOR — the pure edges (services/record-door.server.ts).
//
// What these pin:
//   1. MONEY IS SAM'S GATE: the price is the BACKEND's alone (its $29
//      default included) — this app carries no price and no default; a price
//      with the kill switch off → nothing offered; both on → the backend's
//      price. Test charges only by env.
//   2. The charge is Shopify's one-time purchase, priced from the record, and
//      it comes back through the admin's own deep link — never the app's bare
//      URL (a top-level load there loses the charge id), never a guessed handle.
//   3. Only a same-app path is a place to come back to.
//   4. The wiring: the return never reads the kill switch (a paid charge
//      mints); the press re-reads it; the screen opens Shopify at the top;
//      the locked record's PDF and export answer 402.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RECORD_CHARGE_MUTATION,
  createRecordCharge,
  readRecordCharge,
  recordChargeGid,
  recordDoorRow,
  recordOffer,
  recordPriceWords,
  recordReturnUrl,
  safeReturnTo,
} from "./record-door.server";

afterEach(() => vi.unstubAllEnvs());

const PROOF = "proof_b3ea86a2c6aa96d2d4ee1e8b";
const src = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");

describe("the price and the switch", () => {
  it("carries no price and no default of its own: the raw field is never read here", () => {
    for (const rel of ["./record-door.server.ts", "./record-charges.server.ts", "../routes/app.record.tsx"]) {
      // Code, not comments: no read of the raw field and no default number.
      const code = src(rel).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");
      expect(code, rel).not.toMatch(/retrieval_price_cents|retrieval_currency|2900/);
    }
  });

  it("offers nothing while the kill switch is off, whatever the backend says", () => {
    const backendDefault = { price_cents: 2900, currency: "USD" };
    expect(recordOffer(backendDefault)).toBeNull();
    vi.stubEnv("RECORD_PURCHASES_ENABLED", "yes");
    expect(recordOffer(backendDefault)).toBeNull();
    vi.stubEnv("RECORD_PURCHASES_ENABLED", "true");
    expect(recordOffer(backendDefault)).toEqual(backendDefault);
    expect(recordOffer(null)).toBeNull();
  });

  it("says the price plainly", () => {
    expect(recordPriceWords({ price_cents: 1500, currency: "USD" })).toBe("$15");
    expect(recordPriceWords({ price_cents: 1550, currency: "USD" })).toBe("$15.50");
    expect(recordPriceWords({ price_cents: 2900, currency: "USD" })).toBe("$29");
  });
});

describe("a row's door", () => {
  const bought = [{ id: "pur_1", proof_id: PROOF, packet_url: "https://www.in.ink/verify/x?key=k", outcome: "won" }] as never;
  it("is the purchase once bought, the offer before, nothing without a record", () => {
    expect(recordDoorRow(PROOF, { price_cents: 1500, currency: "USD" }, bought)).toEqual({ offer: null, purchase: { id: "pur_1", packet_url: "https://www.in.ink/verify/x?key=k", outcome: "won" } });
    expect(recordDoorRow(PROOF, { price_cents: 1500, currency: "USD" }, [])).toEqual({ offer: { price_cents: 1500, currency: "USD" }, purchase: null });
    expect(recordDoorRow(PROOF, null, [])).toEqual({ offer: null, purchase: null });
    expect(recordDoorRow(null, { price_cents: 1500, currency: "USD" }, bought)).toEqual({ offer: null, purchase: null });
  });
});

describe("where the merchant comes back to", () => {
  it("only a same-app path; anything else is the in.ink screen", () => {
    expect(safeReturnTo("/app/orders/gid%3A%2F%2Fshopify%2FOrder%2F1")).toBe("/app/orders/gid%3A%2F%2Fshopify%2FOrder%2F1");
    expect(safeReturnTo("/app/ink")).toBe("/app/ink");
    for (const bad of ["https://evil.test/app", "//evil.test/app", "/app/../auth", "/admin", "", null, "/app//x"]) expect(safeReturnTo(bad)).toBe("/app/ink");
  });

  it("returns through the admin's deep link with the app's api key — never the app's bare URL, never a handle", () => {
    const url = recordReturnUrl({ shop: "made-up-shop.myshopify.com", apiKey: "45cc0000", proofId: PROOF, returnTo: "/app/ink" });
    expect(url).toBe(`https://admin.shopify.com/store/made-up-shop/apps/45cc0000/app/record?proof_id=${PROOF}&return_to=%2Fapp%2Fink`);
  });
});

describe("Shopify's one-time charge", () => {
  const admin = (body: unknown) => ({ graphql: vi.fn(async () => ({ json: async () => body })) });
  const ok = { data: { appPurchaseOneTimeCreate: { appPurchaseOneTime: { id: "gid://shopify/AppPurchaseOneTime/77", status: "PENDING" }, confirmationUrl: "https://admin.shopify.com/charges/77/confirm", userErrors: [] } } };

  it("is created from the record's price, real by default, a test charge only when the env says so", async () => {
    const a = admin(ok);
    const out = await createRecordCharge(a, { orderName: "#1042", price: { price_cents: 1500, currency: "USD" }, returnUrl: "https://admin.shopify.com/store/s/apps/k/app/record" });
    expect(out).toEqual({ confirmationUrl: "https://admin.shopify.com/charges/77/confirm", chargeId: "gid://shopify/AppPurchaseOneTime/77" });
    expect(a.graphql).toHaveBeenCalledWith(RECORD_CHARGE_MUTATION, { variables: {
      name: "The record of order #1042",
      price: { amount: "15.00", currencyCode: "USD" },
      returnUrl: "https://admin.shopify.com/store/s/apps/k/app/record",
      test: false,
    } });
    vi.stubEnv("RECORD_PURCHASE_TEST", "true");
    const t = admin(ok);
    await createRecordCharge(t, { orderName: "#1042", price: { price_cents: 1500, currency: "USD" }, returnUrl: "x" });
    expect((t.graphql.mock.calls[0] as unknown as [string, { variables: { test: boolean } }])[1].variables.test).toBe(true);
  });

  it("a refusal throws with Shopify's words; nothing half-made is returned", async () => {
    await expect(createRecordCharge(admin({ data: { appPurchaseOneTimeCreate: { appPurchaseOneTime: null, confirmationUrl: null, userErrors: [{ message: "Price must be at least 0.50" }] } } }), { orderName: "#1", price: { price_cents: 10, currency: "USD" }, returnUrl: "x" }))
      .rejects.toThrow(/Price must be at least 0.50/);
  });

  it("reads back what Shopify says about the charge, in cents", async () => {
    const read = await readRecordCharge(admin({ data: { node: { id: "gid://shopify/AppPurchaseOneTime/77", status: "ACTIVE", test: true, price: { amount: "15.0", currencyCode: "USD" } } } }), "gid://shopify/AppPurchaseOneTime/77");
    expect(read).toEqual({ id: "gid://shopify/AppPurchaseOneTime/77", status: "ACTIVE", test: true, price_cents: 1500, currency: "USD" });
    expect(await readRecordCharge(admin({ data: { node: null } }), "gid://shopify/AppPurchaseOneTime/77")).toBeNull();
  });

  it("knows a charge id in either shape, and nothing else", () => {
    expect(recordChargeGid("77")).toBe("gid://shopify/AppPurchaseOneTime/77");
    expect(recordChargeGid("gid://shopify/AppPurchaseOneTime/77")).toBe("gid://shopify/AppPurchaseOneTime/77");
    for (const bad of ["", null, "gid://shopify/AppSubscription/1", "77; drop"]) expect(recordChargeGid(bad)).toBeNull();
  });
});

describe("the wiring", () => {
  it("the return never reads the kill switch; the press does; the screen opens Shopify at the top frame", () => {
    const route = src("../routes/app.record.tsx");
    const loader = route.slice(route.indexOf("export const loader"), route.indexOf("export const action"));
    expect(loader).not.toMatch(/recordOffer|RECORD_PURCHASES_ENABLED|recordPurchasesEnabled/);
    expect(loader).toContain("settleRecordCharges(admin, session.shop, view.shopId)");
    const action = route.slice(route.indexOf("export const action"));
    expect(action).toContain("const offer = recordOffer(await readRecordPrice(view.shopId));");
    expect(action).toContain("await rememberRecordCharge(session.shop, proofId, chargeId);");
    expect(src("../components/RecordDoor.tsx")).toContain('window.open(url, "_top")');
  });

  it("a locked record's PDF and export answer 402, and the card draws the door instead of them", () => {
    expect(src("../routes/app.api.orders.$orderId.audit-report.tsx")).toContain('if (packet.record?.locked === true) return new Response("The record is not bought yet", { status: 402 });');
    expect(src("../routes/app.api.orders.$orderId.record-export.tsx")).toContain("err instanceof InkApiError && err.status === 402");
    const card = src("../components/VerifiableRecordCard.tsx");
    expect(card).toContain("{!locked && (");
    const orderPage = src("../routes/app.orders.$orderId.tsx");
    expect(orderPage).toContain("locked={order.localProof.record_locked}");
    // An unpriced merchant pays no extra call on the order page.
    expect(orderPage).toContain("if (order.localProof?.proof_id && order.localProof.record_priced) {");
    // ink's Recent orders: the door sits at the bottom of each row's accordion
    // (components/InkRecentOrders.tsx — Sam, 2026-09-23).
    expect(src("../routes/app.ink._index.tsx")).toContain('<InkRecentOrders orders={data.recentOrders} returnTo="/app/ink" />');
    expect(src("../components/InkRecentOrders.tsx")).toContain("<RecordDoor proofId={row.proofId} orderName={row.name} returnTo={returnTo} door={row.door} hidePacketLink={Boolean(row.packet)} />");
  });
});
