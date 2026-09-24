import { describe, expect, it, vi } from "vitest";
vi.mock("../firestore.server", () => ({ default: {} }));
import { emailLineFromBackend, notificationsUrlFor } from "./email-line.server";
import { emailDoorOf, emailDoorSentence } from "./notification-snippet";

describe("the email line's own evidence (email_door, written by the order door)", () => {
  it("reads nothing as nothing", () => {
    expect(emailDoorOf(null)).toBeNull();
    expect(emailDoorOf({})).toBeNull();
    expect(emailDoorOf({ email_door: { count: 4 } })).toBeNull();
  });

  it("reads the backend's shape", () => {
    expect(
      emailDoorOf({ email_door: { first_at: "2026-09-20T00:00:00.000Z", last_at: "2026-09-24T22:00:00.000Z", count: 3, last_order_number: "1030" } }),
    ).toEqual({ first_at: "2026-09-20T00:00:00.000Z", last_at: "2026-09-24T22:00:00.000Z", count: 3, last_order_number: "1030" });
  });

  it("says not yet until a tap arrives, and working with the count and the day after", () => {
    expect(emailDoorSentence(null)).toEqual({ working: false, text: "Not yet: nobody has opened your page from this line." });
    const once = emailDoorSentence({ first_at: "2026-09-24T22:00:00.000Z", last_at: "2026-09-24T22:00:00.000Z", count: 1, last_order_number: null });
    expect(once.working).toBe(true);
    expect(once.text).toBe("Working: your page was opened from your emails once, last on Sep 24, 2026.");
    expect(emailDoorSentence({ first_at: "x", last_at: "2026-09-24T22:00:00.000Z", count: 7, last_order_number: null }).text).toContain("7 times");
  });

  it("never says verified, confirmed or read", () => {
    for (const d of [null, { first_at: "a", last_at: "2026-09-24T22:00:00.000Z", count: 2, last_order_number: null }]) {
      expect(emailDoorSentence(d).text).not.toMatch(/verif|confirm|\bread\b/i);
    }
  });
});

describe("the line needs a claimed host — no line beats one that cannot work", () => {
  it("builds the order-door line from the backend's brand_slug", () => {
    const v = emailLineFromBackend("sm-test-hhawzn52.myshopify.com", { brand_slug: "stevemadden" });
    expect(v.snippet).toBe('{% assign order_status_url = "https://stevemadden.in.ink/o/" | append: order_number %}');
    expect(v.brandHost).toBe("stevemadden.in.ink");
    expect(v.notificationsUrl).toBe("https://admin.shopify.com/store/sm-test-hhawzn52/settings/notifications");
    expect(v.templates).toContain("Shipping confirmation");
  });

  it("offers no line without a claimed slug — never the myshopify label, never www", () => {
    const v = emailLineFromBackend("corvara-cicli.myshopify.com", {});
    expect(v.snippet).toBeNull();
    expect(v.brandHost).toBeNull();
    expect(emailLineFromBackend("x.myshopify.com", null).snippet).toBeNull();
  });

  it("carries the door's evidence through", () => {
    const v = emailLineFromBackend("s.myshopify.com", { brand_slug: "s", email_door: { last_at: "2026-09-24T22:00:00.000Z", count: 2 } });
    expect(v.emailDoor?.count).toBe(2);
  });

  it("an empty shop still links somewhere real", () => {
    expect(notificationsUrlFor("")).toBe("https://admin.shopify.com");
  });
});
