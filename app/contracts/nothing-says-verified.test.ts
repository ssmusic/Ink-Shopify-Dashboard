// NOTHING INK WRITES, SHOWS OR SENDS SAYS A DELIVERY WAS VERIFIED OR CONFIRMED
// (Sam, 2026-09-24 — shown the Ritualist's order tag, its metafield word, the
// green "Verified" badge, the "ink. Verified Delivery" carrier service, the
// buyer's "Delivery confirmed" email and text, and the landing's "confirmed
// underneath": "1. wrong 2. wrong 3. wrong 4. wrong").
//
// The replacements are PLACEHOLDER (lib/order-marks.ts and the files below);
// this contract pins only that the old words are never written again as
// code — a comment may still quote them for Sam.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

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
