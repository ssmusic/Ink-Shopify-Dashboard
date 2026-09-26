// SECURITY PINS FROM THE 2026-09-26 REVIEW PASS.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

vi.mock("../firestore.server", () => ({ default: {} }));
process.env.INK_ADMIN_SECRET ||= "test-only-not-a-secret";
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("user management", () => {
  const route = read("routes/app.api.users.tsx");
  it("lets only a Shopify Admin session create or delete users", () => {
    expect(route).toMatch(/\(intent === "create" \|\| intent === "delete"\) && !viaShopifyAdmin/);
  });
  it("deletes only a user of the caller's own store", () => {
    expect(route).toMatch(/getMerchantUsers\(shopDomain\)[\s\S]{0,300}ids\.has\(userId\)/);
  });
  it("never lets a user id walk the backend's admin path", async () => {
    const { isPlainUserId } = await import("../services/ink-api.server");
    expect(isPlainUserId("u_123-abc")).toBe(true);
    for (const bad of ["../merchants/x", "%2e%2e", "a/b", "", 42, null]) expect(isPlainUserId(bad)).toBe(false);
    expect(read("services/ink-api.server.ts")).toMatch(/\/admin\/users\/\$\{encodeURIComponent\(userId\)\}/);
  });
});

describe("signatures and auth answers", () => {
  it("/api/return-status accepts only its own secret, in constant time", () => {
    const src = read("routes/api.return-status.tsx");
    expect(src).not.toMatch(/INK_ADMIN_SECRET/);
    expect(src).toMatch(/timingSafeEqual/);
  });
  it("/ink/update never logs its raw body", () => {
    expect(read("routes/ink.update.tsx")).not.toMatch(/console\.\w+\([^)]*rawBody/);
  });
  it("fulfillments_update and dashboard inventory pass the library's auth answer on", () => {
    expect(read("routes/webhooks.fulfillments_update.tsx")).toMatch(/if \(error instanceof Response\) throw error;\s*\n\s*if \(appFlavor\(\) === "ink"\)/);
    expect(read("routes/app.api.dashboard.inventory.tsx")).toMatch(/if \(err instanceof Response\) throw err;/);
  });
});

describe("the public repository", () => {
  it("holds no live-format backend keys", () => {
    const hits = execSync(`git grep -l -E "ink_(live|admin)_[0-9a-f]{40,}" -- . || true`, { encoding: "utf8" }).trim();
    expect(hits).toBe("");
  });
});
