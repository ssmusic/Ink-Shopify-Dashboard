// EXPIRING OFFLINE TOKENS REACH THE ROUTES THAT READ THE TOKEN THEMSELVES.
// A route that loads a session document from Firestore and sends its token
// must get a live one: a token within five minutes of expiry is refreshed
// through the library (unauthenticated.admin), a legacy non-expiring token is
// left alone, and a failed refresh never makes the caller worse off.

import { beforeEach, describe, expect, it, vi } from "vitest";

const admin = vi.fn();
vi.mock("./shopify.server", () => ({ unauthenticated: { admin } }));
vi.mock("./firestore.server", () => ({ default: {} }));

const { tokenNeedsRefresh, withFreshToken, withFreshTokens, REFRESH_MARGIN_MS } = await import(
  "./session-utils.server"
);

const NOW = Date.parse("2026-09-26T01:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

beforeEach(() => {
  admin.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe("tokenNeedsRefresh", () => {
  it("never refreshes a legacy token with no expiry", () => {
    expect(tokenNeedsRefresh({ shop: "a.myshopify.com", accessToken: "t" })).toBe(false);
  });
  it("leaves a token with more than the margin to live", () => {
    expect(tokenNeedsRefresh({ expires: iso(NOW + REFRESH_MARGIN_MS + 1000) }, NOW)).toBe(false);
  });
  it("refreshes inside the margin, after expiry, and on an unreadable date", () => {
    expect(tokenNeedsRefresh({ expires: iso(NOW + 60_000) }, NOW)).toBe(true);
    expect(tokenNeedsRefresh({ expires: iso(NOW - 60_000) }, NOW)).toBe(true);
    expect(tokenNeedsRefresh({ expires: new Date(NOW - 1) }, NOW)).toBe(true);
    expect(tokenNeedsRefresh({ expires: "not a date" }, NOW)).toBe(true);
  });
});

describe("withFreshToken", () => {
  it("returns a live token without calling Shopify", async () => {
    const doc = { shop: "a.myshopify.com", accessToken: "live", expires: iso(NOW + 30 * 60_000) };
    await expect(withFreshToken(doc)).resolves.toBe(doc);
    expect(admin).not.toHaveBeenCalled();
  });

  it("swaps an expired token for the library's refreshed one", async () => {
    const fresh = new Date(NOW + 60 * 60_000);
    admin.mockResolvedValue({ session: { accessToken: "new", expires: fresh } });
    const doc = { shop: "a.myshopify.com", accessToken: "dead", expires: iso(NOW - 1000), scope: "read_orders" };
    const out = await withFreshToken(doc);
    expect(admin).toHaveBeenCalledWith("a.myshopify.com");
    expect(out).toEqual({ ...doc, accessToken: "new", expires: fresh.toISOString() });
  });

  it("keeps the document when the refresh fails", async () => {
    admin.mockRejectedValue(new Error("refresh token revoked"));
    const doc = { shop: "a.myshopify.com", accessToken: "dead", expires: iso(NOW - 1000) };
    await expect(withFreshToken(doc)).resolves.toBe(doc);
  });

  it("refreshes each store in a list on its own", async () => {
    admin.mockImplementation(async (shop: string) => ({
      session: { accessToken: `new-${shop}`, expires: new Date(NOW + 3_600_000) },
    }));
    const out = await withFreshTokens([
      { shop: "a.myshopify.com", accessToken: "legacy" },
      { shop: "b.myshopify.com", accessToken: "dead", expires: iso(NOW - 1) },
    ]);
    expect(out.map((d) => d.accessToken)).toEqual(["legacy", "new-b.myshopify.com"]);
    expect(admin).toHaveBeenCalledTimes(1);
  });
});
