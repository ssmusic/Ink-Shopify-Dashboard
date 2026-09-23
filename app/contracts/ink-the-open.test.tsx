// THE OPEN AND EVERY OPEN, IN INK'S ORDER ADVANCED (Sam, 2026-09-23: "look at
// what you added to the ritualist advanced site / so amazing / can you add it
// to the polaris ink app order details page?" · "we dont judge delivery so
// this is weird").
//
// The record page's open section, in Polaris (components/InkOpens.tsx):
//   · THE OPEN — the first open's distance as data, the 100 m and 300 m rings
//     as scale guides named only by their radius, the delivery address on
//     Google's map, the facts, the corroborating sentence;
//   · EVERY OPEN — # · time · location · device · browser · open · signed
//     event, each row opening onto its own map (the address, that open, the
//     dashed line and its distance, the rings).
// No badge, no range line, no colour for within; no coordinate printed as text.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import InkOpens, { EveryOpen, TheOpen, toggleRow } from "../components/InkOpens";
import { everyOpenRows, type DoorOpen, type RecordOpen } from "../lib/every-open";
import type { RecordRead } from "../lib/record-words";
import type { OrderTimelineData } from "../components/OrderTimeline";

vi.mock("../services/ink-api.server", () => ({ createRecordPurchase: vi.fn() }));
const { default: InkRecentOrders } = await import("../components/InkRecentOrders");

const text = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const JUDGED = /within|outside|beyond|\bnear\b|\bpass\b|flagged|range|default|Seen at the door/i;
const COORDINATE = /-?\d{1,3}\.\d{4,}/;
const GREEN = /16, ?185, ?129|#10b981|emerald|tone-success|bg-fill-success/i;
const KEY = "test-browser-key";

const address = { lat: 34.0837, lng: -118.3006 };
const signed = (over: Partial<RecordOpen>): RecordOpen => ({
  event_id: "event_208793febbc33922788a76e3",
  at: "2026-08-18T17:26:12.636Z",
  legacy: true,
  outcome: null,
  browser: "browser unknown",
  device: null,
  network: null,
  verdict: "flagged",
  distance_m: 2623,
  accuracy_m: 7.28,
  shared_later: false,
  share_event_id: null,
  check: "verified",
  ...over,
});
const door = (over: Partial<DoorOpen>): DoorOpen => ({
  at: "2026-08-18T17:26:12.636Z",
  outcome: "success",
  verdict: "flagged",
  distance_m: 2623,
  accuracy_m: 7.28,
  lat: 34.0905,
  lng: -118.2741,
  ...over,
});
// Alex Mill's record, as the door and the chain answer it (three opens: two
// that shared a location 2.6 km away, one later open that shared none) —
// with a scanner's visit added to pin its word.
const SIGNED = [
  signed({}),
  signed({ event_id: "event_6a5ca646a2ccd312d3d5dff3", at: "2026-08-18T18:14:59.423Z" }),
  signed({ event_id: "event_494306507281c23d23e309dc", at: "2026-09-13T05:04:15.234Z", verdict: "not_shared", distance_m: null, accuracy_m: null }),
  signed({ event_id: "event_0000000000000000000000aa", at: "2026-09-14T00:00:00.000Z", outcome: "proxy", verdict: null, distance_m: null, accuracy_m: null, browser: "browser A", device: "iPhone" }),
];
const DOOR = [
  door({}),
  door({ at: "2026-08-18T18:14:59.423Z" }),
  door({ at: "2026-09-13T05:04:15.234Z", verdict: "not_shared", distance_m: null, accuracy_m: null, lat: null, lng: null }),
];
const ROWS = everyOpenRows(DOOR, SIGNED);
const RECORD: RecordRead = {
  summary: { order_number: "INK-mspb6sg8-UXLK", opens: 4 },
  elements: [{ element: "the_open", label: "The open", status: "verified", value: { opens: 4, location: { verdict: "flagged", distance_m: 2623, accuracy_m: 7.28, signed: false } } }],
  locked: false,
  whole: true,
  events: [],
  checks: null,
  forSale: null,
  opens: SIGNED,
};
const TIMELINE: OrderTimelineData = { steps: [], address, opens: [], window: null, opensAvailable: true, opensCapped: false, rows: ROWS };
const ADDRESS = "4321 Melrose Ave, Los Angeles, CA, 90029, US";

const wrap = (node: React.ReactNode) => renderToString(<AppProvider i18n={translations}>{node}</AppProvider>);

// React warns that RouterProvider's useLayoutEffect does nothing on the
// server — true, and beside the point of a string render.
const realError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (String(args[0]).includes("useLayoutEffect does nothing on the server")) return;
    realError(...args);
  };
});
afterAll(() => {
  console.error = realError;
});

