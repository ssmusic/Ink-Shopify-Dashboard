// ONE OPEN, PICKED OUT ON THE MAP (Sam, 2026-09-23: "can each one of these have
// a map if you click on it also?"). In the order's accordion, each open in the
// list that carried a fix is a button: pressing it highlights that one open on
// the map above (the others dim and drop their distance labels) and pressing it
// again gives every open back. An open with no fix has nothing to highlight
// and stays a line of words. The Ritualist's screens do not draw this map.
//
// PARKED, 2026-09-23: Sam chose Codex's screens as they were at 4022900, whose
// opens sit beside Codex's diagram (components/OpensDiagram.tsx), not this
// map. The list's three cases wait below as todos for the THE OPEN port, which
// rebuilds the opens on Google's map (feat/ink-order-the-open); the map's own
// two cases still run.
import { renderToString } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { describe, expect, it } from "vitest";
import OpensMap, { focusLook } from "../components/OpensMap";

const address = { lat: 34.052235, lng: -118.243683 };
describe("each open with a fix picks itself out on the map", () => {
  // Parked with the list (see the header): the THE OPEN port brings them back.
  it.todo("is a button, unpressed, for each open that carried a fix; the fix-less open stays words");
  it.todo("offers nothing to press when no map is drawn (no browser key)");
  it.todo("a press picks an open out; the same press again gives every open back; another press moves it");

  it("the map's rule: the picked open keeps its label and comes forward, the others dim and drop theirs", () => {
    const none = [focusLook(0, null), focusLook(1, null)];
    expect(none.every((l) => l.opacity === 1 && l.label)).toBe(true);
    const picked = focusLook(1, 1);
    const other = focusLook(0, 1);
    expect(picked).toMatchObject({ opacity: 1, label: true });
    expect(other.opacity).toBeLessThan(0.5);
    expect(other.label).toBe(false);
    expect(picked.z).toBeGreaterThan(none[0].z);
    expect(picked.z).toBeGreaterThan(other.z);
  });

  it("the map says which open is picked out", () => {
    const html = renderToString(<OpensMap apiKey="test-browser-key" address={address} opens={[{ lat: 34.0527, lng: -118.2433, distance_m: 56, label: "Open 1" }]} focus={0} />);
    expect(html).toMatch(/data-focus="0"/);
  });
});
