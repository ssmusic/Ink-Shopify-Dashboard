// THE CONSOLE'S ARITHMETIC, PORTED — pinned on fixtures.

import { describe, expect, it } from "vitest";
import {
  carrierNamed,
  carrierSaid,
  formatHours,
  funnel,
  timeInTransit,
  whileTheyWaited,
  type DeliveryRow,
} from "./delivery-insights";
import {
  deliveryWindow,
  kmOrM,
  lifecycle,
  openResult,
  openSentence,
} from "./order-timeline";

const H = 3_600_000;
const T0 = Date.parse("2026-09-01T00:00:00Z");
const iso = (hours: number) => new Date(T0 + hours * H).toISOString();

describe("the delivery dashboard", () => {
  const rows: DeliveryRow[] = [
    {
      enrolled_at: iso(0),
      delivered_at: iso(20),
      tap_count: 3,
      gps_verdict: "PASS",
      location_source: "gps",
      verified_at_door: true,
      last_tracking_status: "DELIVERED",
      carrier_name: "USPS",
    },
    {
      enrolled_at: iso(0),
      delivered_at: iso(30),
      tap_count: 1,
      gps_verdict: "FLAGGED",
      location_source: "GPS",
      verified_at_door: false,
      last_tracking_status: "DELIVERED",
      carrier_name: "UPS",
    },
    {
      enrolled_at: iso(0),
      delivered_at: iso(100),
      tap_count: 0,
      gps_verdict: null,
      last_tracking_status: "DELIVERED",
    },
    // An NFC-era verdict with no source: opened, but no location shared.
    {
      enrolled_at: iso(0),
      delivered_at: iso(26),
      tap_count: 2,
      gps_verdict: "pass",
      location_source: null,
      last_tracking_status: "DELIVERED",
    },
    {
      enrolled_at: iso(0),
      delivered_at: null,
      tap_count: 2,
      gps_verdict: "NOT_SHARED",
      last_tracking_status: "TRANSIT",
      carrier_name: "—",
    },
    {
      enrolled_at: iso(10),
      delivered_at: iso(5),
      tap_count: 1,
      gps_verdict: "not_shared",
      last_tracking_status: "",
    },
  ];

  it("runs the funnel orders → delivered → opened → location shared, each as a share of the step above — and stops there (no \"seen at the door\": ink does not judge a distance)", () => {
    expect(funnel(rows)).toEqual([
      { key: "orders", label: "Orders", count: 6, ofAbovePct: null },
      { key: "delivered", label: "Delivered", count: 5, ofAbovePct: 83.3 },
      { key: "opened", label: "Open", count: 4, ofAbovePct: 80 },
      { key: "shared", label: "Location shared", count: 2, ofAbovePct: 50 },
    ]);
    expect(funnel([]).map((s) => s.ofAbovePct)).toEqual([null, null, null, null]);
  });

  it("buckets time in transit with the console's buckets, skipping a missing or negative pair", () => {
    const t = timeInTransit(rows);
    expect(t.buckets).toEqual([
      { label: "Under 1 day", count: 1 },
      { label: "1 to 2 days", count: 2 },
      { label: "2 to 4 days", count: 0 },
      { label: "4 to 7 days", count: 1 },
      { label: "Over 7 days", count: 0 },
    ]);
    expect(t.delivered).toBe(5);
    expect(t.measured).toBe(4);
    expect(t.medianHours).toBe(28);
    expect(formatHours(30)).toBe("30 h");
    expect(formatHours(100)).toBe("4.2 d");
  });

  it("says what the carrier said last, largest first, an empty word as 'No delivery status'", () => {
    expect(carrierSaid(rows)).toEqual([
      { status: "Delivered", count: 4, ofEnrolledPct: 66.7 },
      { status: "No delivery status", count: 1, ofEnrolledPct: 16.7 },
      { status: "Transit", count: 1, ofEnrolledPct: 16.7 },
    ]);
    expect(carrierNamed(rows)).toBe(2);
  });

  it("counts the opens made 48 h or more after the parcel last moved", () => {
    expect(
      whileTheyWaited([
        { tap_at: iso(50), tracking_last_moved_at: iso(0) },
        { tap_at: iso(47), tracking_last_moved_at: iso(0) },
        { tap_at: iso(10), tracking_last_moved_at: null },
      ]),
    ).toEqual({ stuck: 1, withData: 2, sharePct: 50 });
  });
});

