// The snippet's whole job is to survive the two things that broke the old one:
// a template with no fulfillment, and an enrollment that never happened.
import { describe, it, expect } from "vitest";
import { notificationSnippet, SNIPPET_TEMPLATES } from "./notification-snippet";

describe("the pasted Liquid cannot race the email", () => {
  it("reads the enrollment metafield, never the fulfillment", () => {
    const s = notificationSnippet("stevemadden");
    expect(s).toContain("order.metafields.ink.ink_token");
    // THE REGRESSION THIS FILE EXISTS FOR. `fulfillment.tracking_url` is
    // written ~600ms after Shopify composes the shipping email (#1020,
    // measured) and is blank forever on order confirmation.
    expect(s).not.toContain("fulfillment");
    expect(s).not.toContain("tracking_url");
  });

  it("reassigns the variable Shopify's own primary button reads", () => {
    // If this ever stops assigning `order_status_url`, the paste is decorative:
    // the button keeps pointing at Shopify and nobody finds out until a
    // merchant taps it.
    expect(notificationSnippet("stevemadden")).toContain(
      "{% assign order_status_url =",
    );
  });

  it("guards on a blank token so it can never break a button", () => {
    const s = notificationSnippet("stevemadden");
    expect(s).toContain("{% if ink_token != blank %}");
    expect(s.endsWith("{% endif %}")).toBe(true);
    // An order that predates the app, or whose enroll failed, must fall
    // through to whatever Shopify already set — today's behaviour, never a
    // dead link.
  });

  it("builds the brand's own host from the resolved slug", () => {
    expect(notificationSnippet("stevemadden")).toContain(
      '"https://stevemadden.in.ink/r/" | append: ink_token',
    );
  });

  it("falls back to www, never to a guessed host", () => {
    // The myshopify label (`sm-test-hhawzn52`) is the wrong-but-plausible
    // host that already shipped in the verify webhook. A neutral www URL
    // resolves for every brand; a guessed subdomain 404s while looking right.
    for (const blank of [undefined, null, "", "   "]) {
      expect(notificationSnippet(blank)).toContain('"https://www.in.ink/r/"');
    }
  });

  it("is a single line — it is pasted into a template's first line", () => {
    expect(notificationSnippet("stevemadden")).not.toContain("\n");
  });

  it("names order confirmation first, the template the old line could not serve", () => {
    expect(SNIPPET_TEMPLATES[0]).toBe("Order confirmation");
    expect(SNIPPET_TEMPLATES).toContain("Shipping confirmation");
  });
});
