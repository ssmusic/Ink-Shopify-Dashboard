// EACH ORDER'S TIMELINE AND THE DELIVERY DASHBOARD — read with the merchant's own key.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readTimeline,
  readTimelines,
  timelineFrom,
} from "./ink-timeline.server";
import { dashboardFrom, readDeliveryDashboard } from "./ink-delivery.server";

afterEach(() => vi.unstubAllEnvs());

const API = "https://us-central1-inink-c76d3.cloudfunctions.net/api";
const PROOF = "proof_1a7467ae50a0602ea76e5717";
const calls = (f: unknown) =>
  (f as { mock: { calls: [string, { headers: Record<string, string> }][] } })
    .mock.calls;

// GET /proofs/:id for Corvara #1012, as it answered on 2026-09-23 (the fields the timeline reads).
const PROOF_BODY = {
  proof_id: PROOF,
  enrolled_at: "2026-08-25T20:28:07.559Z",
  delivered_at: "2026-08-25T20:29:50.138Z",
  // Corvara #1012: its delivery came from Shopify's fulfillment update (the embed's
  // fulfillments/update webhook → PATCH /proofs/:id/delivered, source "merchant").
  delivery_source: "merchant",
  first_tap_at: "2026-08-25T20:29:59.868Z",
  first_tap_distance_to_shipping_m: 3552,
  gps_verdict: "flagged",
  within_expected_window: true,
  interaction_window_closed_at: "2026-08-28T20:29:50.138Z",
  shipping_geocode_lat: 34.1425,
  shipping_geocode_lng: -118.2551,
  carrier_journey: null,
  shipping_address_raw: "1 Test St",
  customer_name: "Made Up",
};
const RECORD = {
  locked: true,
  summary: { first_open_at: PROOF_BODY.first_tap_at },
  elements: [
    {
      element: "the_open",
      label: "The open",
      status: "verified",
      value: { location: { verdict: "flagged", distance_m: 3552 } },
    },
  ],
};
const OPENS_BODY = {
  proof_id: PROOF,
  address: { lat: 34.1425, lng: -118.2551 },
  opens: [
    {
      at: "2026-08-25T20:29:59.868Z",
      outcome: "success",
      gps_permission: "granted",
      gps_verdict: "flagged",
      distance_m: 3552,
      accuracy_m: 20,
      lat: 34.11,
      lng: -118.23,
      location_shared_at: null,
    },
    {
      at: "2026-08-25T21:00:00.000Z",
      outcome: "proxy",
      gps_permission: null,
      gps_verdict: "not_shared",
      distance_m: null,
      accuracy_m: null,
      lat: null,
      lng: null,
      location_shared_at: null,
    },
    {
      at: "2026-08-26T09:00:00.000Z",
      outcome: "success",
      gps_permission: "denied",
      gps_verdict: "not_shared",
      distance_m: null,
      accuracy_m: null,
      lat: null,
      lng: null,
      location_shared_at: null,
    },
  ],
};

