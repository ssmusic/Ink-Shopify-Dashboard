// THE THREE DEFAULTS, PINNED. Each of these is a product decision, and each
// one has already been written down in more than one place once. If a reader
// and a writer ever disagree about "absent means on", a merchant's setting
// silently stops meaning what the screen says it means.
import { describe, it, expect } from "vitest";
import {
  SWITCH_FIELDS,
  readTrackingCardSwitches,
  trackingCardUpdatesFrom,
  brandedTrackingLinkEnabled,
  shippingNoticeEnabled,
  brandPageEmailEnabled,
} from "./tracking-card-switches";

describe("the defaults", () => {
  it("a merchant who has never opened this card gets the tracking link and Shopify's email, and no second email", () => {
    expect(readTrackingCardSwitches({})).toEqual({
      enabled: true,
      shopifyShippingEmail: true,
      brandPageEmail: false,
    });
    expect(readTrackingCardSwitches(undefined)).toEqual({
      enabled: true,
      shopifyShippingEmail: true,
      brandPageEmail: false,
    });
  });

  it("only an explicit false turns the two ON switches off", () => {
    expect(brandedTrackingLinkEnabled({ branded_tracking_link: false })).toBe(false);
    expect(shippingNoticeEnabled({ shopify_shipping_email: false })).toBe(false);
    // Anything that is not literally false is still on — a half-written doc
    // must not read as a refusal.
    expect(brandedTrackingLinkEnabled({ branded_tracking_link: null })).toBe(true);
    expect(shippingNoticeEnabled({ shopify_shipping_email: "no" })).toBe(true);
  });

  it("only an explicit true turns the OFF switch on", () => {
    expect(brandPageEmailEnabled({ brand_page_email: true })).toBe(true);
    expect(brandPageEmailEnabled({ brand_page_email: "yes" })).toBe(false);
    expect(brandPageEmailEnabled({ brand_page_email: 1 })).toBe(false);
  });
});

describe("what an untrusted body may move", () => {
  it("moves exactly the switches it names, under their Firestore names", () => {
    expect(trackingCardUpdatesFrom({ enabled: false })).toEqual({ branded_tracking_link: false });
    expect(trackingCardUpdatesFrom({ shopifyShippingEmail: false, brandPageEmail: true })).toEqual({
      [SWITCH_FIELDS.shopifyShippingEmail]: false,
      [SWITCH_FIELDS.brandPageEmail]: true,
    });
  });

  it("ignores everything else, including a truthy string", () => {
    expect(trackingCardUpdatesFrom({ enabled: "true", brand_page_email: true, admin: true })).toEqual({});
    expect(trackingCardUpdatesFrom(null)).toEqual({});
    expect(trackingCardUpdatesFrom("enabled")).toEqual({});
  });

  it("an empty result is how the route knows to answer 400 rather than report a save", () => {
    expect(Object.keys(trackingCardUpdatesFrom({}))).toHaveLength(0);
  });
});