describe("THE OPEN — the buyer's device against the delivery address", () => {
  const html = wrap(<TheOpen record={RECORD} rows={ROWS} address={address} addressLabel={ADDRESS} mapsKey={KEY} />);
  const t = text(html);

  it("says the first open's distance as data, with the facts and what a location is and is not", () => {
    for (const part of [
      "The open · buyer's device ↔ delivery address",
      "Opened 2.6 km from the delivery address.",
      "the first open's location · pre-chain · event_208793febbc33922788a76e3",
      "Buyer's device",
      "location shared · ±7 m",
      "Delivery address",
      ADDRESS,
      "Distance",
      "2.6 km · the record's word",
      "A corroborating signal, not what confirms the open.",
    ])
      expect(t).toContain(part);
  });

  it("draws the rings as scale guides named only by their radius, the open at its bearing, and the address on Google's map with its rings", () => {
    const svg = html.match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? "";
    expect(svg).toContain('data-testid="the-open-rings"');
    expect(text(svg).trim().split(" ").join(" ")).toBe("300 m 100 m 2.6 km address open");
    expect(html).toMatch(/data-testid="opens-map"[^>]*data-points="0"[^>]*data-rings="100,300"/);
  });

  it("never judges: no badge, no range, no default, no colour for within, and no coordinate printed", () => {
    expect(t).not.toMatch(JUDGED);
    expect(html).not.toMatch(GREEN);
    expect(t).not.toMatch(COORDINATE);
    expect(t).not.toMatch(/Within range|Outside ·|Near ·|ink's default/);
  });

  it("says a location that was never shared, and an address never geocoded, in the record page's words", () => {
    const none = everyOpenRows([door({ verdict: "not_shared", distance_m: null, accuracy_m: null, lat: null, lng: null })], [signed({ verdict: "not_shared", distance_m: null, accuracy_m: null })]);
    const r = { ...RECORD, elements: [{ element: "the_open", label: "The open", status: "verified", value: { location: { verdict: "not_shared" } } }] };
    const words = text(wrap(<TheOpen record={r} rows={none} address={null} addressLabel={null} mapsKey={KEY} />));
    expect(words).toContain("No open shared a location, and the delivery address is not geocoded on this row.");
    expect(words).toContain("not recorded — the address was never geocoded");
    expect(words).toContain("location not shared");
    expect(words).toMatch(/Buyer's device not shared/);
    expect(words).not.toMatch(JUDGED);
  });
});

describe("EVERY OPEN — each open, each onto its own map", () => {
  const html = wrap(<EveryOpen rows={ROWS} address={address} mapsKey={KEY} available browsers="Opened from 1 browser: iPhone ×1, browser unknown ×3." recorded={4} />);
  const t = text(html);

  it("is the record page's table: # · time · location · device · browser · open · signed event", () => {
    const heads = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]).trim());
    expect(heads).toEqual(["#", "Time", "Location", "Device", "Browser", "Open", "Signed event", "Map"]);
    for (const part of [
      "Every open",
      "location shared · 2.6 km from the address",
      "not shared",
      "not recorded",
      "browser unknown",
      "browser A",
      "iPhone",
      "first open",
      "opened again",
      "not a person's — a link scanner's visit",
      "event_208793febbc33922788a76e3",
      "Signature verified",
      "Opened from 1 browser: iPhone ×1, browser unknown ×3.",
      "A shared device location does not confirm receipt of the parcel.",
    ])
      expect(t).toContain(part);
    expect(t).not.toMatch(JUDGED);
    expect(t).not.toMatch(COORDINATE);
  });

  it("gives every row a closed control that names its map, and draws no map until one is opened", () => {
    const controls = html.match(/<button[^>]*aria-expanded="(true|false)"[^>]*>/g) ?? [];
    expect(controls).toHaveLength(4);
    for (const c of controls) {
      expect(c).toContain('aria-expanded="false"');
      expect(c).toMatch(/aria-controls="[^"]+-open-\d"/);
    }
    expect(html).toMatch(/aria-label="Map of open 1"/);
    expect(html).toMatch(/aria-label="Location of open 3"/);
    expect(html).not.toContain('data-testid="opens-map"');
    // The opened row's tint survives the server render: a quoted value inside <style> dies as &quot;.
    expect(html).toContain("tr[data-open=true]");
  });

  it("opens a row onto its own map — the address, that open, the rings — with the distance as data", () => {
    const opened = wrap(<EveryOpen rows={ROWS} address={address} mapsKey={KEY} defaultOpen={[1]} />);
    expect(opened).toMatch(/data-testid="opens-map"[^>]*data-points="1"[^>]*data-rings="100,300"/);
    expect(text(opened)).toContain("Opened 2.6 km from the delivery address. Accuracy ±7 m.");
    expect(opened).toMatch(/aria-expanded="true"/);
  });

  it("opens a row that shared no location onto its words alone", () => {
    const opened = wrap(<EveryOpen rows={ROWS} address={address} mapsKey={KEY} defaultOpen={[3]} />);
    expect(opened).not.toContain('data-testid="opens-map"');
    expect(text(opened)).toContain("Location not shared.");
  });

  it("draws no map without the browser key — the words remain", () => {
    const opened = wrap(<EveryOpen rows={ROWS} address={address} mapsKey={null} defaultOpen={[1]} />);
    expect(opened).not.toContain('data-testid="opens-map"');
    expect(text(opened)).toContain("Opened 2.6 km from the delivery address. Accuracy ±7 m.");
  });

  it("a press opens a row; the same press closes it; the others keep their own state", () => {
    const one = toggleRow(new Set(), 1);
    expect([...one]).toEqual([1]);
    expect([...toggleRow(one, 2)].sort()).toEqual([1, 2]);
    expect([...toggleRow(one, 1)]).toEqual([]);
  });

  it("says a history the door did not answer, and an order with no open, plainly", () => {
    expect(text(wrap(<EveryOpen rows={[]} address={address} available recorded={0} />))).toContain("No open on the record yet.");
    const partial = text(wrap(<EveryOpen rows={ROWS.slice(0, 1)} address={address} available={false} recorded={4} />));
    expect(partial).toContain("Open history");
    expect(partial).toContain("The full open history is unavailable. Any details below come from the record.");
    expect(text(wrap(<EveryOpen rows={ROWS} address={address} available capped />))).toContain("The merchant service limited the open history returned for this order.");
  });
});

