// THE NOTIFICATIONS TAB SAYS WHAT EXISTS (audit 2026-09-25). The Ritualist's
// own buyer emails are tabled (FEATURE_NOTIFICATIONS off), so the tab says in
// one line that it sends none; the return window shows only where returns are
// on, and says why it is absent where they are off.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("../hooks/use-toast", () => ({ toast: vi.fn() }));
const tab = await import("../components/settings/CommunicationSettings");
const { FEATURE_NOTIFICATIONS } = await import("../flags");
const src = readFileSync(new URL("../components/settings/CommunicationSettings.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../routes/app.api.settings.notifications.tsx", import.meta.url), "utf8");

describe("the Ritualist's Notifications tab", () => {
  it("says it sends nothing of its own while the toggles are tabled", () => {
    expect(FEATURE_NOTIFICATIONS).toBe(false);
    expect(tab.NO_OWN_NOTIFICATIONS_LINE).toMatch(/sends no emails or texts of its own/);
    expect(src).toMatch(/!FEATURE_NOTIFICATIONS && \(/);
  });
  it("hides the return window where returns are off and says so", () => {
    expect(src).toMatch(/returnsOn === false \?/);
    expect(tab.RETURNS_OFF_LINE).toMatch(/Returns are off for this store/);
    expect(api).toMatch(/returnsOn = shopId \? backend\.return_enabled === true : null/);
  });
});
