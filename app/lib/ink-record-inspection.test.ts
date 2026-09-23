import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  checkInkInspection,
  inspectionFromAudit,
} from "./ink-record-inspection";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const proof = "proof_aaaaaaaaaaaaaaaaaaaaaaaa";
const audit = {
  proof_id: proof,
  chain_head: { seq: 2, event_id: "event_second", payload_hash: sha("second") },
  chain: [
    {
      event_id: "event_first",
      seq: 1,
      event_type: "TAP_RECORDED",
      signed_bytes: "first",
      payload_hash: sha("first"),
      prev_event_id: null,
      prev_payload_hash: null,
      signature: "sensitive-signature",
      revealed: {
        gps: { lat: 34.0921, lng: -118.2681 },
        token: "private-token",
      },
    },
    {
      event_id: "event_second",
      seq: 2,
      event_type: "TAP_RECORDED",
      signed_bytes: "second",
      payload_hash: sha("second"),
      prev_event_id: "event_first",
      prev_payload_hash: sha("first"),
    },
  ],
  legacy_events: [],
};

describe("ink on-demand record inspection", () => {
  it("projects all events and person opens without leaking arbitrary revealed fields", () => {
    const inspection = inspectionFromAudit(audit, {
      opens: [
        {
          at: "2026-09-23T12:00:00Z",
          outcome: "success",
          distance_m: 719,
          accuracy_m: 35,
          lat: 34.0921,
          lng: -118.2681,
          token: "other-private-token",
        },
        { at: "2026-09-23T12:01:00Z", outcome: "proxy" },
      ],
    });
    expect(inspection?.events).toHaveLength(2);
    expect(inspection?.opens).toHaveLength(1);
    expect(inspection?.opens?.[0].distanceM).toBe(719);
    expect(inspection?.events[0].location).toEqual({
      lat: 34.0921,
      lng: -118.2681,
    });
    expect(JSON.stringify(inspection)).not.toMatch(
      /private-token|other-private-token/,
    );
  });

  it("checks hashes, links and the ledger head in the browser without claiming signature verification", async () => {
    const inspection = inspectionFromAudit(audit, null)!;
    const good = await checkInkInspection(inspection);
    expect(good).toMatchObject({
      hashesChecked: 2,
      hashFailures: 0,
      linksChecked: 2,
      linkFailures: 0,
      sequenceComplete: true,
      head: "matches",
    });
    expect(good.events.map((event) => event.hash)).toEqual([
      "matches",
      "matches",
    ]);
    const bad = await checkInkInspection({
      ...inspection,
      events: inspection.events.map((event, i) =>
        i
          ? { ...event, signedBytes: "tampered", previousHash: "wrong" }
          : event,
      ),
    });
    expect(bad).toMatchObject({ hashFailures: 1, linkFailures: 1 });
  });

  it("reconstructs complete person opens from purchased signed events when the opens door is absent", () => {
    const bytes = (
      event_type: string,
      tap_id: string,
      tap_outcome: string,
      distance_m: number | null,
    ) =>
      JSON.stringify({
        event_type,
        event_data: {
          tap_id,
          tap_outcome,
          distance_m,
          accuracy_m: 21,
          gps_verdict: distance_m == null ? "not_shared" : "near",
        },
      });
    const result = inspectionFromAudit(
      {
        proof_id: proof,
        summary: { opens: 2 },
        chain: [
          {
            event_id: "event_a",
            event_type: "TAP_RECORDED",
            timestamp: "2026-09-23T12:00:00Z",
            signed_bytes: bytes("TAP_RECORDED", "a", "success", 719),
            revealed: { gps: { lat: 34.0921, lng: -118.2681 } },
          },
          {
            event_id: "event_proxy",
            event_type: "TAP_RECORDED",
            timestamp: "2026-09-23T12:01:00Z",
            signed_bytes: bytes("TAP_RECORDED", "p", "proxy", null),
          },
          {
            event_id: "event_b",
            event_type: "TAP_RECORDED",
            timestamp: "2026-09-23T12:02:00Z",
            signed_bytes: bytes("TAP_RECORDED", "b", "success", null),
          },
          {
            event_id: "event_share",
            event_type: "LOCATION_SHARED",
            signed_bytes: JSON.stringify({
              event_data: {
                tap_id: "b",
                distance_m: 140,
                accuracy_m: 25,
                gps_verdict: "near",
              },
            }),
            revealed: { gps: { lat: 34.0922, lng: -118.2682 } },
          },
        ],
      },
      null,
    );
    expect(result?.opens).toMatchObject([
      { distanceM: 719, location: { lat: 34.0921, lng: -118.2681 } },
      { distanceM: 140, location: { lat: 34.0922, lng: -118.2682 } },
    ]);
    expect(
      inspectionFromAudit(
        { proof_id: proof, summary: { opens: 3 }, chain: [] },
        null,
      )?.opens,
    ).toBeNull();
  });
});