describe("one order's timeline", () => {
  it("marks each step from the proof's own fields — the carrier's two steps from its journey, and says so", () => {
    const steps = lifecycle({
      enrolled_at: iso(0),
      delivered_at: iso(40),
      first_tap_at: iso(45),
      carrier_journey: {
        events: [
          { at: iso(30), stage: "transit" },
          { at: iso(20), stage: "pre_transit" },
          { at: iso(25), stage: "shipped" },
          { at: iso(40), stage: "delivered" },
        ],
      },
    });
    // No "Enrolled" (the NFC era's word — Sam), no return or refund step (ink has neither).
    expect(steps.map((s) => [s.key, s.state, s.at])).toEqual([
      ["shipped", "carrier", iso(25)],
      ["in_transit", "carrier", iso(30)],
      ["delivered", "done", iso(40)],
      ["opened", "done", iso(45)],
    ]);
    // No journey: the carrier's steps are not recorded, never guessed.
    expect(lifecycle({ enrolled_at: iso(0) }).slice(0, 2).map((s) => s.state)).toEqual(["not_recorded", "not_recorded"]);
    // A later scan never stands in for an earlier stage: delivered alone is not "Shipped".
    expect(lifecycle({ carrier_journey: { events: [{ at: iso(40), stage: "delivered" }] } }).slice(0, 2).map((s) => s.state)).toEqual(["not_recorded", "not_recorded"]);
  });

  it("reports measurements without a range judgment and distinguishes missing data from declined location", () => {
    expect(openResult(56, "pass")).toBe("measured");
    expect(openResult(250, "near")).toBe("measured");
    expect(openResult(719, "flagged")).toBe("measured");
    expect(openResult(null, "NOT_SHARED")).toBe("not_shared");
    expect(openResult(null, "imprecise")).toBe("imprecise");
    expect(openSentence(719, "flagged")).toBe(
      "Opened 719 m from the delivery address.",
    );
    expect(openSentence(3552, "flagged")).toBe(
      "Opened 3.6 km from the delivery address.",
    );
    expect(openSentence(56, "pass")).toBe("Opened 56 m from the delivery address.");
    expect(openResult(null, "unmeasured")).toBe("unmeasured");
    expect(openSentence(null, null)).toBe("Distance unavailable.");
    expect(openSentence(-5, "pass")).toBe("Distance unavailable.");
    // A measured word without its distance still says a location was shared —
    // never that none was; no word at all claims neither.
    expect(openResult(null, "pass")).toBe("shared");
    expect(openSentence(null, "pass")).toBe("A location was shared.");
    expect(openResult(null, null)).toBe("unmeasured");
    for (const d of [56, 250, 719, 3552]) expect(openSentence(d, "pass")).not.toMatch(/range|within|outside|near/i);
    expect(kmOrM(56)).toBe("56 m");
  });

  it("draws the delivery window from the delivered scan to its end, with the first open where it fell", () => {
    const w = deliveryWindow({
      delivered_at: iso(20),
      interaction_window_end: iso(120),
      first_tap_at: iso(45),
      within_expected_window: true,
    });
    expect(w).toEqual({
      deliveredAt: iso(20),
      windowEnd: iso(120),
      firstOpenAt: iso(45),
      hoursToOpen: 25,
      openPositionPct: 25,
      withinExpectedWindow: true,
    });
    // An absent end stays absent. No seven-day window is invented.
    expect(
      deliveryWindow({
        delivered_at: iso(20),
        enrolled_at: iso(0),
        first_tap_at: iso(10),
      }),
    ).toBeNull();
    const before = deliveryWindow({
      delivered_at: iso(20),
      interaction_window_end: iso(120),
      first_tap_at: iso(10),
    });
    expect(before?.hoursToOpen).toBe(-10);
    expect(before?.openPositionPct).toBe(0);
    expect(
      deliveryWindow({ delivered_at: null, interaction_window_end: iso(120) }),
    ).toBeNull();
  });
});
