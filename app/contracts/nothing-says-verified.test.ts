// NOTHING INK WRITES, SHOWS OR SENDS SAYS A DELIVERY WAS VERIFIED OR CONFIRMED
// (Sam, 2026-09-24 — shown the Ritualist's order tag, its metafield word, the
// green "Verified" badge, the "ink. Verified Delivery" carrier service, the
// buyer's "Delivery confirmed" email and text, and the landing's "confirmed
// underneath": "1. wrong 2. wrong 3. wrong 4. wrong").
//
// The replacements are PLACEHOLDER (lib/order-marks.ts and the files below);
// this contract pins only that the old words are never written again as
// code — a comment may still quote them for Sam.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
/** The source without its comments: a comment may quote an old word for Sam. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("the Ritualist's Shopify order marks", () => {
  it("enrolment writes no verdict tag", () => {
    expect(read("app/routes/webhooks.orders_create.ts")).not.toMatch(/tags:[^\n]*"INK-Verified-Delivery"/);
  });

  it("no writer stores 'verified' as the order's word", () => {
    expect(read("app/routes/api.verify.tsx")).not.toMatch(/value: "verified"/);
    expect(read("app/routes/ink.update.tsx")).toMatch(/value: storedStatusFor\(status\)/);
    expect(read("app/routes/webhooks.nfs.verify.tsx")).toMatch(/value: storedStatusFor\(status\)/);
  });

  it("no badge says 'Verified', and none is green for it", () => {
    const shipments = read("app/routes/app.tagged-shipments._index.tsx");
    expect(shipments).not.toMatch(/label: "Verified"/);
    expect(shipments).not.toMatch(/`Verified \(/);
    expect(shipments).not.toMatch(/tone: "success"/);
    expect(read("app/components/OrderDetailView.tsx")).not.toMatch(/"verified"\) return "success"/);
    expect(read("app/components/ui/lifecycle-badge.tsx")).not.toMatch(/ink-badge-success/);
  });
});

describe("what the buyer is sent", () => {
  it("the email says nothing was confirmed", () => {
    const email = read("app/services/email.server.ts");
    expect(email).not.toMatch(/"On its way" : "Delivery confirmed"/);
    expect(email).not.toMatch(/"With the carrier" : "Confirmed on arrival"/);
    expect(email).not.toMatch(/has arrived\. Delivery confirmed/);
  });
});

describe("what the merchant and a visitor read", () => {
  it("the notification toggle is not named 'Delivery confirmed'", () => {
    expect(read("app/components/settings/CommunicationSettings.tsx")).not.toMatch(/title="Delivery confirmed"/);
  });

  it("the landing's line says no delivery is confirmed", () => {
    const sub = read("app/components/LandingPageContent.tsx").match(/\bsub = "([^"]*)"/)?.[1];
    expect(sub).toBeTruthy();
    expect(sub).not.toMatch(/confirm|verif/i);
  });

  it("the delivery-outcome badges never say 'Unconfirmed'", () => {
    expect(read("app/components/AdvancedAnalytics.tsx")).toMatch(/UNCONFIRMED: "Pending"/);
  });
});

// THE WORDS SWEEP (2026-09-24): verified · confirmed · pass · near · outside,
// through every Ritualist screen a merchant can open. The words that stay are
// not about a delivery: a signature that verifies against ink's published key
// (VerifiableRecordCard.tsx, as ink's own record words say it), Shopify's own
// "Order confirmation" and "Shipping confirmation" emails, and the old tags and
// shipping titles the readers still recognise on old orders.
describe("what the Ritualist's own screens say", () => {
  it("no page draws the distance thresholds that auto-verified a delivery, and the file stays", () => {
    // Changed on purpose: this pinned the Advanced settings page's one line.
    // Sam, 2026-09-24, on that line: "get rid of that" — the page is gone.
    expect(existsSync(resolve(process.cwd(), "app/routes/app.settings_.advanced.tsx"))).toBe(false);
    expect(read("app/components/settings/VerificationSettings.tsx")).toMatch(/const VerificationSettings/);
    const files = (function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
      );
    })(resolve(process.cwd(), "app"));
    const drawers = files.filter((f) => !f.endsWith("VerificationSettings.tsx") && !/\.test\.tsx?$/.test(f) && /<VerificationSettings\b/.test(readFileSync(f, "utf8")));
    expect(drawers).toEqual([]);
  });

  it("the Delivered notification follows a carrier scan, never a carrier's confirmation", () => {
    const settings = code("app/components/settings/CommunicationSettings.tsx");
    expect(settings).not.toMatch(/carrier confirms delivery/);
    expect(settings).toMatch(/description="Sent when a carrier scan shows the package is delivered\./);
  });

  it("Help says the record holds the carrier scan, not a delivery confirmation", () => {
    const help = code("app/routes/app.help.tsx");
    expect(help).not.toMatch(/delivery confirmation/i);
    expect(help).toMatch(/"The carrier scan, timestamps, and/);
  });

  it("the order page draws no status green and claims no email it cannot see", () => {
    const page = code("app/routes/app.orders.$orderId.tsx");
    expect(page).not.toMatch(/"verified"\) return "success"/);
    expect(page).not.toMatch(/Confirmation sent/);
  });
});
