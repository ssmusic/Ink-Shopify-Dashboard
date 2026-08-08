// THE NOTIFICATIONS PAGE, PINNED AT THE SEAMS IT BROKE AT.
//
// The audit (2026-08-07) found the page disconnected end to end: the client
// authenticated with a localStorage token nothing ever set, the API wrote
// request.json() verbatim onto the merchant doc, no doc was ever seeded, and
// the App Bridge session token (whose shop lives in `dest`, not `shop`) could
// never resolve a merchant. These tests pin the pure seams of the fix:
// payload sanitation, token→shop resolution, and the defaults contract.
//
// Written BEFORE the module existed — red first, per the canary doctrine.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  TEMPLATE_KEYS,
  sanitizeNotificationSettings,
  resolveShopFromTokenPayload,
} from "./notification-settings";

describe("sanitizeNotificationSettings — the API stops writing verbatim", () => {
  it("drops unknown top-level keys instead of persisting them", () => {
    const clean = sanitizeNotificationSettings({
      channels: { email: false, sms: false },
      evil: { anything: true },
      __proto__polluter: 1,
    });
    expect(clean).not.toHaveProperty("evil");
    expect(clean.channels.email).toBe(false);
  });

  it("drops the NFC-era `reminders` group entirely — tap reminders are a relic", () => {
    const clean = sanitizeNotificationSettings({
      reminders: { hours4: true, hours24: true, hours48: true },
    });
    expect(clean).not.toHaveProperty("reminders");
  });

  it("only literal booleans move a toggle; stringly values keep the default", () => {
    const clean = sanitizeNotificationSettings({
      channels: { email: "false", sms: 1 },
      delivery: { delivered: false },
    });
    // "false"/1 are not booleans → defaults hold
    expect(clean.channels.email).toBe(DEFAULT_NOTIFICATION_SETTINGS.channels.email);
    expect(clean.channels.sms).toBe(DEFAULT_NOTIFICATION_SETTINGS.channels.sms);
    // a real boolean lands
    expect(clean.delivery.delivered).toBe(false);
  });

  it("returnWindow accepts only the four offered values", () => {
    expect(sanitizeNotificationSettings({ returnWindow: "90" }).returnWindow).toBe("90");
    expect(sanitizeNotificationSettings({ returnWindow: "45" }).returnWindow).toBe(
      DEFAULT_NOTIFICATION_SETTINGS.returnWindow,
    );
    expect(sanitizeNotificationSettings({ returnWindow: 90 }).returnWindow).toBe(
      DEFAULT_NOTIFICATION_SETTINGS.returnWindow,
    );
  });

  it("templatesPastedAt keeps only the four known templates, ISO string or null", () => {
    const clean = sanitizeNotificationSettings({
      templatesPastedAt: {
        shipping_confirmation: "2026-08-07T23:00:00.000Z",
        shipping_update: null,
        made_up_template: "2026-08-07T23:00:00.000Z",
        out_for_delivery: 12345,
      },
    });
    expect(clean.templatesPastedAt.shipping_confirmation).toBe("2026-08-07T23:00:00.000Z");
    expect(clean.templatesPastedAt.shipping_update).toBeNull();
    expect(clean.templatesPastedAt).not.toHaveProperty("made_up_template");
    // a non-string, non-null value keeps the base (null)
    expect(clean.templatesPastedAt.out_for_delivery).toBeNull();
  });

  it("layers over an existing stored value, not just the defaults", () => {
    const stored = sanitizeNotificationSettings({ delivery: { delivered: false } });
    const next = sanitizeNotificationSettings({ channels: { email: false } }, stored);
    expect(next.delivery.delivered).toBe(false); // survives from stored
    expect(next.channels.email).toBe(false); // new change lands
  });

  it("the defaults ship SMS off and no tap reminders", () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS.channels.sms).toBe(false);
    expect(DEFAULT_NOTIFICATION_SETTINGS).not.toHaveProperty("reminders");
    expect(TEMPLATE_KEYS).toEqual([
      "shipping_confirmation",
      "shipping_update",
      "out_for_delivery",
      "delivered",
    ]);
  });
});

describe("resolveShopFromTokenPayload — App Bridge tokens carry `dest`, not `shop`", () => {
  it("prefers an explicit shop claim", () => {
    expect(resolveShopFromTokenPayload({ shop: "a.myshopify.com" })).toBe("a.myshopify.com");
  });

  it("reads the App Bridge dest claim — the case the old route 404'd on", () => {
    expect(
      resolveShopFromTokenPayload({ dest: "https://sm-test-hhawzn52.myshopify.com" }),
    ).toBe("sm-test-hhawzn52.myshopify.com");
  });

  it("returns null rather than guessing", () => {
    expect(resolveShopFromTokenPayload({})).toBeNull();
    expect(resolveShopFromTokenPayload({ dest: "not a url" })).toBeNull();
  });
});
