// THE RITUALIST WITHOUT A PLAN (Sam, 2026-09-24: "make sure the ink app gets
// the buy button"; ink-backend #154). An install alone no longer includes the
// record: a store with the Ritualist installed and no active plan is priced by
// the backend like any ink store. The Ritualist never sells the record and
// never names ink's price — its row says the plan includes the record and links
// to Billing, instead of downloads the backend would refuse with 402.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { createMemoryRouter, RouterProvider } from "react-router";
import InkRecordDoor from "../components/InkRecordDoor";
import { recordNeedsRitualistPlan, RITUALIST_PLAN_SENTENCE, RITUALIST_BILLING_PATH } from "../lib/record-handover";
import { includedRecordDoor, ritualistDoorFor } from "../services/ritualist-rows.server";

const PROOF = "proof_" + "a".repeat(24);
const FOR_SALE = { whole: true, locked: false, forSale: { price_cents: 2900, currency: "USD" } };

function draw(el: React.ReactElement) {
  const router = createMemoryRouter([{ path: "/", element: <AppProvider i18n={en}>{el}</AppProvider> }]);
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe("the Ritualist's record on a store with no active plan", () => {
  it("a record the backend prices needs the plan; a free or bought one does not", () => {
    expect(recordNeedsRitualistPlan(FOR_SALE)).toBe(true);
    expect(recordNeedsRitualistPlan({ locked: true, price_cents: 2900, currency: "USD" })).toBe(true);
    expect(recordNeedsRitualistPlan({ locked: false, purchased: false, price_cents: 2900, currency: "USD" })).toBe(true);
    expect(recordNeedsRitualistPlan({ whole: true, locked: false, forSale: null })).toBe(false);
    expect(recordNeedsRitualistPlan({ locked: false, purchased: true })).toBe(false);
    expect(recordNeedsRitualistPlan(null)).toBe(false);
  });

  it("the row's door drops the downloads and says the plan includes the record", () => {
    const door = includedRecordDoor("ink_key_example", PROOF);
    expect(ritualistDoorFor(door, FOR_SALE)).toEqual({ ...door, downloadable: false, needsPlan: true });
    expect(ritualistDoorFor(door, { whole: true, locked: false, forSale: null })).toBe(door);
  });

  it("the door draws one line and a link to Billing — never a price, never a download", () => {
    const html = draw(<InkRecordDoor proofId={PROOF} door={ritualistDoorFor(includedRecordDoor("k", PROOF), FOR_SALE)} />);
    expect(html).toContain(RITUALIST_PLAN_SENTENCE);
    expect(html).toContain(`href="${RITUALIST_BILLING_PATH}"`);
    expect(html).not.toMatch(/\$29|Get the record|Download/);
  });
});
