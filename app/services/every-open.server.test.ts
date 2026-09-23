// EVERY OPEN'S SIGNED SIDE — the whole record projected to the words the
// Every open table prints (services/every-open.server.ts), and the loader's
// rows (services/ink-timeline.server.ts): never a hash, a signed byte, a
// browser's id or a coordinate in the record; the map's points only on the
// timeline's rows.
import { describe, expect, it } from "vitest";
import { signedOpensFromBody } from "./every-open.server";
import { recordFromBody } from "./ink-record.server";
import { timelineFrom } from "./ink-timeline.server";

const BROWSER_A = "0123456789abcdef0123456789abcdef";
const BROWSER_B = "fedcba9876543210fedcba9876543210";
const bytes = (event_data: Record<string, unknown>) => JSON.stringify({ event_type: "TAP_RECORDED", event_data, timestamp: "x" });
const tap = (id: string, at: string, event_data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  event_id: id,
  seq: null,
  event_type: "TAP_RECORDED",
  timestamp: at,
  signature: "sig_secret",
  payload_hash: "hash_secret",
  key_id: "key_1",
  signed_bytes: bytes(event_data),
  revealed: { gps: { lat: 34.09, lng: -118.27 } },
  ...extra,
});

const PACKET = {
  proof_id: "proof_aec827b527fb30457c1da890",
  audience: "merchant",
  summary: { order_number: "#1010", opens: 4 },
  verdict: {
    elements: [
      { element: "the_open", label: "The open", status: "verified", value: { opens: 4, location: { verdict: "flagged", distance_m: 2623, accuracy_m: 7, signed: false, after_carrier_scan: true, lat: 34.09, lng: -118.27 } } },
    ],
  },
  browsers: {
    count: 1,
    unknown_opens: 2,
    list: [{ label: "A", browser_id: BROWSER_A, device: "iPhone", opens: 1, first_open_at: "2026-09-01T10:00:00Z", last_open_at: "2026-09-01T10:00:00Z", first_seen_after_delivered_scan: true }],
  },
  chain: [
    tap("event_111111111111111111111111", "2026-09-01T10:00:00Z", { tap_id: "tap_1", tap_outcome: "success", gps_verdict: "flagged", distance_m: 2623, accuracy_m: 7, network_type: "wifi", browser_id: BROWSER_A }),
    tap("event_222222222222222222222222", "2026-09-01T11:00:00Z", { tap_id: "tap_2", tap_outcome: "success", gps_verdict: "not_shared", browser_id: BROWSER_B }),
    {
      event_id: "event_333333333333333333333333",
      event_type: "LOCATION_SHARED",
      timestamp: "2026-09-01T11:00:30Z",
      signed_bytes: JSON.stringify({ event_data: { tap_id: "tap_2", gps_verdict: "pass", distance_m: 40, accuracy_m: 12 } }),
      revealed: { gps: { lat: 34.0838, lng: -118.3005 } },
    },
    tap("event_444444444444444444444444", "2026-09-01T12:00:00Z", { tap_id: "tap_4", tap_outcome: "proxy" }),
    tap("event_555555555555555555555555", "2026-09-01T13:00:00Z", {}, { signed_bytes: "not json" }),
  ],
  legacy_events: [],
  record: { locked: false, purchased: true },
};

