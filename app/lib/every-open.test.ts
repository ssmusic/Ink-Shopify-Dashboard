// THE OPEN AND EVERY OPEN — the rules and the words (lib/every-open.ts).
// Sam, 2026-09-23: "we dont judge delivery so this is weird." A distance is
// data; the rings are scale guides named only by their radius.
import { describe, expect, it } from "vitest";
import {
  KIND_WORDS,
  accuracyWords,
  browserCell,
  deviceCell,
  deviceFact,
  distanceFact,
  everyOpenRows,
  locationCell,
  ringsGeometry,
  rowCaption,
  signatureCell,
  theOpenEventLine,
  theOpenReading,
  type DoorOpen,
  type EveryOpenRow,
  type RecordOpen,
} from "./every-open";

const JUDGED = /within|outside|beyond|\bnear\b|\bpass\b|flagged|range|default|seen at the door|confirmed/i;

const signed = (over: Partial<RecordOpen>): RecordOpen => ({
  event_id: "event_aaaaaaaaaaaaaaaaaaaaaaaa",
  at: "2026-09-01T10:00:00.000Z",
  legacy: false,
  outcome: null,
  browser: "browser A",
  device: "iPhone",
  network: null,
  verdict: "flagged",
  distance_m: 2623,
  accuracy_m: 7,
  shared_later: false,
  share_event_id: null,
  check: "verified",
  ...over,
});
const door = (over: Partial<DoorOpen>): DoorOpen => ({
  at: "2026-09-01T10:00:00.500Z",
  outcome: "success",
  verdict: "flagged",
  distance_m: 2623,
  accuracy_m: 7,
  lat: 34.09,
  lng: -118.27,
  ...over,
});
const address = { lat: 34.0837, lng: -118.3006 };

describe("every open, joined to its signed event", () => {
  it("joins each door row to the signed open at the same moment and lists the signed opens no row describes", () => {
    const rows = everyOpenRows(
      [door({}), door({ at: "2026-09-02T10:00:00Z", outcome: "success", verdict: "not_shared", distance_m: null, accuracy_m: null, lat: null, lng: null })],
      [signed({}), signed({ event_id: "event_bbbbbbbbbbbbbbbbbbbbbbbb", at: "2026-09-03T10:00:00Z", verdict: null, distance_m: null, accuracy_m: null, browser: "browser unknown", device: null })],
    );
    expect(rows.map((r) => [r.n, r.signed, r.event_id, r.kind])).toEqual([
      [1, true, "event_aaaaaaaaaaaaaaaaaaaaaaaa", "first"],
      [2, false, null, "again"],
      [3, true, "event_bbbbbbbbbbbbbbbbbbbbbbbb", "again"],
    ]);
    // The door's fix is the map's; a signed open with no row has no point.
    expect(rows[0]).toMatchObject({ lat: 34.09, lng: -118.27, device: "iPhone", browser: "browser A", check: "verified" });
    expect(rows[2]).toMatchObject({ lat: null, lng: null });
  });

  it("says a link scanner's visit and a reload's fire as what they were — the first open is the first a person made", () => {
    const rows = everyOpenRows(
      [door({ at: "2026-09-01T09:00:00Z", outcome: "proxy", lat: null, lng: null, verdict: "not_shared", distance_m: null }), door({}), door({ at: "2026-09-01T10:00:05Z", outcome: "stale" })],
      [signed({ outcome: null })],
    );
    expect(rows.map((r) => r.kind)).toEqual(["scanner", "first", "reload"]);
  });

  it("lets a signed open's own measurement win over the row's, and never gives a distance to a word that measured nothing", () => {
    const [row] = everyOpenRows([door({ verdict: "pass", distance_m: 40 })], [signed({ verdict: "flagged", distance_m: 2623 })]);
    expect(row.distance_m).toBe(2623);
    const [imprecise] = everyOpenRows([door({ verdict: "imprecise", distance_m: 900 })], []);
    expect(imprecise.distance_m).toBeNull();
    expect(everyOpenRows(null, null)).toEqual([]);
  });
});

