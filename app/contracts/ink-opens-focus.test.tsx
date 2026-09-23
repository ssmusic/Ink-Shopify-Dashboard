// ONE OPEN, PICKED OUT ON THE MAP (Sam, 2026-09-23: "can each one of these have
// a map if you click on it also?"). In the order's accordion, each open in the
// list that carried a fix is a button: pressing it highlights that one open on
// the map above (the others dim and drop their distance labels) and pressing it
// again gives every open back. An open with no fix has nothing to highlight
// and stays a line of words. The Ritualist's screens do not draw this map.
import { renderToString } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { describe, expect, it } from "vitest";
import { OpensAgainstAddress, nextFocus } from "../components/OrderTimeline";
import OpensMap, { focusLook } from "../components/OpensMap";

const address = { lat: 34.052235, lng: -118.243683 };
const opens = [
  { at: "2026-09-01T05:00:00Z", verdict: "pass", distance_m: 56, accuracy_m: 12, lat: 34.052701, lng: -118.243311 },
  { at: "2026-09-01T10:00:00Z", verdict: "not_shared", distance_m: null, accuracy_m: null, lat: null, lng: null },
  { at: "2026-09-01T20:00:00Z", verdict: "flagged", distance_m: 719, accuracy_m: 35, lat: 34.058123, lng: -118.250456 },
];
const render = (mapsKey: string | null) =>
  renderToString(
    <AppProvider i18n={translations}>
      <OpensAgainstAddress address={address} opens={opens} mapsKey={mapsKey} />
    </AppProvider>,
  );
const buttons = (html: string) => html.match(/<button[^>]*aria-pressed="(true|false)"[^>]*>[\s\S]*?<\/button>/g) ?? [];
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("each open with a fix picks itself out on the map", () => {
  it("is a button, unpressed, for each open that carried a fix; the fix-less open stays words", () => {
    const html = render("test-browser-key");
    const pressable = buttons(html);
    expect(pressable).toHaveLength(2);
    for (const b of pressable) expect(b).toContain('aria-pressed="false"');
    const [first = "", third = ""] = pressable;
    expect(words(first)).toContain("Open 1");
    expect(words(first)).toContain("56 m");
    expect(words(third)).toContain("Open 3");
    expect(words(third)).toContain("719 m");
    // The open with no fix: in the list, never a button.
    expect(words(html)).toContain("location not shared");
    for (const b of pressable) expect(words(b)).not.toContain("location not shared");
    // The pressed tint survives the server render: a quoted attribute value
    // inside <style> comes out as &quot; and the rule is dropped.
    expect(html).toContain("button.ink-open-row[aria-pressed=true]");
    // The map starts with no open picked out.
    expect(html).toMatch(/data-testid="opens-map"[^>]*data-focus=""|data-focus=""[^>]*data-testid="opens-map"/);
  });

  it("offers nothing to press when no map is drawn (no browser key)", () => {
    const html = render(null);
    expect(buttons(html)).toHaveLength(0);
    expect(html).not.toContain('data-testid="opens-map"');
    expect(words(html)).toContain("719 m");
  });

  it("a press picks an open out; the same press again gives every open back; another press moves it", () => {
    expect(nextFocus(null, 1)).toBe(1);
    expect(nextFocus(1, 1)).toBeNull();
    expect(nextFocus(1, 0)).toBe(0);
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
