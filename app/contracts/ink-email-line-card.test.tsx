// A CARD WITH NOTHING TO DO IS NOT DRAWN (2026-09-25): with no page address
// there is no line to paste and no way to set one, so Settings shows no
// "Your page in Shopify's emails" card at all.
import { renderToString } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { describe, expect, it } from "vitest";
import EmailLineCard from "../components/EmailLineCard";

const draw = (line: unknown) => renderToString(<AppProvider i18n={translations}><EmailLineCard line={line as never} /></AppProvider>);

describe("ink's email line card", () => {
  it("is not drawn without a line", () => {
    expect(draw({ snippet: null, emailDoor: null })).not.toContain("Shopify's emails");
    expect(draw(null)).not.toContain("Shopify's emails");
  });
  it("is drawn with a line", () => {
    expect(draw({ snippet: "{% assign x = 1 %}", emailDoor: null, templates: ["Shipping confirmation"] })).toContain("Your page in Shopify");
  });
});
