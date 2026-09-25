import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { expect, it } from "vitest";
import { PrivacyRequestsCard } from "../components/InkSettingsView";

it("shows completed customer erasure as completed, not in progress", () => {
  const html = renderToStaticMarkup(
    <AppProvider i18n={translations}>
      <PrivacyRequestsCard
        action="/app/ink/settings"
        privacy={[{
          id: "receipt",
          requestId: null,
          topic: "customers/redact",
          receivedAt: "2026-09-25T18:23:59.030Z",
          dueAt: "2026-10-25T18:23:59.030Z",
          state: "completed",
        }]}
      />
    </AppProvider>,
  );
  expect(html).toContain("Deletion request. Completed.");
  expect(html).not.toContain("In progress");
  expect(html).toContain("this app holds");
  expect(html).not.toContain("what ink holds");
});
