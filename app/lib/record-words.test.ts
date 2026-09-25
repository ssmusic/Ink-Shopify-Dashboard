// THE BROWSERS (2026-09-23) — the same line the record page prints
// (the-ritualist src/lib/audit-packet.ts browsersLine), pinned by the same
// fixtures (the-ritualist src/lib/audit-packet.browsers.test.ts).
import { describe, expect, it } from "vitest";
import { browsersLine, type RecordBrowser, type RecordBrowsers } from "./record-words";

const browser = (label: string, device: string | null, opens: number, after: boolean | null): RecordBrowser => ({
  label, device, opens, first_open_at: "2026-09-12T09:00:00.000Z", last_open_at: "2026-09-20T07:00:00.000Z", first_seen_after_delivered_scan: after,
});
const of = (list: RecordBrowser[], unknown = 0): RecordBrowsers => ({ count: list.length, unknown_opens: unknown, list });

describe("browsersLine — PLACEHOLDER copy", () => {
  it("how many, each one's device and opens, the opens no id came with, and the ones first seen after the delivered scan", () => {
    expect(browsersLine(of([browser("A", "iPhone", 4, false), browser("B", "Mac", 1, false), browser("C", "iPhone", 1, true)], 1)))
      .toBe("Opened from 3 browsers: iPhone ×4, Mac ×1, iPhone ×1, browser unknown ×1. The third was first seen after the carrier's delivered scan.");
  });

  it("several after the scan; all of them; the only one", () => {
    expect(browsersLine(of([browser("A", "iPhone", 18, false), browser("B", "Mac", 6, true), browser("C", "iPhone", 2, true)])))
      .toBe("Opened from 3 browsers: iPhone ×18, Mac ×6, iPhone ×2. The second and third were first seen after the carrier's delivered scan.");
    expect(browsersLine(of([browser("A", "iPhone", 2, true), browser("B", "Android", 1, true)])))
      .toBe("Opened from 2 browsers: iPhone ×2, Android ×1. All 2 were first seen after the carrier's delivered scan.");
    expect(browsersLine(of([browser("A", "iPhone", 3, true)])))
      .toBe("Opened from 1 browser: iPhone ×3. It was first seen after the carrier's delivered scan.");
  });

  it("none after the scan, or no scan yet: the count alone; a browser whose device is not known is 'a browser'", () => {
    expect(browsersLine(of([browser("A", "iPhone", 18, false), browser("B", "Mac", 6, null)]))).toBe("Opened from 2 browsers: iPhone ×18, Mac ×6.");
    expect(browsersLine(of([browser("A", null, 2, null)]))).toBe("Opened from 1 browser: a browser ×2.");
  });

  it("no browser counted — every open before the id, or none — says nothing", () => {
    expect(browsersLine(of([], 20))).toBeNull();
    expect(browsersLine(null)).toBeNull();
    expect(browsersLine(undefined)).toBeNull();
  });
});

describe("the level words (2026-09-23, Codex's screens restored)", () => {
  // Sam, 2026-09-24: "we cant confirm at door." The `verified` level was
  // "Verified by ink" — on the delivery place, the door. It reads as the
  // attested level; the level stays data on the record.
  it("are Codex's, as Sam chose them — an asserted element is never called unsigned, and nothing says a delivery was verified", async () => {
    const { LEVEL_WORDS } = await import("./record-words");
    expect(LEVEL_WORDS).toEqual({
      verified: "Recorded and signed",
      attested: "Recorded and signed",
      asserted: "Reported without an ink observation",
      missing: "Missing",
    });
    for (const w of Object.values(LEVEL_WORDS)) expect(w).not.toMatch(/unsigned/i);
  });
  // PARKED: Codex's words print a bare "ink"; Sam's "ink always has a period
  // after it" was said of the app's name. His word decides whether copy follows.
  it.todo("never a bare ink in the level words (Sam: \"ink always has a period after it\")");
});

