// THE RITUALIST'S PRIVACY DOORS ARE INK'S (2026-09-25, Sam: "what we did for
// ink needs to be done for the ritualist"). Every compliance webhook takes the
// hardened path: persist, then answer; 503 on a failed backend, never 200 for
// work not done; a data request answered from Settings with the file.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("the compliance webhooks, both apps", () => {
  it.each([
    ["../routes/webhooks.customers.data_request.tsx", "data_request"],
    ["../routes/webhooks.customers.redact.tsx", "redact"],
    ["../routes/webhooks.shop.redact.tsx", "shop"],
  ])("%s answers through handleInkPrivacy for every flavor", (file, topic) => {
    const src = read(file);
    expect(src).toContain(`handleInkPrivacy("${topic}", shop, payload)`);
    expect(src).not.toMatch(/isInk\(\)/);
    expect(src).not.toMatch(/status: 200 \}\);\s*\}\s*\n\s*console\.error/);
  });
  it("asks the backend to erase custody events for both apps", () => {
    expect(read("../services/ink-api.server.ts")).toContain("include_custody: true,");
    expect(read("../services/ink-api.server.ts")).not.toContain("isInk() ? { include_custody: true }");
  });
  it("the Ritualist's Settings lists the requests and answers the download", () => {
    expect(read("../routes/app.settings.tsx")).toMatch(/readPrivacyRequests\(session\.shop\)/);
    expect(read("../routes/app.settings.tsx")).toMatch(/intent"\) === "privacy_export"/);
    expect(read("../components/settings/AccountSettings.tsx")).toContain('<PrivacyRequestsCard privacy={shopData?.privacy} action="/app/settings" />');
  });
  it("a shop/redact with the other app still installed erases only this app's own charges", () => {
    expect(read("../services/ink-privacy.server.ts")).toContain('eraseWhere(isInk() ? "ink_record_charges" : "record_charges", shop)');
  });
});
