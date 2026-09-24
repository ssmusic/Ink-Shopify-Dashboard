// THE AUDIT REPORT — the merchant's printed copy of an order's signed record
// (the audit machine; Into Health's "Audit Defense Report", mapped visit →
// order). Built from the merchant's packet (GET /api/proofs/:id/audit —
// nothing withheld) into a PDF: who, when and where; each element with its
// evidence level and the signed events that back it; the cryptographic
// appendix (every event's payload hash, previous hash and signature); and the
// QR that re-runs the PUBLIC verification in any browser.
//
// The words are the merchant's: opened, delivered, recorded and signed, the
// distance as data. Nothing says a delivery was confirmed, verified or seen at
// the door (Sam, 2026-09-24: "we cant confirm at door"): the signed
// DELIVERY_VERIFIED is titled by what it holds and the delivery place says its
// nearest open (lib/record-words.ts). The crypto lives in the appendix.
// Deterministic for a fixed packet.

import qrcode from "qrcode-generator";
import { buildTextPdf, wrapToken, wrapWords, type PdfLine, type PdfRect } from "./pdf-lite.server";
import { kmOrM } from "../lib/order-timeline";
import { accuracyWords, sharedOf } from "../lib/every-open";
import { DELIVERY_VERIFIED_TITLE, carrierScanOf, nearestOpenWords, type NearestCandidate, type NearestInput } from "../lib/record-words";

export type AuditEvent = {
  event_id: string | null;
  seq: number | null;
  event_type: string | null;
  timestamp: string | null;
  key_id: string;
  signature: string | null;
  payload_hash: string | null;
  prev_event_id: string | null;
  prev_payload_hash: string | null;
  signed_bytes: string | null;
  withheld: boolean;
  legacy: boolean;
};

export type AuditElement = {
  element: string;
  label: string;
  value: Record<string, unknown> | null;
  status: string;
  evidence_event_ids: string[];
};

export type AuditPacket = {
  proof_id: string;
  audience: string;
  issued_at: string;
  issuer: { name: string; alg: string; key_ids: string[]; jwks_url: string };
  summary: {
    order_number: string | null;
    merchant: string | null;
    buyer_name?: string | null;
    buyer_initials: string | null;
    buyer_tier: string | null;
    ship_to: { city: string | null; region: string | null; country: string | null; postal_code?: string | null; line1?: string | null; line2?: string | null; raw?: string | null };
    enrolled_at: string | null;
    delivered_at: string | null;
    delivery_stage: string | null;
    carrier: string | null;
    tracking_number?: string | null;
    first_open_at: string | null;
    last_open_at: string | null;
    opens: number;
    return_status: string | null;
  };
  verdict: {
    elements: AuditElement[];
    elements_complete: boolean;
    chain_integrity: { chained_events: number; chain_valid: boolean; legacy_events: number; legacy_verified: number };
  };
  chain: AuditEvent[];
  legacy_events: AuditEvent[];
};

const LEVEL_WORDS: Record<string, string> = {
  // Was "Device-verified": on the delivery place it meant the door.
  verified: "Recorded and signed",
  attested: "Recorded and signed",
  asserted: "In the record, unsigned",
  missing: "Missing",
};

const EVENT_WORDS: Record<string, string> = {
  ENROLLED: "Order enrolled",
  CARRIER_DELIVERED: "Carrier delivered",
  TAP_RECORDED: "Opened",
  DELIVERY_VERIFIED: DELIVERY_VERIFIED_TITLE,
  MEDIA_UPLOADED: "Photos attached",
  RETURN_INITIATED: "Return started",
  RETURN_LABEL_GENERATED: "Return label made",
  PASSPORT_GENERATED: "Return code issued",
  PASSPORT_SCANNED: "Return code scanned",
  RETURN_COMPLETED: "Return completed",
  RETURN_CANCELLED: "Return cancelled",
};

