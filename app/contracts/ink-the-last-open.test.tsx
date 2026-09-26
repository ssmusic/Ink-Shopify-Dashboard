// THE LAST OPEN LEADS INK'S OPEN SECTION (Sam, 2026-09-24, on the console's
// Interaction Timeline for a coarse open half a world away: "i really dont need a
// delivery address as much as i need a tap address. the interaction timeline
// should have a smaller delivery add and last tap address … make sure it
// persists to the thin clients in the ritualist and ink shopify app").
//
// Pinned here:
//   · the loader reads the opens door's `last_open` (ink-backend #142), else
//     the proof door's; neither door carrying it keeps THE OPEN;
//   · THE LAST OPEN says the distance with its accuracy, the place in words,
//     the moment and device, draws its map, and puts the delivery address in
//     a small block beside it (its own map and its words); the first open's
//     own word follows in one line;
//   · no coordinate is printed, nothing judged.
import { renderToString } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { describe, expect, it } from "vitest";
import InkOpens, { TheLastOpen } from "../components/InkOpens";
import { everyOpenRows, type DoorOpen, type RecordOpen } from "../lib/every-open";
import { lastOpenFrom, lastOpenSentence, readLastOpen } from "../lib/last-open";
import type { RecordRead } from "../lib/record-words";
import { timelineFrom } from "../services/ink-timeline.server";

const text = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const JUDGED = /within|outside|beyond|\bnear\b|\bpass\b|flagged|imprecise|range|default|verified|confirmed/i;
const COORDINATE = /-?\d{1,3}\.\d{3,}, ?-?\d{1,3}\.\d{3,}|114\.1\b|22\.5\b|-97\.75/;
const wrap = (node: React.ReactNode) => renderToString(<AppProvider i18n={translations}>{node}</AppProvider>);

// Made-up points and words (this repository is public); the door's distance
// and accuracy are a coarse open's, 13,227 km away and 7.6 km wide.
const HOME = { lat: 30.25, lng: -97.75 };
const LAST = {
  at: "2026-09-24T02:21:26.082Z",
  lat: 22.5,
  lng: 114.1,
  accuracy_m: 7578,
  distance_m: 13226984,
  device: "Windows",
  address_words: "Example District, Example City, Example Province, China",
};
const ADDRESS = "100 Example St, Austin, TX, 78704, US";

const signedFirst: RecordOpen = {
  event_id: "event_000000000000000000a10271", at: "2026-09-13T05:04:15.267Z", legacy: false, outcome: null, browser: "browser unknown",
  device: null, network: null, verdict: "not_shared", distance_m: null, accuracy_m: null, shared_later: false, share_event_id: null, check: "verified",
};
const doorRow = (over: Partial<DoorOpen>): DoorOpen => ({ at: "2026-09-13T05:04:15.267Z", outcome: "success", verdict: "not_shared", distance_m: null, accuracy_m: null, lat: null, lng: null, device: "Mac", browser: null, kind: "first", ...over });
const DOOR = [
  doorRow({}),
  doorRow({ at: LAST.at, outcome: "duplicate", verdict: "imprecise", distance_m: LAST.distance_m, accuracy_m: LAST.accuracy_m, lat: LAST.lat, lng: LAST.lng, device: "Windows", browser: "B", kind: "again" }),
];
const ROWS = everyOpenRows(DOOR, [signedFirst]);
const RECORD: RecordRead = {
  summary: { order_number: "1042", opens: 27 },
  elements: [{ element: "the_open", label: "The open", status: "verified", value: { opens: 27, location: { verdict: "not_shared", distance_m: null, accuracy_m: null, signed: false } } }],
  locked: false,
  whole: true,
  events: [],
  checks: null,
  forSale: null,
  opens: [signedFirst],
};

describe("the last open, read from the doors", () => {
  it("reads the opens door's field, else the proof door's; neither is undefined; none is null", () => {
    expect(readLastOpen({ last_open: LAST })).toMatchObject({ point: { lat: LAST.lat, lng: LAST.lng }, distance_m: LAST.distance_m, device: "Windows" });
    expect(lastOpenFrom({ opens: [] }, { last_open: LAST })?.address_words).toBe(LAST.address_words);
    expect(lastOpenFrom({ opens: [] }, {})).toBeUndefined();
    expect(lastOpenFrom({ last_open: null }, { last_open: LAST })).toBeNull();
    // Only a known device word, never a user agent; never Null Island.
    expect(readLastOpen({ last_open: { ...LAST, device: "Mozilla/5.0", lat: 0, lng: 0 } })).toMatchObject({ device: null, point: null });
  });

  it("the timeline carries it, and says it in the record's sentence", () => {
    const t = timelineFrom({ proof_id: "proof_000000000000000000a10271", shipping_geocode_lat: HOME.lat, shipping_geocode_lng: HOME.lng }, { proof_id: "proof_000000000000000000a10271", address: HOME, opens: [], capped: false, last_open: LAST });
    expect(t?.lastOpen).toMatchObject({ distance_m: LAST.distance_m, accuracy_m: LAST.accuracy_m });
    expect(lastOpenSentence(t!.lastOpen!)).toBe("Opened 13,227 km from the delivery address. Accuracy ±7.6 km.");
    const before = timelineFrom({ proof_id: "proof_000000000000000000a10271" }, { opens: [] });
    expect(before && "lastOpen" in before).toBe(false);
  });
});

