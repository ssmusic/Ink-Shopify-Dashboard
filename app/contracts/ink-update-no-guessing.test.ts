// /ink/update WRITES ONLY TO THE ORDER IT WAS GIVEN (review pass 2026-09-26).
// Two fallbacks used to guess: a `metafield.ink.proof_reference:` order search,
// which Shopify silently ignores and so returned the first order of the first
// store, and an order-name search across every connected store. From
// 2026-09-18 to 09-21 they wrote other stores' page events onto one corvara
// order. Only an exact order ID is written now, and the signature check is
// constant-time and never logs the expected value.
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("../utils/metafields.server", () => ({ INK_NAMESPACE: "ink" }));
const src = readFileSync(new URL("../routes/ink.update.tsx", import.meta.url), "utf8");
const { signaturesMatch } = await import("../routes/ink.update");

describe("/ink/update", () => {
  it("never searches orders to guess which one an event belongs to", () => {
    expect(src).not.toMatch(/metafield\.ink\.proof_reference:/);
    expect(src).not.toMatch(/query: `name:/);
    expect(src).not.toMatch(/PASS 2|PASS 3/);
    expect(src).toMatch(/gid:\/\/shopify\/Order\/\$\{rawOrderId\}/);
  });

  it("checks the signature in constant time and never logs the expected one", () => {
    const body = '{"order_id":"1"}';
    const good = createHmac("sha256", "k").update(body).digest("hex");
    expect(signaturesMatch(good, good)).toBe(true);
    expect(signaturesMatch(good.replace(/.$/, "0") === good ? good.replace(/.$/, "1") : good.replace(/.$/, "0"), good)).toBe(false);
    expect(signaturesMatch("short", good)).toBe(false);
    expect(signaturesMatch(undefined, good)).toBe(false);
    expect(src).not.toMatch(/console\.\w+\([^)]*expectedSignature/);
  });
});
