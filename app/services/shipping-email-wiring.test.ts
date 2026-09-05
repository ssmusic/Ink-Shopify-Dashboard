// THE WIRING, PINNED TO THE SOURCE.
//
// Both services here are correct in isolation and worth nothing unless the
// webhook actually calls them, at the right moment, on both paths. A unit test
// cannot see a call site that was never written — the sibling repo's 2026-07-20
// outage was a correct change with every gate green, because every gate asked
// about code shape and none asked whether the product still worked.
//
// So these read the files that ship and assert the seams that make the promise:
//  · the notify decision rides the rewrite that sets the URL, not a second call
//  · BOTH fulfilment paths are wired, or the 3PL population is silently excluded
//  · our ask is stamped the moment Shopify accepts it
//  · the brand's email fires only in the case it exists for
//  · the merchant can actually see both switches on the card
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const CREATE = read("app/routes/webhooks.fulfillments_create.tsx");
const UPDATE = read("app/routes/webhooks.fulfillments_update.tsx");
const CARD = read("app/components/settings/DeliveryModeSettings.tsx");
const ROUTE = read("app/routes/app.api.settings.branded-tracking-link.tsx");
const LINK = read("app/services/branded-tracking-link.server.ts");

describe.each([
  ["fulfillments/create", CREATE],
  ["fulfillments/update", UPDATE],
])("%s", (_name, src) => {
  it("hands the rewrite a decider instead of a hardcoded flag", () => {
    expect(src).toContain("decideShopifyShippingNotice");
    expect(src).toMatch(/shouldNotifyCustomer:\s*async \(\) => \(await decideOnce\(\)\)\.notifyCustomer/);
  });

  it("reads the timeline at most once per event", () => {
    // Two callers, one answer: the rewrite's decider and the brand email below
    // it both go through decideOnce.
    expect(src.match(/decideShopifyShippingNotice\(/g)?.length).toBe(1);
    expect(src.match(/decideOnce\(\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("stamps our ask as soon as Shopify accepts it", () => {
    expect(src).toContain("stampShippingNotice");
    expect(src).toMatch(/if \(branded\.notifiedCustomer\)/);
  });

  it("sends the brand's own email ONLY when Shopify already emailed this buyer", () => {
    expect(src).toContain("sendBrandPageEmailOnce");
    expect(src).toMatch(/verdict\.decision === "skipped_already_sent_by_shopify"/);
  });

  it("costs a merchant who never turned the second email on absolutely nothing", () => {
    expect(src).toMatch(/brandPageEmailEnabled\((merchantHit|hit)\?\.data \?\? \{\}\) &&/);
  });
});

describe("the rewrite itself", () => {
  it("still defaults to silence — no decider means notifyCustomer:false", () => {
    expect(LINK).toContain("let notifyCustomer = false;");
    expect(LINK).toMatch(/if \(shouldNotifyCustomer\) \{/);
    // The flag passed to Shopify is the decided variable, never a literal.
    expect(LINK).toMatch(/variables: \{[\s\S]*?notifyCustomer,\n/);
  });

  it("treats a decider that threw as a no", () => {
    // Read the decider block itself rather than counting characters: a pin
    // that measures distance goes red the next time somebody adds a line.
    const start = LINK.indexOf("if (shouldNotifyCustomer) {");
    const block = LINK.slice(start, LINK.indexOf("admin.graphql(MUTATION", start));
    expect(start).toBeGreaterThan(0);
    expect(block).toContain("(await shouldNotifyCustomer()) === true");
    expect(block).toContain("catch (e)");
    expect(block).toContain("notifyCustomer = false;");
  });
});

describe("what the merchant sees", () => {
  it("the tracking-link card carries both switches, and no new card was added", () => {
    expect(CARD).toContain('id="ink-shopify-shipping-email"');
    expect(CARD).toContain('id="ink-brand-page-email"');
    // Two annotated sections, exactly as before: Delivery mode and Tracking link.
    expect(CARD.match(/<Layout\.AnnotatedSection/g)).toHaveLength(2);
  });

  it("the second switch names the merchant's own brand", () => {
    expect(CARD).toContain("Email the page from ${brand}");
  });

  it("one endpoint serves all three switches", () => {
    expect(ROUTE).toContain("readTrackingCardSwitches");
    expect(ROUTE).toContain("trackingCardUpdatesFrom");
    // A body naming nothing we know is a refusal in words, not a quiet no-op.
    expect(ROUTE).toMatch(/Object\.keys\(updates\)\.length === 0/);
  });
});
