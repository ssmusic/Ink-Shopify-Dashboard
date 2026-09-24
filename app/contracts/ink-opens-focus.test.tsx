// ONE OPEN, PICKED OUT ON THE MAP (Sam, 2026-09-23: "can each one of these have
// a map if you click on it also?"). In the order's accordion, each open in the
// list that carried a fix is a button: pressing it highlights that one open on
// the map above (the others dim and drop their distance labels) and pressing it
// again gives every open back. An open with no fix has nothing to highlight
// and stays a line of words. The Ritualist's screens do not draw this map.
//
// PARKED, 2026-09-23, then FOLDED IN: Sam chose Codex's screens as they were
// at 4022900, and the THE OPEN port (components/InkOpens.tsx) rebuilt the
// opens on Google's map as the record page's Every open table — each row opens
// onto ITS OWN map (the address, that one open, the dashed line and its
// distance, the guide rings), so a press picks one open out by giving it a map
// of its own. The three list cases below say that; the map's own two cases
// still run (the focus rule stays in components/OpensMap.tsx).
import { renderToString } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { describe, expect, it } from "vitest";
import OpensMap, { focusLook } from "../components/OpensMap";
import { EveryOpen, toggleRow } from "../components/InkOpens";
import { everyOpenRows } from "../lib/every-open";

const address = { lat: 34.052235, lng: -118.243683 };
const rows = everyOpenRows(
  [
    { at: "2026-09-01T05:00:00Z", outcome: "success", verdict: "pass", distance_m: 56, accuracy_m: 12, lat: 34.052701, lng: -118.243311 },
    { at: "2026-09-01T10:00:00Z", outcome: "success", verdict: "not_shared", distance_m: null, accuracy_m: null, lat: null, lng: null },
    { at: "2026-09-01T20:00:00Z", outcome: "success", verdict: "flagged", distance_m: 719, accuracy_m: 35, lat: 34.058123, lng: -118.250456 },
  ],
  null,
);
const render = (mapsKey: string | null, defaultOpen: number[] = []) =>
  renderToString(
    <AppProvider i18n={translations}>
      <EveryOpen rows={rows} address={address} mapsKey={mapsKey} defaultOpen={defaultOpen} />
    </AppProvider>,
  );
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("each open with a fix picks itself out on the map", () => {
  it("is a row with a closed control for every open; the one with a fix opens onto its own map, the fix-less one onto words", () => {
    const html = render("test-browser-key");
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Map of open 1"');
    expect(html).toContain('aria-label="Location of open 2"');
    expect(html).not.toContain('data-testid="opens-map"');
    const first = render("test-browser-key", [1]);
    expect(first).toMatch(/data-testid="opens-map"[^>]*data-points="1"/);
    expect(words(first)).toContain("Opened 56 m from the delivery address.");
    const second = render("test-browser-key", [2]);
    expect(second).not.toContain('data-testid="opens-map"');
    expect(words(second)).toContain("Location not shared.");
    // The opened row's tint survives the server render (no quoted value inside <style>).
    expect(html).toContain("tr[data-open=true]");
  });

  it("offers no map when none can be drawn (no browser key) — the words remain", () => {
    const html = render(null, [3]);
    expect(html).not.toContain('data-testid="opens-map"');
    expect(words(html)).toContain("Opened 719 m from the delivery address.");
  });

  it("a press opens a row; the same press closes it; another press opens another beside it", () => {
    const one = toggleRow(new Set(), 1);
    expect([...one]).toEqual([1]);
    expect([...toggleRow(one, 1)]).toEqual([]);
    expect([...toggleRow(one, 3)].sort()).toEqual([1, 3]);
  });

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
