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

const journey = {
  events: [
    { at: "2026-09-01T20:52:00Z", stage: "delivered", place: "Los Angeles, CA", line: "Delivered" },
    { at: "2026-09-01T16:19:00Z", stage: "transit", place: "Los Angeles, CA", line: "Out For Delivery Today" },
  ],
};
const auditWithPlaces = {
  ...audit,
  summary: { ...audit.summary, tracking_number: "1Z7YV733P231833397", ship_to: { ...audit.summary.ship_to, country: "United States" }, carrier_delivered_place: { city: "Los Angeles", state: "CA", country: "United States" } },
  chain_head: { seq: 1, event_id: "event_12345678" },
};
const inspection: InkInspection = {
  proofId,
  chainHead: null,
  events: [],
  opensCapped: false,
  opens: [
    { at: "2026-09-04T18:54:00Z", distanceM: 719, accuracyM: 35, location: { lat: 34.0921, lng: -118.2681 } },
    { at: "2026-09-05T02:00:00Z", distanceM: null, accuracyM: null, location: null },
  ],
};
/** Everything the page shows, in reading order (each drawn line's text). */
const shown = (pdf: string) => [...pdf.matchAll(/\((.*?)\) Tj/g)].map((m) => m[1].replace(/\\([()\\])/g, "$1")).join(" ").replace(/\s+/g, " ");
const pdfText = () => Buffer.from(buildInkRecordPdf(auditWithPlaces, record, inspection, { journey, madeAt: "2026-09-24T22:00:00Z" })).toString("latin1");

describe("ink merchant record PDF — the record as a bank reads it", () => {
  it("is PDF/A-1b: fonts embedded, an output intent, XMP naming part 1 B, a trailer ID, a sound xref", () => {
    const pdf = pdfText();
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("/FontFile2");
    expect(pdf).not.toMatch(/\/BaseFont \/(Helvetica|Courier)/);
    expect(pdf).toContain("/OutputIntents [4 0 R]");
    expect(pdf).toContain("/S /GTS_PDFA1");
    expect(pdf).toContain("<pdfaid:part>1</pdfaid:part>");
    expect(pdf).toContain("<pdfaid:conformance>B</pdfaid:conformance>");
    expect(pdf).toMatch(/\/ID \[<[0-9a-f]{32}> <[0-9a-f]{32}>\]/);
    expect(pdf).not.toMatch(/\/URI|\/JavaScript|\/Encrypt|\/SMask/);
    const offset = Number(pdf.match(/startxref\n(\d+)\n/)?.[1]);
    expect(pdf.slice(offset, offset + 4)).toBe("xref");
    expect(pdf.length).toBeLessThan(2 * 1024 * 1024); // Shopify: 2 MB a file
  });

  it("puts the carrier's delivered place beside the ship-to, lists the scans, and times every line in UTC", () => {
    const pdf = pdfText();
    const page = shown(pdf);
    expect(page).toContain("The carrier's delivered scan: Los Angeles, CA, United States. The ship-to: Dallas, TX, United States.");
    expect(page).toContain("2026-09-01 20:52 UTC Delivered \xb7 Los Angeles, CA");
    expect(page).toContain("2026-09-04 18:54 UTC Opened 719 m from the delivery address. Accuracy \xb135 m.");
    expect(page).toContain("Opened without a location: 2026-09-05 02:00.");
    expect(pdf).toContain("event_12345678");
    expect(page).toContain("Chain head: event_12345678 (sequence 1).");
    expect(page).toContain("https://www.in.ink/verify/proof_aaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("prints no coordinate, no hash, no signature, no buyer name, no street, and no sentence that it verifies nothing", () => {
    const pdf = pdfText();
    expect(pdf).not.toMatch(/34\.09|-118\.26/);
    expect(pdf).not.toContain("a".repeat(64));
    expect(pdf).not.toContain("b".repeat(64));
    expect(pdf).not.toContain("Sample Buyer");
    expect(pdf).not.toContain("1 Sample St");
    expect(pdf).not.toContain("75201");
    expect(pdf).not.toMatch(/does not independently verify|flagged|outside|default range|win the dispute|will win|accepted by/i);
  });
});
