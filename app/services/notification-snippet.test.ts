// The snippet's whole job is to survive the thing that killed both earlier
// versions: the email is composed BEFORE any of our data exists. So the line
// may only read a Shopify fact, and must resolve to ours at click time.
import { describe, it, expect } from "vitest";
import { notificationSnippet, SNIPPET_TEMPLATES } from "./notification-snippet";

describe("the pasted Liquid cannot lose the compose race", () => {
  it("reads order_number — a fact Shopify has before we do", () => {
    expect(notificationSnippet("stevemadden")).toContain("| append: order_number");
  });

  it("never reads anything we write", () => {
    const s = notificationSnippet("stevemadden");
    // ATTEMPT 1: written ~600ms after the shipping email is composed (#1020),
    // and blank forever on order confirmation.
    expect(s).not.toContain("fulfillment");
    expect(s).not.toContain("tracking_url");
    // ATTEMPT 2: written five seconds after the confirmation email is
    // composed (#1021). Both shipped; both were dead on arrival.
    expect(s).not.toContain("metafields");
    expect(s).not.toContain("ink_token");
  });

  it("points at the order door, not straight at a token", () => {
    // /r/{token} would require knowing the token at compose time — the exact
    // impossibility above. /o/{number} defers the lookup to the tap.
    const s = notificationSnippet("stevemadden");
    expect(s).toContain('"https://stevemadden.in.ink/o/"');
    expect(s).not.toContain(".in.ink/r/");
  });

  it("reassigns the variable Shopify's own primary button reads", () => {
    // Verified live on order #1023: with this assigned, the confirmation
    // email's "View your order" opened the buyer's page.
    expect(notificationSnippet("stevemadden")).toContain(
      "{% assign order_status_url =",
    );
  });

  it("falls back to www, never to a guessed host", () => {
    // The myshopify label (`sm-test-hhawzn52`) is the wrong-but-plausible host
    // already shipped once in the verify webhook. www resolves for every
    // brand; a guessed subdomain 404s while looking right.
    for (const blank of [undefined, null, "", "   "]) {
      expect(notificationSnippet(blank)).toContain('"https://www.in.ink/o/"');
    }
  });

  it("is a single line — it is pasted at the top of a template", () => {
    expect(notificationSnippet("stevemadden")).not.toContain("\n");
  });

  it("names all five templates, order confirmation first", () => {
    expect(SNIPPET_TEMPLATES[0]).toBe("Order confirmation");
    expect(SNIPPET_TEMPLATES).toHaveLength(5);
  });
});
