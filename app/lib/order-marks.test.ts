// NOTHING INK WRITES ON A SHOPIFY ORDER SAYS A DELIVERY WAS VERIFIED (Sam,
// 2026-09-24: the tag, the metafield and the green badge — "wrong"). The new
// words are PLACEHOLDER; what these tests hold is the shape: neutral words
// written, old words still read, the distance as data, no verdict.
import { describe, expect, it } from "vitest";
import {
  carriesInkTag,
  distanceBadgeWords,
  DISTANCE_RECORDED,
  DISTANCE_RECORDED_LABEL,
  isDistanceRecorded,
  LEGACY_DISTANCE_RECORDED,
  LEGACY_ORDER_TAGS,
  openDistanceOf,
  ORDER_TAG,
  storedStatusFor,
} from "./order-marks";

const VERDICT = /verif|confirm|pass\b|within|seen at/i;

describe("the tag ink writes on an order", () => {
  it("says no verdict, and is the words ink already writes", () => {
    expect(ORDER_TAG).toBe("Recorded by ink.");
    expect(ORDER_TAG).not.toMatch(VERDICT);
  });

  it("is read beside the tags older orders keep", () => {
    expect(carriesInkTag([ORDER_TAG])).toBe(true);
    expect(carriesInkTag(["INK-Verified-Delivery"])).toBe(true);
    expect(carriesInkTag(["vip", "INK-Premium-Delivery"])).toBe(true);
    expect(LEGACY_ORDER_TAGS).toContain("INK-Verified-Delivery");
    expect(carriesInkTag(["vip", "wholesale"])).toBe(false);
    expect(carriesInkTag([])).toBe(false);
    expect(carriesInkTag(null)).toBe(false);
    expect(carriesInkTag(undefined)).toBe(false);
  });
});

describe("the word the door notification stores", () => {
  it("is neutral, and the wire's 'verified' becomes it", () => {
    expect(DISTANCE_RECORDED).toBe("recorded");
    expect(DISTANCE_RECORDED).not.toMatch(VERDICT);
    expect(storedStatusFor("verified")).toBe(DISTANCE_RECORDED);
  });

  it("stores every other wire word as it came", () => {
    expect(storedStatusFor("delivered")).toBe("delivered");
    expect(storedStatusFor("enrolled")).toBe("enrolled");
  });

  it("reads old orders' 'verified' and new orders' word as one state", () => {
    expect(LEGACY_DISTANCE_RECORDED).toBe("verified");
    expect(isDistanceRecorded("verified")).toBe(true);
    expect(isDistanceRecorded("Verified")).toBe(true);
    expect(isDistanceRecorded(DISTANCE_RECORDED)).toBe(true);
    for (const other of ["enrolled", "pending", "delivered", "active", "", null, undefined, 3]) {
      expect(isDistanceRecorded(other)).toBe(false);
    }
  });
});

describe("the badge: the distance as data, never a verdict", () => {
  it("says the open's distance in the record's own sentence", () => {
    expect(distanceBadgeWords(40)).toBe("Opened 40 m from the delivery address");
    expect(distanceBadgeWords("40")).toBe("Opened 40 m from the delivery address");
    expect(distanceBadgeWords(2623)).toBe("Opened 2.6 km from the delivery address");
  });

  it("says the event's neutral title when no distance was stored", () => {
    expect(DISTANCE_RECORDED_LABEL).toBe("Distance recorded");
    for (const none of [null, undefined, "", 0, -5, "abc", Number.NaN]) {
      expect(distanceBadgeWords(none)).toBe(DISTANCE_RECORDED_LABEL);
    }
  });

  it("never judges", () => {
    for (const d of [3, 40, 99, 100, 101, 300, 301, 2623, 1_994_000, null]) {
      expect(distanceBadgeWords(d)).not.toMatch(VERDICT);
    }
  });
});

describe("a stored distance", () => {
  it("is whole, positive metres or none", () => {
    expect(openDistanceOf("55")).toBe(55);
    expect(openDistanceOf(55.4)).toBe(55);
    expect(openDistanceOf(0)).toBeNull();
    expect(openDistanceOf(-3)).toBeNull();
    expect(openDistanceOf("")).toBeNull();
    expect(openDistanceOf(null)).toBeNull();
    expect(openDistanceOf("far")).toBeNull();
  });
});