// THE DELIVERY PLACE SAYS ITS NEAREST OPEN (Sam, 2026-09-24 01:10Z: "we cant
// confirm at door"). The row that said "Seen at the door: Yes/No" says the
// nearest open's distance, and where it stood against the carrier's scan only
// when the record's delivery date IS a carrier's scan (#145's rule).
describe("nearestOpenWords — the fact behind the door", () => {
  const record = (over: { source?: string | null; signed?: boolean; opens?: Array<Record<string, unknown>>; location?: Record<string, unknown> | null; delivered_at?: string | null; count?: number } = {}) => ({
    summary: { delivered_at: over.delivered_at === undefined ? "2026-09-13T12:00:00.000Z" : over.delivered_at, first_open_at: "2026-09-14T12:00:00.000Z", opens: over.count ?? (over.opens?.length ?? 1) },
    elements: [
      { element: "delivery_date", label: "Delivery date", status: "attested", value: { delivered_at: "2026-09-13T12:00:00.000Z", source: over.source === undefined ? "easypost" : over.source, signed: over.signed ?? false } },
      { element: "delivery_place", label: "Delivery place", status: "verified", value: { geocoded: true, verified_at_door: true } },
      { element: "the_open", label: "The open", status: "verified", value: over.location === null ? null : { location: over.location ?? { verdict: "flagged", distance_m: 2623 } } },
    ],
    locked: false,
    opens: (over.opens ?? []) as never,
  });

  it("the nearest person's open, after a carrier's scan", async () => {
    const { nearestOpenWords, nearestInputOf } = await import("./record-words");
    const r = record({ opens: [
      { event_id: "e1", at: "2026-09-14T12:00:00.000Z", verdict: "flagged", distance_m: 2623, outcome: null },
      { event_id: "e2", at: "2026-09-15T12:00:00.000Z", verdict: "pass", distance_m: 40, outcome: null },
      { event_id: "e3", at: "2026-09-15T13:00:00.000Z", verdict: "pass", distance_m: 3, outcome: "proxy" },
    ] });
    expect(nearestOpenWords(nearestInputOf(r))).toBe("Opened 40 m from the delivery address. After the carrier's scan.");
  });

  it("a delivery date from Shopify's fulfillment is no carrier's scan: the distance alone", async () => {
    const { nearestOpenWords, nearestInputOf } = await import("./record-words");
    expect(nearestOpenWords(nearestInputOf(record({ source: "merchant" })))).toBe("Opened 2.6 km from the delivery address.");
    // A signed scan counts whatever its source says.
    expect(nearestOpenWords(nearestInputOf(record({ source: "merchant", signed: true })))).toBe("Opened 2.6 km from the delivery address. After the carrier's scan.");
    // The backend's own word on the first open is said as it said it.
    expect(nearestOpenWords(nearestInputOf(record({ source: "merchant", location: { verdict: "pass", distance_m: 56, after_carrier_scan: false } })))).toBe("Opened 56 m from the delivery address. Before the carrier's scan.");
  });

  it("with no distance: whether a location was shared, else whether anyone opened", async () => {
    const { nearestOpenWords, nearestInputOf } = await import("./record-words");
    expect(nearestOpenWords(nearestInputOf(record({ location: { verdict: "imprecise", distance_m: null } })))).toBe("A location was shared, but no distance was stored.");
    expect(nearestOpenWords(nearestInputOf(record({ location: { verdict: "not_shared" } })))).toBe("Location not shared.");
    expect(nearestOpenWords(nearestInputOf(record({ location: null, count: 0 })))).toBe("No open on the record yet.");
  });

  it("never a verdict word, and never the door", async () => {
    const { nearestOpenWords, nearestInputOf } = await import("./record-words");
    expect(nearestOpenWords(nearestInputOf(record()))).not.toMatch(/\b(within|outside|beyond|near|pass|flagged|range|default)\b|door|confirm|verif/i);
  });
});