describe("THE LAST OPEN — the tap's address leads, the delivery address small", () => {
  const html = wrap(<TheLastOpen record={RECORD} rows={ROWS} address={HOME} addressLabel={ADDRESS} lastOpen={readLastOpen({ last_open: LAST })!} />);
  const t = text(html);

  it("says the last open's distance with its accuracy, its place, its moment and device, and the first open's own word", () => {
    for (const part of [
      "The last open",
      "Opened 13,227 km from the delivery address. Accuracy ±7.6 km.",
      LAST.address_words,
      "· Windows",
      "Delivery address",
      ADDRESS,
      "The first open: Location not shared.",
      "The record contains a browser-reported page open.",
    ])
      expect(t).toContain(part);
  });

  it("draws the last open's map and the delivery address's own small map", () => {
    expect(html).toContain('aria-label="Map: last open and the delivery address"');
    expect(html).toContain('aria-label="Map: the delivery address"');
    expect(html).toContain('data-testid="delivery-address-block"');
    // THE OPEN's rings diagram is not this block's.
    expect(html).not.toContain('data-testid="the-open-rings"');
  });

  it("never judges, and never prints a coordinate", () => {
    expect(t).not.toMatch(JUDGED);
    expect(t).not.toMatch(COORDINATE);
  });

  it("a last open with no point: its words and moment, no map of it, the delivery address still beside", () => {
    const bare = wrap(<TheLastOpen record={RECORD} rows={ROWS} address={HOME} addressLabel={ADDRESS} lastOpen={readLastOpen({ last_open: { ...LAST, lat: null, lng: null, distance_m: null, accuracy_m: null, address_words: null } })!} />);
    expect(text(bare)).toContain("Location not shared.");
    expect(bare).not.toContain("Map: last open");
    expect(bare).toContain('aria-label="Map: the delivery address"');
  });

  it("never opened: the door served none", () => {
    expect(text(wrap(<TheLastOpen record={RECORD} rows={[]} address={HOME} addressLabel={ADDRESS} lastOpen={null} />))).toContain("No open on the record yet.");
  });
});

describe("InkOpens picks the block from the doors", () => {
  const timeline = { steps: [], address: HOME, opens: [], window: null, opensAvailable: true, opensCapped: false, rows: ROWS };

  it("leads with THE LAST OPEN when the door served it", () => {
    const html = wrap(<InkOpens record={RECORD} timeline={{ ...timeline, lastOpen: readLastOpen({ last_open: LAST }) }} addressLabel={ADDRESS} />);
    expect(html).toContain('data-testid="the-last-open"');
    expect(html).not.toContain('data-testid="the-open"');
    // Every open still lists every open; the coarse one says its distance.
    expect(text(html)).toContain("location shared · 13,227 km from the address");
  });

  it("keeps THE OPEN when no door carried the field", () => {
    const html = wrap(<InkOpens record={RECORD} timeline={timeline} addressLabel={ADDRESS} />);
    expect(html).toContain('data-testid="the-open"');
    expect(html).not.toContain('data-testid="the-last-open"');
  });
});

// A RECORD WITHOUT A DELIVERY POINT (Sam, 2026-09-24, on #TOWELS: "also is
// this a problem"): the delivery address's block names the fact the record
// carries (summary.address_state, lib/delivery-point.ts) — never "never
// geocoded" on an order that has no shipping address at all.
describe("THE LAST OPEN — a record without a delivery point", () => {
  const saying = (word: "none" | "ungeocoded"): RecordRead => ({ ...RECORD, summary: { ...RECORD.summary, address_state: word } });
  const last = readLastOpen({ last_open: { ...LAST, distance_m: null } })!;

  it("no shipping address: the block says so, and the last open is drawn alone", () => {
    const html = wrap(<TheLastOpen record={saying("none")} rows={ROWS} address={null} addressLabel={null} lastOpen={last} />);
    const t = text(html);
    expect(t).toContain("Delivery address No shipping address on this order.");
    expect(t).not.toMatch(/geocod/i);
    expect(html).toMatch(/data-testid="open-map"[^>]*data-address="absent"/);
    expect(t).not.toMatch(COORDINATE);
  });

  it("an address with no map point yet says that", () => {
    const t = text(wrap(<TheLastOpen record={saying("ungeocoded")} rows={ROWS} address={null} addressLabel={null} lastOpen={last} />));
    expect(t).toContain("Delivery address The address is on file but has no map point yet.");
  });

  it("a record that does not say keeps the old line", () => {
    const t = text(wrap(<TheLastOpen record={RECORD} rows={ROWS} address={null} addressLabel={null} lastOpen={last} />));
    expect(t).toContain("not recorded — the address was never geocoded");
  });
});
