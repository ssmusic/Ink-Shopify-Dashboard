import { describe, expect, it } from "vitest";
import { buildInkRecordPdf } from "./ink-record-pdf.server";
import type { RecordRead } from "../lib/record-words";
import type { InkInspection } from "../lib/ink-record-inspection";

const proofId = "proof_aaaaaaaaaaaaaaaaaaaaaaaa";
const record: RecordRead = {
  locked: false,
  summary: {
    order_number: "#1026",
    enrolled_at: "2026-09-04T18:46:00Z",
    delivered_at: "2026-09-01T20:52:00Z",
    first_open_at: "2026-09-04T18:54:00Z",
    opens: 1,
    carrier: "UPS",
  },
  elements: [
    {
      element: "the_open",
      label: "The open",
      status: "verified",
      value: { opens: 1, location: { verdict: "flagged", distance_m: 719 } },
    },
  ],
};
const audit = {
  proof_id: proofId,
  summary: {
    merchant: "Test store",
    buyer_name: "Sample Buyer",
    ship_to: {
      line1: "1 Sample St",
      city: "Dallas",
      region: "TX",
      postal_code: "75201",
    },
  },
  verdict: {
    elements: [{ element: "the_open", evidence_event_ids: ["event_12345678"] }],
  },
  chain: [
    {
      event_id: "event_12345678",
      event_type: "TAP_RECORDED",
      timestamp: "2026-09-04T18:54:00Z",
      seq: 1,
      key_id: "key_001",
      payload_hash: "a".repeat(64),
      prev_payload_hash: null,
      signature: "b".repeat(128),
    },
  ],
  legacy_events: [],
};

describe("ink merchant record PDF", () => {
  it("renders a readable PDF with complete event references and neutral location words", () => {
    const inspection: InkInspection = {
      proofId,
      chainHead: null,
      events: [],
      opensCapped: false,
      opens: [
        {
          at: "2026-09-04T18:54:00Z",
          distanceM: 719,
          accuracyM: 35,
          location: { lat: 34.0921, lng: -118.2681 },
        },
      ],
    };
    const bytes = buildInkRecordPdf(audit, record, inspection);
    const pdf = Buffer.from(bytes).toString("latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("(ink record) Tj");
    expect(pdf).toContain("(Order #1026) Tj");
    expect(pdf).toContain("(Buyer: Sample Buyer) Tj");
    expect(pdf).toContain("(Location: 719 m from the delivery address) Tj");
    expect(pdf).toContain("(Event references: event_12345678) Tj");
    expect(pdf).toContain("(Payload hash) Tj");
    expect(pdf).toContain("(Open 1: Sep 4, 2026");
    expect(pdf).toContain("(719 m from the delivery address) Tj");
    expect(pdf).toContain("(Signature supplied by ink) Tj");
    expect(pdf).toContain("does not independently verify");
    expect(pdf).toContain("signatures or hashes");
    expect(pdf).not.toMatch(
      /flagged|outside|default range|public verification/,
    );
    const offset = Number(pdf.match(/startxref\n(\d+)\n/)?.[1]);
    expect(pdf.slice(offset, offset + 4)).toBe("xref");
  });
});
