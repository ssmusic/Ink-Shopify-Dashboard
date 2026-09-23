// THE PROOF DOOR'S OWN WORD FOR AN ORDER (ink-backend #132), AND THE TWO
// PLACES THIS APP SAYS IT.
//
// GET {api}/proofs/:id answers `open_location` beside the proof: the FIRST
// HUMAN OPEN's own location word, its own distance and radius, and the first
// measurement another open made said beside it as `later_share`. Its
// gps_verdict is that same word. Until #132 gps_verdict was the proof's
// rollup — an older world's first tap stamped it 'pass' (the default until
// ink-backend #99) on buyers who declined, and nothing cleared it: Steve
// Madden #1027, whose first open denied location, read "pass" on every door.
// first_tap_distance_to_shipping_m stays the rollup as written — the distance
// the first open that MEASURED stored, any open's, often a later one's.
//
// Pinned here: the shape this app reads, and that neither the ink timeline
// nor the Ritualist's order page ever says gps_verdict beside
// first_tap_distance_to_shipping_m — on either side of the backend deploy.
// (The order id and distances are made up; the shape is #1027's.)

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { openLocationOf } from "../lib/open-location";
import { timelineFrom } from "../services/ink-timeline.server";
import { locationLine, openRecordFromProof } from "../services/order-open-record";

const LATER_M = 2_000_000;
const OPENED = {
  proof_id: "proof_000000000000000000a10270",
  enrolled_at: "2026-09-01T00:00:00.000Z",
  delivered_at: "2026-09-04T18:00:00.000Z",
  first_tap_at: "2026-09-05T02:00:26.311Z",
  tap_count: 32,
  first_tap_distance_to_shipping_m: LATER_M,
  first_tap_distance_source: "gps",
  shipping_geocode_lat: 32.7767,
  shipping_geocode_lng: -96.797,
};

// The door since #132: the first open denied location; a later open's late
// share measured the buyer far away, said beside it.
const SINCE_132 = {
  ...OPENED,
  gps_verdict: "not_shared",
  open_location: {
    verdict: "not_shared",
    distance_m: null,
    accuracy_m: null,
    later_share: { verdict: "flagged", distance_m: LATER_M, accuracy_m: 7, measured_at: "2026-09-22T01:16:32.752Z" },
  },
};
// The same order on the door before #132: the rollup's stale 'pass', no reading.
const BEFORE_132 = { ...OPENED, gps_verdict: "pass" };

describe("the proof door's open_location (ink-backend #132)", () => {
  it("is read as the first open's word with its own distance and radius — nothing else", () => {
    expect(openLocationOf(SINCE_132.open_location)).toEqual({ verdict: "not_shared", distance_m: null, accuracy_m: null });
    expect(openLocationOf({ verdict: "pass", distance_m: 41, accuracy_m: 9, later_share: null })).toEqual({ verdict: "pass", distance_m: 41, accuracy_m: 9 });
    // A distance belongs to a measured word only; junk is no reading.
    expect(openLocationOf({ verdict: "unmeasured", distance_m: 41, accuracy_m: 9 })).toEqual({ verdict: "unmeasured", distance_m: null, accuracy_m: 9 });
    expect(openLocationOf({ verdict: "pass", distance_m: 0 })).toEqual({ verdict: "pass", distance_m: null, accuracy_m: null });
    for (const junk of [null, undefined, "pass", {}, { verdict: "" }, { verdict: 3 }]) expect(openLocationOf(junk)).toBeNull();
  });
});

describe("the ink timeline, without the opens door", () => {
  it("says the first open's own word — never the later share's distance beside it", () => {
    expect(timelineFrom(SINCE_132, null)?.opens).toEqual([
      { at: "2026-09-05T02:00:26.311Z", verdict: "not_shared", distance_m: null, accuracy_m: null, lat: null, lng: null },
    ]);
  });

  it("before #132 says no word at all — never the rollup's pass beside a distance another open measured", () => {
    expect(timelineFrom(BEFORE_132, null)?.opens).toEqual([
      { at: "2026-09-05T02:00:26.311Z", verdict: null, distance_m: null, accuracy_m: null, lat: null, lng: null },
    ]);
  });

  it("reads neither raw stamp for the first open: no p.gps_verdict, no first_tap_distance_to_shipping_m", () => {
    const src = readFileSync(resolve(process.cwd(), "app/services/ink-timeline.server.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(src).not.toMatch(/first_tap_distance_to_shipping_m/);
    expect(src).not.toMatch(/\bp\.gps_verdict\b/);
  });
});

describe("the Ritualist's order page, the Location line", () => {
  const line = (proof: unknown) => {
    const r = openRecordFromProof(proof);
    return locationLine(r.gps_verdict, r.distance_meters);
  };

  it("since #132 says the first open's word, never the later share's distance", () => {
    expect(line(SINCE_132)).toBe("Not shared by the customer");
    expect(openRecordFromProof(SINCE_132).distance_meters).toBeNull();
    const measured = { ...SINCE_132, gps_verdict: "pass", open_location: { verdict: "pass", distance_m: 41, accuracy_m: 9, later_share: null } };
    expect(line(measured)).toBe("41 m from the shipping address");
  });

  it("before #132 reads the two stamps as it did — the backend deploy is what corrects them", () => {
    expect(openRecordFromProof(BEFORE_132)).toMatchObject({ gps_verdict: "pass", distance_meters: LATER_M });
  });
});
