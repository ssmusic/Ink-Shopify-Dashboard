// THE AUDIT REPORT — built from a merchant packet into a PDF.
//
// What these pin:
//   1. The report says what the record supports, names each element's level
//      and evidence, lists every event's hash, previous hash and signature,
//      and carries the public verify URL and a QR of it.
//   2. Deterministic: the same packet produces byte-identical PDFs.
//   3. The bytes are a PDF: header, xref offsets that point at the objects,
//      one content stream per page, trailer.
//   4. A missing evidence reference is stated as MISSING, never invented.
import { describe, expect, it } from "vitest";
import { auditReportLines, buildAuditReportPdf, integritySentence, qrRects, type AuditPacket } from "./audit-report.server";

function packet(over: Partial<AuditPacket> = {}): AuditPacket {
  const ev = (seq: number, type: string, prev: string | null) => ({
    event_id: `evt_${seq}`, seq, event_type: type, timestamp: `2026-09-1${seq}T18:00:00.000Z`, key_id: "key_001",
    signature: "ab".repeat(64), payload_hash: `${seq}`.repeat(64).slice(0, 64), prev_event_id: prev ? `evt_${seq - 1}` : null, prev_payload_hash: prev, signed_bytes: "{}", withheld: false, legacy: false,
  });
  return {
    proof_id: "proof_" + "a".repeat(24), audience: "merchant", issued_at: "2026-09-19T20:00:00.000Z",
    issuer: { name: "ink", alg: "ed25519", key_ids: ["key_001"], jwks_url: "/.well-known/jwks.json" },
    summary: { order_number: "#1042", merchant: "Goodr", buyer_name: "Maya Chen", buyer_initials: "MC", buyer_tier: "returning", ship_to: { city: "Los Angeles", region: "CA", country: "US", postal_code: "90026", line1: "123 Hidden St" }, enrolled_at: "2026-09-11T18:00:00.000Z", delivered_at: "2026-09-12T18:00:00.000Z", delivery_stage: "delivered", carrier: "usps", tracking_number: "9400111", first_open_at: "2026-09-13T18:00:00.000Z", last_open_at: null, opens: 1, return_status: null },
    verdict: {
      elements: [
        { element: "order", label: "Order", value: { order_number: "#1042" }, status: "attested", evidence_event_ids: ["evt_1"] },
        { element: "buyer", label: "Buyer", value: { tier: "returning" }, status: "attested", evidence_event_ids: ["evt_1"] },
        { element: "delivery_date", label: "Delivery date", value: { delivered_at: "2026-09-12T18:00:00.000Z", source: "carrier" }, status: "attested", evidence_event_ids: ["evt_2"] },
        { element: "delivery_place", label: "Delivery place", value: { geocoded: true, verified_at_door: false }, status: "attested", evidence_event_ids: ["evt_1"] },
        { element: "carrier_scan", label: "Carrier scan", value: { last_status: "DELIVERED", carrier: "usps", last_at: "2026-09-12T18:00:00.000Z" }, status: "attested", evidence_event_ids: ["evt_2"] },
        { element: "the_open", label: "The open", value: { first_open_at: "2026-09-13T18:00:00.000Z", opens: 1, location: { verdict: "not_shared", distance_m: null } }, status: "verified", evidence_event_ids: ["evt_3"] },
      ],
      elements_complete: true,
      chain_integrity: { chained_events: 3, chain_valid: true, legacy_events: 0, legacy_verified: 0 },
    },
    chain: [ev(1, "ENROLLED", null), ev(2, "CARRIER_DELIVERED", "1".repeat(64)), ev(3, "TAP_RECORDED", "2".repeat(64))],
    legacy_events: [],
    ...over,
  };
}
const URL = "https://www.in.ink/verify/proof_" + "a".repeat(24);

