// THE TRACKING-LINK SETTING SAYS WHERE THE LINK CHANGES, AS MEASURED
// (audit 2026-09-25). Shopify's shipping email leaves before the rewrite, so
// the card never says the email carries the page; it points to the one line
// that does (the Notifications tab's paste card, #181).
import { describe, expect, it, vi } from "vitest";

vi.mock("../hooks/use-toast", () => ({ toast: vi.fn() }));
const { TRACKING_LINK_WHERE } = await import("../components/settings/DeliveryModeSettings");

describe("the Ritualist's tracking-link setting", () => {
  it("names the admin order page and the order-status page", () => {
    expect(TRACKING_LINK_WHERE).toMatch(/order page in your admin/);
    expect(TRACKING_LINK_WHERE).toMatch(/order-status page/);
  });
  it("says the shipping email keeps Shopify's link unless the line is added", () => {
    expect(TRACKING_LINK_WHERE).toMatch(/shipping email a few seconds before the link changes/);
    expect(TRACKING_LINK_WHERE).toMatch(/unless you add the one line/);
  });
  it("never claims the rewrite reaches the shipping-confirmation email", () => {
    expect(TRACKING_LINK_WHERE).not.toMatch(/in the shipping-confirmation email/);
  });
});