describe("the opens door's own words for each open (ink-backend #135)", () => {
  it("lets the door's device word and browser letter for THIS open win, and the signed side stand where the door has none", () => {
    const [row] = everyOpenRows([door({ device: "Mac", browser: "B" })], [signed({ device: "iPhone", browser: "browser A" })]);
    expect(row).toMatchObject({ device: "Mac", browser: "browser B" });
    const [older] = everyOpenRows([door({})], [signed({ device: "iPhone", browser: "browser A" })]);
    expect(older).toMatchObject({ device: "iPhone", browser: "browser A" });
    const [unsignedRow] = everyOpenRows([door({ device: "Android", browser: null })], []);
    expect(unsignedRow).toMatchObject({ device: "Android", browser: null, signed: false });
    expect(deviceCell(unsignedRow)).toBe("Android");
  });

  it("takes the door's kind — a re-open the page called a reload reads as one — and keeps one first open", () => {
    const rows = everyOpenRows(
      [door({ kind: "first" }), door({ at: "2026-09-01T11:00:00Z", kind: "reload" }), door({ at: "2026-09-01T12:00:00Z", kind: "again" })],
      [signed({})],
    );
    expect(rows.map((r) => r.kind)).toEqual(["first", "reload", "again"]);
    // The door names a later row the first open: no second "first" is guessed before it.
    const later = everyOpenRows([door({ at: "2026-09-01T09:00:00Z", outcome: "success" }), door({ kind: "first" })], []);
    expect(later.map((r) => r.kind)).toEqual(["again", "first"]);
  });

  it("never guesses a first open where the door declined to say (a capped history)", () => {
    const capped = everyOpenRows([door({ kind: null }), door({ at: "2026-09-01T11:00:00Z", kind: "again" })], [signed({})]);
    expect(capped.map((r) => r.kind)).toEqual(["unknown", "again"]);
    expect(KIND_WORDS[capped[0].kind]).toBe("not recorded");
    // An older signed open on the record settles it: that one is the first, the declined row again.
    const settled = everyOpenRows([door({ kind: null })], [signed({ event_id: "event_old00000000000000000000", at: "2026-08-01T00:00:00Z" }), signed({})]);
    expect(settled.map((r) => r.kind)).toEqual(["first", "again"]);
  });
});

describe("a row, in words", () => {
  const row = (over: Partial<EveryOpenRow>): EveryOpenRow => ({
    ...everyOpenRows([door({})], [signed({})])[0],
    ...over,
  });

  it("says the location as data, the distance kept whole", () => {
    expect(locationCell(row({}))).toBe("location shared · 2.6 km from the address");
    expect(locationCell(row({ distance_m: null, verdict: "imprecise" }))).toBe("location shared");
    expect(locationCell(row({ distance_m: null, verdict: "not_shared", lat: null, lng: null }))).toBe("not shared");
  });

  it("names the device, the browser and the signature check the record gives", () => {
    expect(deviceCell(row({}))).toBe("iPhone");
    expect(deviceCell(row({ device: null, network: "wifi" }))).toBe("wifi network");
    expect(deviceCell(row({ device: null, network: null }))).toBe("not recorded");
    expect(browserCell(row({ browser: null }))).toBe("not recorded");
    expect(signatureCell("verified")).toBe("Signature verified");
    expect(signatureCell(null)).toBe("Signature not checked");
  });

  it("opens onto a sentence of data — never a judgment", () => {
    expect(rowCaption(row({}), address)).toBe("Opened 2.6 km from the delivery address. Accuracy ±7 m.");
    expect(rowCaption(row({ distance_m: null, verdict: "imprecise", accuracy_m: 3200 }), address)).toBe("A location was shared, but no distance was stored. Accuracy ±3.2 km.");
    expect(rowCaption(row({ distance_m: null, verdict: "not_shared", lat: null, lng: null, accuracy_m: null }), address)).toBe("Location not shared.");
    expect(rowCaption(row({ distance_m: null, verdict: "unmeasured", accuracy_m: null }), null)).toContain("the open alone, with no rings");
    expect(accuracyWords(40)).toBe("±40 m");
  });
});