describe("mounted in the order's Advanced, both ways", () => {
  const detail = { id: "1", orderNumber: "#1012", customerName: "Made Up", customerEmail: "buyer@example.com", customerAddress: { address1: "4321 Melrose Ave", city: "Los Angeles", provinceCode: "CA", zip: "90029" }, date: "Aug 11, 2026", total: "58.00", subtotal: "58.00", currency: "USD", status: "enrolled", items: [], metafields: {} };
  const row = (record: RecordRead) => ({ id: "gid://shopify/Order/1", name: "#1012", proofId: "proof_1a7467ae50a0602ea76e5717", detail, record, door: { offerLine: null, downloadable: record.whole === true && !record.locked }, timeline: TIMELINE });
  const render = (record: RecordRead, mapsKey: string | null) => {
    const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <InkRecentOrders orders={[row(record) as never]} defaultExpandedId="gid://shopify/Order/1" mapsKey={mapsKey} /> }]);
    return wrap(<Stub initialEntries={["/"]} />);
  };

  it("shows THE OPEN and EVERY OPEN on a whole record, beside the inspection, with the address on Google's map", () => {
    const html = render(RECORD, KEY);
    const t = text(html);
    expect(t).toContain("Checked in this browser");
    expect(t).toContain("The open · buyer's device ↔ delivery address");
    expect(t.match(/Every open/g)).toHaveLength(1);
    expect(html).toMatch(/data-testid="opens-map"[^>]*data-rings="100,300"/);
    expect(t).not.toMatch(COORDINATE);
  });

  it("shows them on a record read as words only, too", () => {
    const t = text(render({ ...RECORD, locked: true, whole: undefined, opens: undefined }, null));
    expect(t).toContain("The open · buyer's device ↔ delivery address");
    expect(t).toContain("Opened 2.6 km from the delivery address.");
    expect(t).toContain("Every open");
  });

  it("opens a bought record in the Records library — no timeline — on the same section, from the record's signed opens", async () => {
    const { default: InkRecordInspection } = await import("../components/InkRecordInspection");
    const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <InkRecordInspection proofId="proof_1a7467ae50a0602ea76e5717" record={RECORD} mapsKey={KEY} /> }]);
    const t = text(wrap(<Stub initialEntries={["/"]} />));
    expect(t).toContain("The open · buyer's device ↔ delivery address");
    expect(t).toContain("Opened 2.6 km from the delivery address.");
    expect(t).toContain("event_6a5ca646a2ccd312d3d5dff3");
    expect(t).not.toMatch(JUDGED);
  });

  it("falls back to the record's own signed opens when the timeline carries no rows", () => {
    const t = text(wrap(<InkOpens record={RECORD} timeline={{ ...TIMELINE, rows: undefined, opensAvailable: false }} addressLabel={ADDRESS} mapsKey={null} />));
    expect(t).toContain("event_494306507281c23d23e309dc");
    expect(t).toContain("Open history");
  });
});