describe("auditReportLines", () => {
  it("says what the record supports, each element's level and evidence, every event's hashes and signature, and the verify link", () => {
    const text = auditReportLines(packet(), { verifyUrl: URL }).map((l) => l.text).join("\n");
    expect(text).toContain("AUDIT REPORT");
    expect(text).toContain("Order #1042 - Goodr");
    expect(text).toContain("6 of 6 elements are backed by signed events; the 3-event chain verifies.");
    expect(text).toContain("Buyer: Maya Chen (returning)");
    expect(text).toContain("Ship to: 123 Hidden St, Los Angeles, CA, 90026, US");
    expect(text).toContain("The open: Device-verified");
    expect(text).toContain("location not shared by the buyer");
    expect(text).toContain("evidence: evt_3");
    expect(text).toContain("Delivery date: Recorded and signed");
    expect(text).toContain("Event 2 - Carrier delivered");
    expect(text).toContain(`Payload hash:   ${"2".repeat(64)}`);
    expect(text).toContain(`Previous hash:  ${"1".repeat(64)}`);
    expect(text).toContain("Previous hash:  none - first event");
    expect(text).toContain("Signature:      " + "ab".repeat(32));
    expect(text).toContain(URL);
    expect(text).toContain("withheld on the public page");
  });

  it("a missing reference is stated, never invented; a broken chain is said", () => {
    const p = packet();
    p.verdict.elements[2] = { ...p.verdict.elements[2], status: "asserted", evidence_event_ids: [] };
    p.verdict.chain_integrity.chain_valid = false;
    const text = auditReportLines(p, { verifyUrl: URL }).map((l) => l.text).join("\n");
    expect(text).toContain("Delivery date: In the record, unsigned");
    expect(text).toContain("evidence: none - MISSING");
    expect(integritySentence(p)).toBe("5 of 6 elements are backed by signed events; the 3-event chain does NOT verify.");
    expect(integritySentence({ ...p, verdict: { ...p.verdict, chain_integrity: { chained_events: 0, chain_valid: false, legacy_events: 0, legacy_verified: 0 } } })).toBe("No signed events are on file for this order.");
  });

  it("carries a QR of the verify link as vector squares", () => {
    const qr = auditReportLines(packet(), { verifyUrl: URL }).find((l) => l.rects?.length);
    expect(qr).toBeTruthy();
    expect(qr!.rects!.length).toBeGreaterThan(200);
    expect(qr!.reserve).toBeGreaterThan(90);
    const a = qrRects(URL, 96);
    const b = qrRects(URL, 96);
    expect(a).toEqual(b);
    expect(qrRects("https://www.in.ink/verify/proof_" + "b".repeat(24), 96)).not.toEqual(a);
  });
});

describe("buildAuditReportPdf", () => {
  const latin1 = (b: Uint8Array) => Array.from(b).map((x) => String.fromCharCode(x)).join("");

  it("is a PDF whose xref offsets point at its objects, deterministic for a packet", () => {
    const a = buildAuditReportPdf(packet(), { verifyUrl: URL });
    const b = buildAuditReportPdf(packet(), { verifyUrl: URL });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const s = latin1(a);
    expect(s.startsWith("%PDF-1.4\n")).toBe(true);
    expect(s.endsWith("%%EOF\n")).toBe(true);
    const xrefAt = Number(s.match(/startxref\n(\d+)\n/)![1]);
    expect(s.slice(xrefAt, xrefAt + 4)).toBe("xref");
    const offsets = [...s.slice(xrefAt).matchAll(/^(\d{10}) 00000 n /gm)].map((m) => Number(m[1]));
    expect(offsets.length).toBeGreaterThan(8);
    offsets.forEach((off, i) => expect(s.slice(off, off + 8)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    expect((s.match(/\/Type \/Page /g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(s).toContain("/Title (ink audit report - order #1042)");
    expect(s).toContain(" re f");
  });
});

it("wraps prose to the column and keeps the section gap on the first line only", () => {
  const lines = auditReportLines(packet(), { verifyUrl: URL });
  const long = lines.filter((l) => (l.size ?? 10) === 8 && !l.font);
  expect(long.every((l) => l.text.length <= 130)).toBe(true);
  const i = lines.findIndex((l) => l.text.startsWith("Each event's payload hash"));
  expect(i).toBeGreaterThan(0);
  expect(lines[i + 1].gap ?? 0).toBe(0);
});