describe("the open against the delivery address", () => {
  const rows = everyOpenRows([door({})], [signed({})]);

  it("says the first open's distance as data, where it stood against the carrier's scan, and where the number came from", () => {
    const v = theOpenReading({ served: { verdict: "flagged", distance_m: 2623, accuracy_m: 7, signed: true, after_carrier_scan: false }, rows, address, opens: 1 });
    expect(v.words).toBe("Opened 2.6 km from the delivery address. Before the carrier's scan.");
    expect(distanceFact(v)).toBe("2.6 km · signed");
    expect(deviceFact(v)).toBe("location shared · ±7 m");
    expect(theOpenReading({ served: { verdict: "pass", distance_m: 56, signed: false, after_carrier_scan: true }, rows, address, opens: 1 }).words).toBe("Opened 56 m from the delivery address. After the carrier's scan.");
  });

  it("measures the two points itself only when the record stored no distance, and says so", () => {
    const v = theOpenReading({ served: null, rows, address, opens: 1 });
    expect(v.source).toBe("here");
    expect(v.words).toMatch(/^Opened [\d.]+ km from the delivery address\. Measured here from the two points, not by ink\.$/);
  });

  it("says a fix too wide to measure as a shared location with its accuracy — no range", () => {
    const v = theOpenReading({ served: { verdict: "imprecise", accuracy_m: 3200 }, rows, address, opens: 1 });
    expect(v.words).toBe("A location was shared, but no distance was stored. Accuracy ±3.2 km. The delivery address is on file and is shown below.");
    expect(v.distance_m).toBeNull();
  });

  it("says no open and no location in the record page's own words", () => {
    expect(theOpenReading({ served: null, rows: [], address, opens: 0 }).words).toBe("No open on the record yet. The delivery address is on file and is shown below.");
    const none = everyOpenRows([door({ verdict: "not_shared", distance_m: null, lat: null, lng: null })], []);
    expect(theOpenReading({ served: { verdict: "not_shared" }, rows: none, address: null, opens: 1 }).words).toBe("No open shared a location, and the delivery address is not geocoded on this row.");
  });

  it("never says within, outside, near, a range or a default", () => {
    for (const served of [
      { verdict: "pass", distance_m: 40, signed: true },
      { verdict: "near", distance_m: 250 },
      { verdict: "flagged", distance_m: 2623, after_carrier_scan: true },
      { verdict: "imprecise", accuracy_m: 900 },
      { verdict: "not_shared" },
      null,
    ]) {
      const v = theOpenReading({ served, rows, address, opens: 1 });
      for (const words of [v.words, deviceFact(v), distanceFact(v)]) expect(words).not.toMatch(JUDGED);
    }
  });

  it("names the signed open the location stands on", () => {
    expect(theOpenEventLine(rows)).toBe("the first open's location · event_aaaaaaaaaaaaaaaaaaaaaaaa");
    const later = everyOpenRows([door({})], [signed({ shared_later: true, share_event_id: "event_cccccccccccccccccccccccc" })]);
    expect(theOpenEventLine(later)).toBe("shared on the first open · event_cccccccccccccccccccccccc");
  });
});

describe("the rings diagram", () => {
  const rows = everyOpenRows([door({})], [signed({})]);

  it("names each ring by its radius and nothing else", () => {
    const g = ringsGeometry(theOpenReading({ served: { verdict: "flagged", distance_m: 2623 }, rows, address, opens: 1 }));
    expect(g.rings.map((r) => r.label)).toEqual(["100 m", "300 m"]);
    expect(g.open?.label).toBe("2.6 km");
  });

  it("puts the open at its bearing, inside the frame however far, and the names on the far side", () => {
    // The open is north-east of the address: right of and above the centre.
    const g = ringsGeometry(theOpenReading({ served: { verdict: "flagged", distance_m: 2_000_000 }, rows, address, opens: 1 }));
    expect(g.open!.x).toBeGreaterThan(g.cx);
    expect(g.open!.y).toBeLessThan(g.cy);
    expect(g.open!.x + 9).toBeLessThan(g.width);
    expect(g.open!.y - 9).toBeGreaterThan(0);
    for (const ring of g.rings) {
      expect(ring.lx).toBeLessThan(g.cx);
      expect(ring.ly).toBeGreaterThan(g.cy);
    }
  });

  it("draws the rings alone with the record's word when nothing was measured", () => {
    const g = ringsGeometry(theOpenReading({ served: { verdict: "not_shared" }, rows: [], address, opens: 1 }));
    expect(g.open).toBeNull();
    expect(g.caption).toBe("location not shared");
    expect(ringsGeometry(theOpenReading({ served: { verdict: "imprecise" }, rows, address, opens: 1 })).caption).toBe("unmeasured");
  });
});
