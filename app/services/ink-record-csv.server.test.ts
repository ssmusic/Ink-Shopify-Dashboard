import { describe, expect, it } from "vitest";
import { buildInkRecordCsv } from "./ink-record-csv.server";
import type { RecordRead } from "../lib/record-words";
import type { InkInspection } from "../lib/ink-record-inspection";

describe("ink merchant record CSV", () => {
  it("lists the evidence, every event and open while neutralizing spreadsheet formulas", () => {
    const record: RecordRead = {
      locked: false,
      summary: { order_number: '=HYPERLINK("bad")', opens: 1 },
      elements: [
        {
          element: "the_open",
          label: "The open",
          status: "verified",
          value: {
            opens: 1,
            location: { verdict: "flagged", distance_m: 719 },
          },
        },
      ],
    };
    const inspection: InkInspection = {
      proofId: "proof_aaaaaaaaaaaaaaaaaaaaaaaa",
      chainHead: null,
      opensCapped: false,
      opens: [
        {
          at: "2026-09-23T12:00:00Z",
          distanceM: 719,
          accuracyM: 35,
          location: null,
        },
      ],
      events: [
        {
          id: "event_12345678",
          type: "TAP_RECORDED",
          at: null,
          sequence: 1,
          legacy: false,
          keyId: "key_001",
          payloadHash: "a",
          previousEventId: null,
          previousHash: null,
          signature: "b",
          signedBytes: "not exported in CSV",
          unverifiable: false,
          location: null,
        },
      ],
    };
    const csv = buildInkRecordCsv(record, inspection);
    expect(csv).toContain("'" + "=HYPERLINK");
    expect(csv).toContain("719 m from the delivery address");
    expect(csv).toContain('"Event","event_12345678","Payload hash","a"');
    expect(csv).not.toContain("not exported in CSV");
    expect(csv).not.toContain("flagged");
  });
});