describe("an order's timeline", () => {
  it("reads the proof and its opens with the merchant's own key — never the admin secret", async () => {
    vi.stubEnv("INK_ADMIN_SECRET", "admin-secret-must-not-be-sent");
    const f = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(url.endsWith("/opens") ? OPENS_BODY : PROOF_BODY),
        ),
    ) as unknown as typeof fetch;
    const t = await readTimeline("ink_live_key", PROOF, f, RECORD);
    expect(
      calls(f)
        .map(([url]) => url)
        .sort(),
    ).toEqual([`${API}/proofs/${PROOF}`, `${API}/proofs/${PROOF}/opens`]);
    for (const [, init] of calls(f))
      expect(init.headers).toEqual({ Authorization: "Bearer ink_live_key" });
    expect(t?.address).toEqual({ lat: 34.1425, lng: -118.2551 });
    // The open the record calls not a person's is not drawn; the rest keep their order.
    expect(
      t?.opens.map((o) => [o.distance_m, o.verdict, o.lat != null]),
    ).toEqual([
      [3552, "flagged", true],
      [null, "not_shared", false],
    ]);
    // Codex's rail, as Sam chose it on 2026-09-23 — each step saying where its
    // time came from (Sam, on this very order: "this isnt honest"). Shopify's
    // fulfillment said delivered, one minute after ink recorded the order: it
    // is said as Shopify's word, never ticked like something ink or a carrier saw.
    expect(t?.steps.map((s) => [s.key, s.state, s.note])).toEqual([
      ["enrolled", "done", "Recorded by ink"],
      ["shipped", "not_recorded", null],
      ["in_transit", "not_recorded", null],
      ["delivered", "reported", "From Shopify's fulfillment"],
      ["opened", "done", "Recorded by ink"],
      ["return_started", "not_recorded", null],
      ["refund_cleared", "not_recorded", "no event for refunds yet"],
    ]);
    expect(t?.opensAvailable).toBe(true);
    expect(t?.window).toMatchObject({
      deliveredNote: "From Shopify's fulfillment",
      withinExpectedWindow: true,
      windowEnd: "2026-08-28T20:29:50.138Z",
    });
    expect(JSON.stringify(t)).not.toMatch(/1 Test St|Made Up/);
  });

  it("before the opens door is deployed (404), says the first open in words from the proof, with no point on the map", async () => {
    const f = vi.fn(async (url: string) =>
      url.endsWith("/opens")
        ? new Response("Not found", { status: 404 })
        : new Response(JSON.stringify(PROOF_BODY)),
    ) as unknown as typeof fetch;
    const t = await readTimeline("k", PROOF, f, RECORD);
    expect(t?.opens).toEqual([
      {
        at: "2026-08-25T20:29:59.868Z",
        verdict: "flagged",
        distance_m: 3552,
        accuracy_m: null,
        lat: null,
        lng: null,
      },
    ]);
    expect(t?.address).toEqual({ lat: 34.1425, lng: -118.2551 });
    expect(t?.opensAvailable).toBe(false);
  });

  it("without the opens door (404), says the first open from the proof, with no point on the map — its words only from the door's own reading", async () => {
    const f = vi.fn(async (url: string) => (url.endsWith("/opens") ? new Response("Not found", { status: 404 }) : new Response(JSON.stringify(PROOF_BODY)))) as unknown as typeof fetch;
    const t = await readTimeline("k", PROOF, f);
    // A proof door before ink-backend #132 carries no reading of the open: no
    // word, never gps_verdict beside first_tap_distance_to_shipping_m.
    expect(t?.opens).toEqual([{ at: "2026-08-25T20:29:59.868Z", verdict: null, distance_m: null, accuracy_m: null, lat: null, lng: null }]);
    expect(t?.address).toEqual({ lat: 34.1425, lng: -118.2551 });
    expect(t?.opensAvailable).toBe(false);
    // Since #132 the door reads the first open itself: its word, its own distance and radius.
    const measured = { ...PROOF_BODY, open_location: { verdict: "flagged", distance_m: 3552, accuracy_m: 20, later_share: null } };
    const g = vi.fn(async (url: string) => (url.endsWith("/opens") ? new Response("Not found", { status: 404 }) : new Response(JSON.stringify(measured)))) as unknown as typeof fetch;
    expect((await readTimeline("k", PROOF, g))?.opens).toEqual([{ at: "2026-08-25T20:29:59.868Z", verdict: "flagged", distance_m: 3552, accuracy_m: 20, lat: null, lng: null }]);
  });

  it("never reads the proof's old default stamp as a share: without the opens door, the words are the record's alone", () => {
    // Rows stamped before ink-backend #99 carry gps_verdict 'pass' on opens that shared nothing.
    const stamped = { ...PROOF_BODY, gps_verdict: "pass", first_tap_distance_to_shipping_m: null };
    // No record and no door reading (#132): the open's moment, and no word at all.
    expect(timelineFrom(stamped, null)?.opens).toEqual([{ at: "2026-08-25T20:29:59.868Z", verdict: null, distance_m: null, accuracy_m: null, lat: null, lng: null }]);
    const t = timelineFrom(stamped, null, RECORD);
    expect(t?.opens.map((o) => o.verdict)).toEqual(["flagged"]);
  });

  it("without the opens door, takes the first open's words from the record — the words the accordion prints above it", () => {
    // The record read the same order honestly: the stored 3,552 m was a later measurement's, the first open shared nothing.
    const record = {
      summary: { first_open_at: "2026-08-25T20:29:59.868Z" },
      locked: true,
      elements: [{ element: "the_open", label: "The open", status: "verified", value: { location: { verdict: "not_shared", distance_m: null } } }],
    };
    expect(timelineFrom(PROOF_BODY, null, record)?.opens[0]).toMatchObject({ verdict: "not_shared", distance_m: null, at: "2026-08-25T20:29:59.868Z" });
    // With the opens door, the opens are the door's own.
    expect(timelineFrom(PROOF_BODY, OPENS_BODY, record)?.opens[0]).toMatchObject({ verdict: "flagged", distance_m: 3552 });
  });

  it("uses the paid merchant audit to show complete opens and points when the opens door is absent", async () => {
    const f = vi.fn(async (url: string) => {
      if (url.endsWith("/opens"))
        return new Response("Not found", { status: 404 });
      if (url.endsWith("/audit"))
        return new Response(
          JSON.stringify({
            proof_id: PROOF,
            summary: { opens: 1 },
            chain: [
              {
                event_id: "event_open",
                event_type: "TAP_RECORDED",
                timestamp: PROOF_BODY.first_tap_at,
                signed_bytes: JSON.stringify({
                  event_data: {
                    tap_id: "a",
                    tap_outcome: "success",
                    distance_m: 3552,
                    gps_verdict: "flagged",
                    accuracy_m: 20,
                  },
                }),
                revealed: { gps: { lat: 34.11, lng: -118.23 } },
              },
            ],
          }),
        );
      return new Response(JSON.stringify(PROOF_BODY));
    }) as unknown as typeof fetch;
    const timeline = await readTimeline("k", PROOF, f, {
      ...RECORD,
      locked: false,
    });
    expect(timeline?.opens).toMatchObject([
      { distance_m: 3552, lat: 34.11, lng: -118.23 },
    ]);
    expect(timeline?.opensAvailable).toBe(true);
  });

  it("is nothing for another shop's proof (404), a bad id, or no key — never an error page", async () => {
    const f = vi.fn(
      async () => new Response("{}", { status: 404 }),
    ) as unknown as typeof fetch;
    expect(await readTimeline("k", PROOF, f)).toBeNull();
    expect(await readTimeline("k", "nfc_abc", f)).toBeNull();
    expect(await readTimelines(null, [PROOF], f)).toEqual({});
    expect(timelineFrom(null, null)).toBeNull();
  });
});

