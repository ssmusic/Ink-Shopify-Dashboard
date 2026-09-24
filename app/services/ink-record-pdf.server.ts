// THE RECORD AS A BANK READS IT (2026-09-24, RECORD-DISPUTE-REPORT).
//
// Shopify forwards a PDF (PDF/A, 4 MB in all, no links) and pasted text to
// the bank; the signed JSON never reaches anyone. So this page is the record
// a reviewer actually sees, and it is built for that reader:
//   · one page where it can be: the six elements; the carrier's scans with
//     its delivered place beside the ship-to, side by side, never compared;
//     the opens by time, distance and accuracy (and the checkout comparison
//     when the record carries it); the signed-event ids and the chain head;
//   · no coordinate, no hash, no signature, no buyer name, no street — the
//     hashes and signatures live in the signed JSON (chain.json), and the page
//     says where; the buyer's name and address are already on Shopify's form;
//   · no sentence that says it verifies nothing, and none that says a dispute
//     will be won. Every time is UTC; a bank reads one clock.
// The record's public address is on the last lines, as text (no link).
// Words are PLACEHOLDER; the facts are the record's. The same page is built
// by the-ritualist src/lib/order-record-pdf.ts: a record reads the same in
// ink and in The Ritualist.

import { buildTextPdf, COLUMN_W, wrapToWidth, type PdfFont, type PdfLine } from "./pdf-lite.server";
import { elementLines, LEVEL_WORDS, type RecordRead } from "../lib/record-words";
import { checkoutLines } from "../lib/checkout-words";
import type { InkInspection } from "../lib/ink-record-inspection";

type Event = {
  event_id?: unknown;
  event_type?: unknown;
  seq?: unknown;
  legacy?: unknown;
  unverifiable?: unknown;
  withheld?: unknown;
};

type Place = { city?: unknown; state?: unknown; region?: unknown; country?: unknown };

type MerchantAudit = {
  proof_id: string;
  summary?: {
    order_number?: unknown;
    merchant?: unknown;
    tracking_number?: unknown;
    ship_to?: Place;
    carrier_delivered_place?: Place | null;
  };
  chain_head?: { seq?: unknown; event_id?: unknown } | null;
  verdict?: { elements?: Array<{ element?: unknown; evidence_event_ids?: unknown }> };
  chain?: Event[];
  legacy_events?: Event[];
};

/** The carrier's scans, as the merchant's proof door serves them (ink-backend
 *  carrierJourney.js): newest first, each with its place in words. */
export type RecordJourney = {
  events?: Array<{ at?: unknown; stage?: unknown; place?: unknown; line?: unknown }>;
} | null;

