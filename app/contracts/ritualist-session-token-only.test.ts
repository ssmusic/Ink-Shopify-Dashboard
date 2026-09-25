// SESSION TOKENS ONLY (App Store 1.1.1; Shopify's self-review, 2026-09-25):
// the Ritualist's settings calls authenticate with App Bridge's session token
// and never fall back to a token in the browser's local storage.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("the Ritualist's settings calls", () => {
  it.each(["CommunicationSettings", "DeliveryModeSettings"])("%s reads no token from local storage", (name) => {
    const src = readFileSync(new URL(`../components/settings/${name}.tsx`, import.meta.url), "utf8");
    expect(src).toMatch(/window\.shopify\?\.idToken\(\)/);
    expect(src).not.toMatch(/localStorage\.getItem/);
  });
});