describe("the delivery dashboard", () => {
  const BODY = {
    shop_id: "shop_A",
    rows: [
      {
        enrolled_at: "2026-09-01T00:00:00Z",
        delivered_at: "2026-09-02T00:00:00Z",
        tap_count: 2,
        gps_verdict: "pass",
        location_source: "gps",
        verified_at_door: true,
        last_tracking_status: "DELIVERED",
        carrier_name: "USPS",
      },
      {
        enrolled_at: "2026-09-03T00:00:00Z",
        delivered_at: null,
        tap_count: 0,
        gps_verdict: null,
        verified_at_door: false,
        last_tracking_status: null,
        carrier_name: null,
      },
    ],
    taps: [
      {
        tap_at: "2026-09-05T00:00:00Z",
        tracking_last_moved_at: "2026-09-02T00:00:00Z",
      },
    ],
    capped: false,
  };

  it("reads the merchant's rows with its own key and serves only the console's results — never a row", async () => {
    vi.stubEnv("INK_ADMIN_SECRET", "admin-secret-must-not-be-sent");
    const f = vi.fn(
      async () => new Response(JSON.stringify(BODY)),
    ) as unknown as typeof fetch;
    const d = await readDeliveryDashboard("ink_live_key", f);
    expect(calls(f)[0][0]).toBe(`${API}/merchant-delivery`);
    expect(calls(f)[0][1].headers).toEqual({
      Authorization: "Bearer ink_live_key",
    });
    expect(d?.orders).toBe(2);
    expect(d?.funnel.map((s) => s.count)).toEqual([2, 1, 1, 1, 1]);
    expect(d?.waited).toEqual({ stuck: 1, withData: 1, sharePct: 100 });
    expect(d?.carrier[0]).toEqual({
      status: "Delivered",
      count: 1,
      ofEnrolledPct: 50,
    });
    expect(Object.keys(d ?? {})).not.toContain("rows");
  });

  it("keeps the independently capped tap sample visible to the dashboard", () => {
    expect(dashboardFrom({ ...BODY, capped: false, taps_capped: true })).toMatchObject({ capped: false, tapsCapped: true });
  });
  it("is nothing before the door is deployed, or without a key", async () => {
    const f = vi.fn(
      async () => new Response("Not found", { status: 404 }),
    ) as unknown as typeof fetch;
    expect(await readDeliveryDashboard("k", f)).toBeNull();
    expect(await readDeliveryDashboard(null, f)).toBeNull();
    expect(dashboardFrom({ nope: 1 })).toBeNull();
  });
});
