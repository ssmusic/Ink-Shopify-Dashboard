// HELP PROMISES NOTHING THE INSTALLED APP DOESN'T DO (audit 2026-09-25).
// The Ritualist sends no texts, has no notification settings to control, is
// not offering returns on a store until the merchant turns them on, and does
// not call a reviewer "a founding merchant". A reviewer reads Help as the
// app's own claims; each claim here must be something they can click and see.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const help = readFileSync(new URL("../routes/app.help.tsx", import.meta.url), "utf8");
// Only the page's own strings, not the comments explaining history.
const strings = [...help.matchAll(/"([^"\n]{12,})"/g)].map((m) => m[1]).join("\n");

describe("the Ritualist's Help", () => {
  it.each([
    [/\btexts?\b/i, "texts"],
    [/notifications? (are|is) controlled/i, "notification settings"],
    [/Settings → Notifications/, "a notifications tab"],
    [/start a return|QR code|no printer/i, "returns"],
    [/founding merchant|aren't billed|\bNothing\. You're/i, "a founding-merchant price"],
    [/pre-shipment photos/i, "photos"],
    [/that it arrived/i, "proof of arrival"],
  ])("never claims %s (%s)", (pattern) => {
    expect(strings).not.toMatch(pattern);
  });

  it("speaks in sentence case", () => {
    expect(help).toContain('title="Help & support"');
    expect(help).not.toContain("Frequently Asked Questions");
  });
});
