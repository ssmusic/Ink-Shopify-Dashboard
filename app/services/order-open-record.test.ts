// THE ORDER PAGE'S OPEN RECORD — what the merchant reads about each open.
//
// The bugs these pin:
//  · a proof with a verdict but no location read as "located" (the verdict
//    used to default to pass on the backend; the page treated any verdict
//    as verified)
//  · a distance that was never measured rendered as "0m from shipping
//    address"
//  · per-open distances existed on every tap row and were never shown
//  · the page asked the proof door without the merchant's key and got 401
//    for six months (the loader is covered by the contract in the route;
//    this file covers the pure projection)
import { describe, it, expect } from "vitest";
import {
  locationLine,
  openRecordFromProof,
  openRowsFromTapEvents,
  formatDistance,
} from "./order-open-record";

describe("formatDistance", () => {
  it("says metres under a kilometre, kilometres above, never a fake precision", () => {
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(55)).toBe("55 m");
    expect(formatDistance(999)).toBe("999 m");
    expect(formatDistance(1000)).toBe("1.0 km");
    expect(formatDistance(2120345)).toBe("2,120 km");
    expect(formatDistance(null)).toBeNull();
    expect(formatDistance(Number.NaN)).toBeNull();
  });
});

describe("locationLine — the words under 'Location'", () => {
  it("states the measured distance for a measured verdict", () => {
    expect(locationLine("pass", 55)).toBe("55 m from the shipping address");
    expect(locationLine("near", 240)).toBe("240 m from the shipping address");
    expect(locationLine("flagged", 2120345)).toBe("2,120 km from the shipping address");
  });
  it("says not shared when the customer shared nothing — never a distance", () => {
    expect(locationLine("not_shared", null)).toBe("Not shared by the customer");
    expect(locationLine("not_shared", 0)).toBe("Not shared by the customer");
  });
  it("says shared but unmeasured when a location arrived with nothing to measure against", () => {
    expect(locationLine("unmeasured", null)).toBe("Shared — no distance available");
  });
  it("renders nothing for no verdict, and never invents a distance for a measured verdict without one", () => {
    expect(locationLine(null, null)).toBeNull();
    expect(locationLine(undefined, 55)).toBeNull();
    expect(locationLine("pass", null)).toBe("Shared — no distance available");
  });
  it("is case-tolerant to the console spelling", () => {
    expect(locationLine("PASS", 12)).toBe("12 m from the shipping address");
    expect(locationLine("NOT_SHARED", null)).toBe("Not shared by the customer");
  });
});

describe("openRecordFromProof — the projection the page keeps", () => {
  const base = {
    proof_id: "proof_x",
    tap_count: 3,
    first_tap_at: "2026-09-10T18:02:11.000Z",
    last_tap_at: "2026-09-12T09:15:00.000Z",
    first_tap_distance_to_shipping_m: 55,
    gps_verdict: "pass",
    customer_tier: "returning",
    within_expected_window: true,
    delivery_outcome: "UNCONFIRMED",
    media_items: [{ url: "https://cdn.example/a.jpg" }],
  };
  it("opened means opened: status follows tap_count, not the verdict", () => {
    expect(openRecordFromProof(base).verification_status).toBe("verified");
    expect(openRecordFromProof({ ...base, tap_count: 0, gps_verdict: null }).verification_status).toBe("enrolled");
    // a neutral verdict with taps is still opened
    expect(openRecordFromProof({ ...base, gps_verdict: "not_shared", first_tap_distance_to_shipping_m: null }).verification_status).toBe("verified");
  });
  it("carries the first-open distance only when it was measured", () => {
    expect(openRecordFromProof(base).distance_meters).toBe(55);
    expect(openRecordFromProof({ ...base, first_tap_distance_to_shipping_m: null }).distance_meters).toBeNull();
    expect(openRecordFromProof({ ...base, first_tap_distance_to_shipping_m: 0 }).distance_meters).toBeNull();
  });
  it("keeps the verdict raw and the timestamps as the backend said them", () => {
    const r = openRecordFromProof(base);
    expect(r.gps_verdict).toBe("pass");
    expect(r.verification_updated_at).toBe("2026-09-10T18:02:11.000Z");
    expect(r.tap_count).toBe(3);
    expect(r.last_tap_at).toBe("2026-09-12T09:15:00.000Z");
    expect(r.photo_urls).toEqual(["https://cdn.example/a.jpg"]);
  });
  it("survives a bare proof", () => {
    const r = openRecordFromProof({ proof_id: "proof_y" });
    expect(r.verification_status).toBe("enrolled");
    expect(r.distance_meters).toBeNull();
    expect(r.gps_verdict).toBeNull();
    expect(r.tap_count).toBe(0);
    expect(r.photo_urls).toBeNull();
  });
});

describe("openRowsFromTapEvents — every open, newest first, with what it shared", () => {
  const rows = [
    { tap_id: "t1", tap_at: "2026-09-10T18:02:11.000Z", outcome: "success", location_source: "gps", gps_permission: "granted", distance_to_shipping_m: 55, tap_lat: 34.0926, tap_lng: -118.2681, device_info: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" },
    { tap_id: "t2", tap_at: "2026-09-11T08:00:00.000Z", outcome: "duplicate", location_source: "none", gps_permission: "denied", distance_to_shipping_m: null, tap_lat: null, tap_lng: null, device_info: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36" },
    { tap_id: "t3", tap_at: "2026-09-12T09:15:00.000Z", outcome: "duplicate", location_source: "gps", gps_permission: "granted", distance_to_shipping_m: null, tap_lat: 34.1, tap_lng: -118.3, device_info: "" },
  ];
  it("orders newest first and words each open's location honestly", () => {
    const out = openRowsFromTapEvents(rows);
    expect(out.map((r) => r.tap_id)).toEqual(["t3", "t2", "t1"]);
    expect(out[2].location).toBe("55 m from the shipping address");
    expect(out[1].location).toBe("Location not shared");
    expect(out[0].location).toBe("Shared — no distance available");
  });
  it("names the device in a word or two, never the user-agent string", () => {
    const out = openRowsFromTapEvents(rows);
    expect(out[2].device).toBe("iPhone");
    expect(out[1].device).toBe("Mac");
    expect(out[0].device).toBeNull();
  });
  it("gives the first open's coordinates when that open shared them, else nothing", () => {
    const out = openRowsFromTapEvents(rows);
    expect(out[2].coords).toEqual({ lat: 34.0926, lng: -118.2681 });
    expect(out[1].coords).toBeNull();
  });
  it("drops nothing and throws on nothing", () => {
    expect(openRowsFromTapEvents([])).toEqual([]);
    expect(openRowsFromTapEvents(undefined as any)).toEqual([]);
    expect(openRowsFromTapEvents([{ tap_id: "z" } as any])).toHaveLength(1);
  });
});
