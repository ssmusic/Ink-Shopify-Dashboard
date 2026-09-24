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

  // Sam, 2026-09-24: "we cant confirm at door." The funnel ended with "Seen at
  // the door" (a signed DELIVERY_VERIFIED: a 100 m pass after the scan); that
  // count has no neutral name, so it is not a step. The rows keep the field.
  it("runs the funnel orders → delivered → opened → location shared, each as a share of the step above — and no step claims the door", () => {
    expect(funnel(rows)).toEqual([
      { key: "orders", label: "Orders", count: 6, ofAbovePct: null },
      { key: "delivered", label: "Delivered", count: 5, ofAbovePct: 83.3 },
      { key: "opened", label: "Open", count: 4, ofAbovePct: 80 },
      { key: "shared", label: "Location shared", count: 2, ofAbovePct: 50 },
    ]);
    expect(funnel([]).map((s) => s.ofAbovePct)).toEqual([null, null, null, null]);
    for (const s of funnel(rows)) expect(s.label).not.toMatch(/door|confirm|verif|seen/i);
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
    // The carrier's delivered scan is the delivery: a carrier's step, said so.
    expect(steps.map((s) => [s.key, s.state, s.at, s.note])).toEqual([
      ["enrolled", "done", iso(0), "Recorded by ink"],
      ["shipped", "carrier", iso(25), "From the carrier's scan"],
      ["in_transit", "carrier", iso(30), "From the carrier's scan"],
      ["delivered", "carrier", iso(40), "From the carrier's scan"],
      ["opened", "done", iso(45), "Recorded by ink"],
      ["return_started", "not_recorded", null, null],
      ["refund_cleared", "not_recorded", null, "no event for refunds yet"],
    ]);
    // No journey: the carrier's steps are not recorded, never guessed.
    expect(
      lifecycle({ enrolled_at: iso(0) })
        .slice(1, 3)
        .map((s) => s.state),
    ).toEqual(["not_recorded", "not_recorded"]);
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
    expect(openSentence(null, null)).toBe("Distance unavailable.");
    expect(openSentence(-5, "pass")).toBe("Distance unavailable.");
    expect(kmOrM(56)).toBe("56 m");
  });

  it("says where each delivered time came from, and ticks only what ink or a carrier saw (Sam: \"this isnt honest\")", () => {
    const delivered = (delivered_source: string | null) =>
      lifecycle({ enrolled_at: iso(0), delivered_at: iso(1), delivered_source }).find((s) => s.key === "delivered")!;
    // Shopify's fulfillment update (source "merchant"): its word, with its time — never a tick.
    expect(delivered("merchant")).toMatchObject({ state: "reported", at: iso(1), note: "From Shopify's fulfillment" });
    // A carrier's tracking said it, with no journey stored: still the carrier's scan.
    for (const s of ["shippo_webhook", "shippo_register", "easypost", "carrier"])
      expect(delivered(s)).toMatchObject({ state: "carrier", at: iso(1), note: "From the carrier's scan" });
    expect(delivered("demo_clock")).toMatchObject({ state: "reported", note: "Set by the demo clock" });
    // The backend cannot say who: not recorded, never guessed.
    for (const s of [null, "system", "something_else"])
      expect(delivered(s)).toMatchObject({ state: "not_recorded", at: null, note: null });
    // No recorded step without its source.
    for (const step of lifecycle({ enrolled_at: iso(0), delivered_at: iso(1), delivered_source: "merchant", first_tap_at: iso(2) }))
      if (step.at) expect(step.note).toBeTruthy();
  });
  it("draws the delivery window from the delivered scan to its end, with the first open where it fell", () => {
    const w = deliveryWindow({
      delivered_at: iso(20),
      delivered_note: "From the carrier's scan",
      interaction_window_end: iso(120),
      first_tap_at: iso(45),
      within_expected_window: true,
    });
    expect(w).toEqual({
      deliveredAt: iso(20),
      deliveredNote: "From the carrier's scan",
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
    // A delivery whose source nobody can say draws no window.
    expect(deliveryWindow({ delivered_at: iso(20), interaction_window_end: iso(120) })).toBeNull();
    const before = deliveryWindow({
      delivered_at: iso(20),
      delivered_note: "From Shopify's fulfillment",
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