const PUBLIC_SITE = "https://www.in.ink";
const JWKS_URL = "https://us-central1-inink-c76d3.cloudfunctions.net/api/.well-known/jwks.json";
const MAX_SCANS = 12;

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** "2026-09-01 20:52 UTC" — one clock for the whole page. */
export function utc(iso: unknown): string {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "not recorded";
  const d = new Date(t).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 16)} UTC`;
}

const placeWords = (p: Place | null | undefined): string | null => {
  if (!p) return null;
  const parts = [text(p.city), text(p.state) ?? text(p.region), text(p.country)].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
};

/** A distance the record page's way: "56 m", "2.6 km", "1,994 km". */
const distanceWords = (m: number) =>
  m >= 1000 ? `${(m / 1000).toLocaleString("en-US", { maximumFractionDigits: m >= 10000 ? 0 : 1 })} km` : `${Math.round(m)} m`;

const STAGE_WORDS: Record<string, string> = {
  delivered: "Delivered",
  out: "Out for delivery",
  transit: "In transit",
  shipped: "Shipped",
  pre_transit: "Label created",
  exception: "Exception",
};

export function buildInkRecordPdf(
  audit: MerchantAudit,
  record: RecordRead,
  inspection?: InkInspection,
  options: { journey?: RecordJourney; madeAt?: string } = {},
): Uint8Array {
  const lines: PdfLine[] = [];
  const push = (t: string, o: Partial<PdfLine> = {}) => lines.push({ text: t, ...o });
  const prose = (t: string, o: Partial<PdfLine> & { font?: PdfFont; size?: number } = {}) => {
    const size = o.size ?? 8.5;
    wrapToWidth(t, o.font ?? "sans", size, COLUMN_W).forEach((part, i) => push(part, { ...o, size, gap: i ? 0 : o.gap }));
  };
  const heading = (t: string) => push(t, { font: "sans-bold", size: 10, gap: 6 });
  const madeAt = options.madeAt ?? new Date().toISOString();
  const orderNumber = text(record.summary.order_number) ?? text(audit.summary?.order_number) ?? "not recorded";
  const merchant = text(audit.summary?.merchant);

  // ── Head ──
  push("ink record", { font: "sans-bold", size: 16 });
  push(`Order ${orderNumber}${merchant ? ` · ${merchant}` : ""}`, { font: "sans-bold", size: 11.5, gap: 2 });
  push(`Record ${audit.proof_id} · made ${utc(madeAt)} · every time on this page is UTC`, { size: 7.5, gap: 2 });
  prose(
    "ink's signed record of this order's tracking page, as the merchant keeps it: what the carrier reported, and each time the order's page was opened. It does not say who opened the page. Each event's exact bytes, hash and signature are in the signed JSON export (chain.json), which the merchant can supply.",
    { gap: 5 },
  );

  // ── The six elements ──
  heading("The six elements");
  for (const element of record.elements) {
    // Every time in UTC, as the page says: an ISO value is worded here, not
    // in the screen's local clock (record-words when()).
    const inUtc = { ...element, value: element.value && Object.fromEntries(Object.entries(element.value).map(([k, v]) => [k, typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? utc(v) : v])) };
    const words = elementLines(inUtc, record)
      .filter((l) => l.words && l.words !== "—")
      .map((l) => `${l.label}: ${l.words.replace(/\.$/, "")}`)
      .join("; ");
    prose(`${element.label} — ${LEVEL_WORDS[element.status] ?? element.status}${words ? `. ${words}.` : "."}`, { size: 8, gap: 1 });
  }

  // ── The carrier ──
  heading("The carrier");
  const tracking = text(audit.summary?.tracking_number);
  prose(
    `${text(record.summary.carrier) ?? "Carrier not recorded"}${tracking ? ` · tracking ${tracking}` : ""} · delivered scan ${utc(record.summary.delivered_at)}.`,
  );
  const delivered = placeWords(audit.summary?.carrier_delivered_place);
  const shipTo = placeWords(audit.summary?.ship_to);
  if (delivered || shipTo)
    prose(
      [delivered ? `The carrier's delivered scan: ${delivered}.` : null, shipTo ? `The ship-to: ${shipTo}.` : null].filter(Boolean).join("   "),
      { font: "sans-bold", gap: 1.5 },
    );
  const scans = (options.journey?.events ?? []).filter((e) => text(e.at));
  scans.slice(0, MAX_SCANS).forEach((e, i) => {
    const what = [STAGE_WORDS[String(e.stage)] ?? null, text(e.line)?.replace(/\.$/, "") ?? null].filter(Boolean);
    const said = what.length > 1 && what[0]!.toLowerCase() === what[1]!.toLowerCase() ? [what[0]] : what;
    prose(`${utc(e.at)}  ${[said.join(" — "), text(e.place)].filter(Boolean).join(" · ")}`, { size: 7.5, gap: i ? 0 : 1 });
  });
  if (scans.length > MAX_SCANS) prose(`${scans.length - MAX_SCANS} earlier scans are in the signed export.`, { size: 8 });

  // ── The opens ──
  heading("The opens");
  const opens = inspection?.opens ?? null;
  if (opens == null) prose("The open history was unavailable when this page was made.");
  else if (!opens.length) prose("No person has opened the order's page.");
  else {
    const located = opens.filter((o) => o.distanceM != null || o.accuracyM != null);
    const plain = opens.filter((o) => o.distanceM == null && o.accuracyM == null);
    prose(
      `The order's page was opened ${opens.length} ${opens.length === 1 ? "time" : "times"} by a person${inspection?.opensCapped ? " (the newest opens only)" : ""}. ${located.length} shared a location.`,
    );
    if (located.length <= 8) {
      for (const o of located) {
        const where = o.distanceM != null ? `Opened ${distanceWords(o.distanceM)} from the delivery address.` : "A location was shared; no distance was measured.";
        prose(`${utc(o.at)}  ${where}${o.accuracyM != null ? ` Accuracy ±${distanceWords(o.accuracyM)}.` : ""}`, { size: 7.5 });
      }
    } else {
      // Many located opens: the same facts, two to a line, so the page stays one page.
      prose("Each located open: its time, its distance from the delivery address, and the device's accuracy.", { size: 7.5 });
      const cells = located.map((o) => `${utc(o.at)}  ${o.distanceM != null ? distanceWords(o.distanceM) : "no distance"}${o.accuracyM != null ? ` · ±${distanceWords(o.accuracyM)}` : ""}`);
      for (let i = 0; i < cells.length; i += 2) push(cells.slice(i, i + 2).map((c) => c.padEnd(42, " ")).join(""), { font: "mono", size: 6.5 });
    }
    if (plain.length)
      prose(`Opened without a location: ${plain.map((o) => utc(o.at).replace(" UTC", "")).join(", ")}.`, { size: 7.5, gap: 1 });
  }
  if (record.checkout) for (const l of checkoutLines(record.checkout, { when: utc })) prose(`${l.label}: ${l.words}.`, { size: 8 });

  // ── The signed events ──
  heading("The signed events");
  const chained = (audit.chain ?? []).filter((e) => text(e.event_id));
  const legacy = (audit.legacy_events ?? []).filter((e) => text(e.event_id));
  const headSeq = Number(audit.chain_head?.seq);
  const headId = text(audit.chain_head?.event_id) ?? text(chained[chained.length - 1]?.event_id);
  const withheld = [...chained, ...legacy].filter((e) => e.withheld === true).length;
  const unverifiable = legacy.filter((e) => e.unverifiable === true).length;
  prose(
    `${chained.length + legacy.length} signed events: ${chained.length} linked in order, each to the one before; ${legacy.length} signed one by one before linking began.` +
      `${headId ? ` Chain head: ${headId}${Number.isFinite(headSeq) ? ` (sequence ${headSeq})` : ""}.` : ""}` +
      `${withheld ? ` ${withheld} travel without their bytes in the hand-over.` : ""}${unverifiable ? ` ${unverifiable} could not be re-checked from the stored bytes.` : ""}`,
  );
  const ids = [...chained, ...legacy].map((e) => text(e.event_id)).filter(Boolean) as string[];
  if (ids.length) prose(ids.join(", "), { font: "mono", size: 5.5, gap: 1 });

  // ── Check it ──
  heading("Check it");
  prose(
    `The record's public page: ${PUBLIC_SITE}/verify/${audit.proof_id}. ink's public key: ${JWKS_URL}. With the signed JSON export, anyone can re-check every signature without trusting ink.`,
  );

  return buildTextPdf(lines, { title: `ink record for order ${orderNumber}`, producer: "ink", date: madeAt });
}
