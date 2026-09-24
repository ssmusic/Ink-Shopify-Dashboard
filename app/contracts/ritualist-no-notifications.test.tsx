// THE RITUALIST PROMISES NO NOTIFICATION IT DOES NOT SEND (Sam, 2026-09-24:
// "we dont have notifacations yet"; nothing schedules api.jobs.notifications).
// While FEATURE_NOTIFICATIONS (app/flags.ts) is off, Settings › Notifications
// offers only what is real — the line that puts the page in Shopify's own
// emails, and the return window — and no email channel or delivery message of
// the Ritualist's own. The Dashboard draws neither the set-up card nor the
// Communications card (ritualist-dashboard.test.tsx). Flipping the switch is
// a decision; this test changes with it, on purpose.
import { renderToString } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { describe, expect, it } from "vitest";
import { FEATURE_NOTIFICATIONS } from "../flags";
import CommunicationSettings from "../components/settings/CommunicationSettings";

const text = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");

describe("Settings › Notifications, while the Ritualist sends none", () => {
  it("the Ritualist's own notifications are switched off", () => {
    expect(FEATURE_NOTIFICATIONS).toBe(false);
  });

  it("offers Shopify's own emails and the return window, and no send of its own", () => {
    const t = text(
      renderToString(
        <AppProvider i18n={translations}>
          <CommunicationSettings shopDomain="made-up-shop.myshopify.com" />
        </AppProvider>,
      ),
    );
    for (const part of ["Your page in Shopify's emails", "Copy the line", "Return Window"]) expect(t).toContain(part);
    for (const gone of [
      "Notification Channel",
      "Send notifications by email.",
      "Delivery Notifications",
      // "Out for delivery" and "Delivered" stay: they are Shopify's own email
      // templates, listed in the real section. What goes is the Ritualist's send.
      "Sent when a carrier scan shows the package is out for delivery.",
      "Sent when a carrier scan shows the package is delivered.",
      "Sent after the customer opens their page.",
    ])
      expect(t).not.toContain(gone);
  });
});