describe("each signed open, in words", () => {
  const opens = signedOpensFromBody(PACKET, new Map([["event_111111111111111111111111", "verified"]]));

  it("names each open's browser and its device the way the record counts them", () => {
    expect(opens.map((o) => [o.event_id, o.browser, o.device])).toEqual([
      ["event_111111111111111111111111", "browser A", "iPhone"],
      ["event_222222222222222222222222", "not counted", null],
      ["event_444444444444444444444444", "browser unknown", null],
      ["event_555555555555555555555555", "browser unknown", null],
    ]);
  });

  it("reads each open's own signed word and measurement, else its late share's", () => {
    expect(opens[0]).toMatchObject({ outcome: null, verdict: "flagged", distance_m: 2623, accuracy_m: 7, network: "wifi", shared_later: false, check: "verified" });
    expect(opens[1]).toMatchObject({ verdict: "pass", distance_m: 40, accuracy_m: 12, shared_later: true, share_event_id: "event_333333333333333333333333", check: "not checked" });
    expect(opens[2].outcome).toBe("proxy");
    expect(opens[3]).toMatchObject({ verdict: null, distance_m: null });
  });

  it("carries no hash, signature, signed byte, tap id, browser id or coordinate", () => {
    const json = JSON.stringify(opens);
    expect(json).not.toMatch(/sig_secret|hash_secret|signed_bytes|tap_1|tap_2|"lat"|"lng"|"gps"/);
    expect(json).not.toMatch(/[0-9a-f]{32}/);
    expect(signedOpensFromBody({ chain: "nope" }, null)).toEqual([]);
    expect(signedOpensFromBody(null, null)).toEqual([]);
  });
});

describe("the record read carries every signed open — words only", () => {
  it("adds the opens to a whole read, keeps where the open stood against the scan, and leaks nothing", () => {
    const record = recordFromBody(PACKET)!;
    expect(record.opens?.map((o) => o.event_id)).toHaveLength(4);
    const location = record.elements.find((e) => e.element === "the_open")!.value!.location as Record<string, unknown>;
    expect(location).toEqual({ verdict: "flagged", distance_m: 2623, accuracy_m: 7, signed: false, after_carrier_scan: true });
    const json = JSON.stringify(record);
    expect(json).not.toMatch(/sig_secret|hash_secret|"lat"|"lng"|"gps"/);
    expect(json).not.toMatch(/[0-9a-f]{32}/);
  });

  it("gives the public words no opens", () => {
    const { chain: _chain, legacy_events: _legacy, ...words } = PACKET;
    expect(recordFromBody(words)?.opens).toBeUndefined();
  });
});

describe("the timeline's rows: every open the door answered, joined to its signed event", () => {
  const record = recordFromBody(PACKET)!;
  const opensBody = {
    proof_id: PACKET.proof_id,
    address: { lat: 34.0837, lng: -118.3006 },
    opens: [
      { at: "2026-09-01T10:00:00.400Z", outcome: "success", gps_verdict: "flagged", distance_m: 2623, accuracy_m: 7, lat: 34.09, lng: -118.27 },
      { at: "2026-09-01T11:00:00.300Z", outcome: "success", gps_verdict: "pass", distance_m: 40, accuracy_m: 12, lat: 34.0838, lng: -118.3005 },
      { at: "2026-09-01T12:00:00.200Z", outcome: "proxy", gps_verdict: "not_shared", distance_m: null, accuracy_m: null, lat: null, lng: null },
    ],
    capped: false,
  };

  it("keeps the scanner's visit as a row, says each open's kind, and puts the door's fix on the row for the map", () => {
    const t = timelineFrom({ proof: { enrolled_at: "2026-08-30T00:00:00Z" } }, opensBody, record)!;
    expect(t.rows?.map((r) => [r.n, r.kind, r.signed, r.lat != null])).toEqual([
      [1, "first", true, true],
      [2, "again", true, true],
      [3, "scanner", true, false],
      [4, "again", true, false],
    ]);
    // Codex's list is what it was: people's opens only.
    expect(t.opens).toHaveLength(2);
  });

  it("lists the record's signed opens in words when the door did not answer", () => {
    const t = timelineFrom({ proof: { enrolled_at: "2026-08-30T00:00:00Z", first_tap_at: "2026-09-01T10:00:00Z" } }, null, record)!;
    expect(t.rows).toHaveLength(4);
    expect(t.rows?.every((r) => r.lat == null && r.lng == null)).toBe(true);
    expect(t.opensAvailable).toBe(false);
  });
});