export function fmtDate(iso: string | null | undefined, tz = "UTC"): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// The open's location in the OPEN block's own sentences (lib/every-open.ts
// rowCaption): a distance is data, with its accuracy when the record carries
// one — never the backend's pass / near / flagged word beside it (Sam,
// 2026-09-23: "we dont judge delivery so this is weird").
export function openLocationSentence(
  loc: { verdict?: string | null; distance_m?: number | null; accuracy_m?: number | null } | null | undefined,
): string | null {
  if (!loc) return null;
  const accuracy = typeof loc.accuracy_m === "number" && Number.isFinite(loc.accuracy_m) && loc.accuracy_m >= 0 ? ` Accuracy ${accuracyWords(loc.accuracy_m)}.` : "";
  if (typeof loc.distance_m === "number" && Number.isFinite(loc.distance_m) && loc.distance_m >= 0)
    return `Opened ${kmOrM(loc.distance_m)} from the delivery address.${accuracy}`;
  if (loc.verdict === "not_shared") return "Location not shared.";
  if (sharedOf({ lat: null, lng: null, verdict: loc.verdict ?? null })) return `A location was shared, but no distance was stored.${accuracy}`;
  return null;
}

/** What the packet's signed bytes say of one moment, or null. */
function signedData(e: AuditEvent): Record<string, unknown> | null {
  if (typeof e.signed_bytes !== "string") return null;
  try {
    const data = (JSON.parse(e.signed_bytes) as { event_data?: unknown }).event_data;
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The nearest open's inputs from the packet: every signed open's and late
 *  share's own measurement, a DELIVERY_VERIFIED's own distance (a pass only —
 *  any other word on one is an old world's placeholder), and the first open's
 *  served line. */
export function nearestInputOfPacket(p: AuditPacket): NearestInput {
  const candidates: NearestCandidate[] = [];
  for (const e of [...p.chain, ...p.legacy_events]) {
    if (e.event_type !== "TAP_RECORDED" && e.event_type !== "LOCATION_SHARED" && e.event_type !== "DELIVERY_VERIFIED") continue;
    const d = signedData(e);
    if (!d) continue;
    const verdict = typeof d.gps_verdict === "string" ? d.gps_verdict : null;
    if (e.event_type === "DELIVERY_VERIFIED" && verdict !== "pass") continue;
    candidates.push({
      at: e.timestamp,
      verdict,
      distance_m: typeof d.distance_m === "number" ? d.distance_m : null,
      outcome: typeof d.tap_outcome === "string" ? d.tap_outcome : null,
    });
  }
  const open = p.verdict.elements.find((el) => el.element === "the_open");
  const loc = (open?.value as { location?: { verdict?: string; distance_m?: number | null; after_carrier_scan?: boolean | null } } | null)?.location;
  if (loc) {
    candidates.push({
      at: p.summary.first_open_at,
      verdict: loc.verdict ?? null,
      distance_m: loc.distance_m ?? null,
      after_carrier_scan: typeof loc.after_carrier_scan === "boolean" ? loc.after_carrier_scan : null,
    });
  }
  return { deliveredAt: carrierScanOf(p.verdict.elements, p.summary.delivered_at), candidates, opens: p.summary.opens ?? 0 };
}

function elementLine(el: AuditElement, tz: string, nearest: string | null = null): string {
  const v = el.value ?? {};
  const bits: string[] = [];
  if (el.element === "order" && v.order_number) bits.push(String(v.order_number));
  if (el.element === "buyer" && v.tier) bits.push(String(v.tier));
  if (el.element === "delivery_date" && v.delivered_at) bits.push(`${fmtDate(String(v.delivered_at), tz)}${v.source ? ` (${String(v.source)})` : ""}${v.signed ? " - signed" : ""}${v.mismatch ? ` - RECORD SAYS ${fmtDate(String(v.record_says), tz)}` : ""}`);
  // The door row says the nearest open, never Yes/No to a door.
  if (el.element === "delivery_place") {
    bits.push(v.geocoded ? "address on file" : "no address");
    if ("verified_at_door" in v && nearest) bits.push(`Nearest open: ${nearest}`);
  }
  if (el.element === "carrier_scan") bits.push([v.last_status, v.carrier].filter(Boolean).join(" - ") + (v.last_at ? ` - ${fmtDate(String(v.last_at), tz)}` : ""));
  if (el.element === "the_open") {
    if (v.first_open_at) bits.push(`first ${fmtDate(String(v.first_open_at), tz)}${v.first_open_signed ? " (signed)" : ""}`);
    if (v.opens != null) bits.push(`${String(v.opens)} open${Number(v.opens) === 1 ? "" : "s"}${v.signed_opens != null ? ` (${String(v.signed_opens)} signed)` : ""}`);
    const loc = v.location as { verdict?: string; distance_m?: number | null; accuracy_m?: number | null } | null | undefined;
    const words = openLocationSentence(loc);
    if (words) bits.push(words);
  }
  return bits.filter(Boolean).join(" - ");
}

/** The QR's modules as vector squares, `size` points on a side. */
export function qrRects(text: string, size: number): PdfRect[] {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / (n + 8); // a four-module quiet zone each side
  const rects: PdfRect[] = [];
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (qr.isDark(r, c)) rects.push({ x: (c + 4) * cell, y: (r + 4) * cell, w: cell + 0.2, h: cell + 0.2 });
    }
  }
  return rects;
}

export function integritySentence(p: AuditPacket): string {
  const ci = p.verdict.chain_integrity;
  const backed = p.verdict.elements.filter((e) => e.status === "verified" || e.status === "attested").length;
  const total = p.verdict.elements.length;
  if (!ci.chained_events && !ci.legacy_events) return "No signed events are on file for this order.";
  const chainWords = ci.chained_events
    ? (ci.chain_valid ? `the ${ci.chained_events}-event chain verifies` : `the ${ci.chained_events}-event chain does NOT verify`)
    : `${ci.legacy_verified} of ${ci.legacy_events} pre-chain events verify`;
  return `${backed} of ${total} elements are backed by signed events; ${chainWords}.`;
}

export function auditReportLines(p: AuditPacket, opts: { verifyUrl: string; tz?: string }): PdfLine[] {
  const tz = opts.tz ?? "UTC";
  const s = p.summary;
  const L: PdfLine[] = [];
  const push = (text: string, o: Partial<PdfLine> = {}) => L.push({ text, ...o });
  // Prose wraps to the column; the first line keeps the gap, the rest follow.
  const prose = (text: string, o: Partial<PdfLine> = {}) => {
    const size = o.size ?? 10;
    const width = Math.floor(516 / (size * 0.52));
    wrapWords(text, width).forEach((line, i) => L.push({ text: line, ...o, gap: i ? 0 : o.gap }));
  };

  push("ink - AUDIT REPORT", { font: "sans-bold", size: 9 });
  push(`Order ${s.order_number ?? "-"}${s.merchant ? ` - ${s.merchant}` : ""}`, { font: "sans-bold", size: 18, gap: 4 });
  push(`Record ${p.proof_id} - stage ${s.delivery_stage ?? "-"} - report issued ${fmtDate(p.issued_at, tz)}`, { font: "sans", size: 9, gap: 2 });

  push("WHAT THIS RECORD SUPPORTS", { font: "sans-bold", size: 9, gap: 16 });
  prose(integritySentence(p), { size: 10, gap: 4 });

  push("WHO, WHEN, AND WHERE", { font: "sans-bold", size: 9, gap: 16 });
  push(`Buyer: ${s.buyer_name ?? s.buyer_initials ?? "-"}${s.buyer_tier ? ` (${s.buyer_tier})` : ""}`, { gap: 4 });
  push(`Merchant: ${s.merchant ?? "-"}`);
  const shipTo = [s.ship_to.line1, s.ship_to.line2, [s.ship_to.city, s.ship_to.region].filter(Boolean).join(", "), s.ship_to.postal_code, s.ship_to.country].filter(Boolean).join(", ");
  push(`Ship to: ${shipTo || s.ship_to.raw || "-"}`);
  push(`Enrolled: ${fmtDate(s.enrolled_at, tz)}`);
  push(`Carrier: ${s.carrier ?? "-"}${s.tracking_number ? ` - ${s.tracking_number}` : ""}`);
  push(`Opens: ${s.opens}${s.first_open_at ? ` - first ${fmtDate(s.first_open_at, tz)}` : ""}${s.last_open_at && s.last_open_at !== s.first_open_at ? ` - last ${fmtDate(s.last_open_at, tz)}` : ""}`);
  if (s.return_status) push(`Return: ${s.return_status}`);

  push("THE SIX ELEMENTS AND THEIR EVIDENCE", { font: "sans-bold", size: 9, gap: 16 });
  prose("Each row names its evidence level and the signed events that back it. A missing reference is stated as missing.", { size: 8, gap: 2 });
  const nearest = nearestOpenWords(nearestInputOfPacket(p));
  for (const el of p.verdict.elements) {
    push(`${el.label}: ${LEVEL_WORDS[el.status] ?? el.status}`, { font: "sans-bold", gap: 6 });
    const detail = elementLine(el, tz, nearest);
    if (detail) push(`  ${detail}`, { size: 9 });
    push(`  evidence: ${el.evidence_event_ids.length ? el.evidence_event_ids.join(", ") : "none - MISSING"}`, { font: "mono", size: 8 });
  }

  push("CRYPTOGRAPHIC APPENDIX", { font: "sans-bold", size: 9, gap: 16 });
  prose(`Issuer ${p.issuer.name} - ${p.issuer.alg} - key ${p.issuer.key_ids.join(", ")} - keys published at ${p.issuer.jwks_url}`, { size: 8, gap: 2 });
  prose("Each event's payload hash is the sha256 of the exact bytes ink signed; each previous hash links it to the event before. The appendix proves the integrity of the events listed; it does not prove that no event was omitted.", { size: 8 });
  const events = [...p.chain].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  events.forEach((e) => {
    push(`Event ${e.seq ?? "-"} - ${EVENT_WORDS[e.event_type ?? ""] ?? e.event_type ?? "Event"} - ${fmtDate(e.timestamp, tz)}`, { font: "sans-bold", size: 9, gap: 6 });
    push(`  Payload hash:   ${e.payload_hash ?? "-"}`, { font: "mono", size: 7.5 });
    push(`  Previous hash:  ${e.prev_payload_hash ?? "none - first event"}`, { font: "mono", size: 7.5 });
    const sig = wrapToken(e.signature ?? "-", 64);
    push(`  Signature:      ${sig[0]}`, { font: "mono", size: 7.5 });
    for (const rest of sig.slice(1)) push(`                  ${rest}`, { font: "mono", size: 7.5 });
  });
  if (p.legacy_events.length) {
    prose(`Pre-chain events (${p.legacy_events.length}) - signed before events were linked; each verifies on its own:`, { size: 8, gap: 8 });
    for (const e of p.legacy_events) {
      push(`  ${EVENT_WORDS[e.event_type ?? ""] ?? e.event_type ?? "Event"} - ${fmtDate(e.timestamp, tz)} - hash ${e.payload_hash ?? "-"}`, { font: "mono", size: 7.5 });
    }
  }

  push("RE-RUN THE PUBLIC VERIFICATION", { font: "sans-bold", size: 9, gap: 18 });
  prose("Scan the code or open this link. The browser re-checks every hash and signature against ink's published key. The record is sealed: on the public page the buyer's location is a commitment inside the signed bytes, never the coordinates; this copy carries the revealed values beside them.", { size: 8, gap: 2 });
  push(opts.verifyUrl, { font: "mono", size: 8, gap: 2 });
  push("", { rects: qrRects(opts.verifyUrl, 96), reserve: 100, gap: 4 });
  return L;
}

export function buildAuditReportPdf(p: AuditPacket, opts: { verifyUrl: string; tz?: string }): Uint8Array {
  return buildTextPdf(auditReportLines(p, opts), { title: `ink audit report - order ${p.summary.order_number ?? p.proof_id}`, producer: "ink" });
}
