import {
  buildTextPdf,
  wrapToken,
  wrapWords,
  type PdfLine,
} from "./pdf-lite.server";
import { DELIVERY_VERIFIED_TITLE, elementLines, LEVEL_WORDS, when, type RecordRead } from "../lib/record-words";
import type { InkInspection } from "../lib/ink-record-inspection";

type Event = {
  event_id?: unknown;
  event_type?: unknown;
  timestamp?: unknown;
  seq?: unknown;
  key_id?: unknown;
  payload_hash?: unknown;
  prev_event_id?: unknown;
  prev_payload_hash?: unknown;
  signature?: unknown;
  legacy?: unknown;
  unverifiable?: unknown;
  withheld?: unknown;
};

type MerchantAudit = {
  proof_id: string;
  summary?: {
    order_number?: unknown;
    merchant?: unknown;
    buyer_name?: unknown;
    ship_to?: {
      line1?: unknown;
      line2?: unknown;
      city?: unknown;
      region?: unknown;
      postal_code?: unknown;
      country?: unknown;
    };
  };
  verdict?: {
    elements?: Array<{ element?: unknown; evidence_event_ids?: unknown }>;
  };
  chain?: Event[];
  legacy_events?: Event[];
};

const short = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : "Not recorded";
const eventName = (value: unknown) => {
  if (typeof value !== "string") return "Event";
  const known: Record<string, string> = {
    TAP_RECORDED: "Opened",
    LOCATION_SHARED: "Location shared",
    ENROLLED: "Recorded",
    CARRIER_DELIVERED: "Carrier delivered",
    DELIVERY_VERIFIED: DELIVERY_VERIFIED_TITLE,
  };
  if (known[value]) return known[value];
  const words = value.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** A readable merchant copy. The signed bytes and signed manifest remain in JSON. */
export function buildInkRecordPdf(
  audit: MerchantAudit,
  record: RecordRead,
  inspection?: InkInspection,
): Uint8Array {
  const lines: PdfLine[] = [];
  const push = (text: string, options: Partial<PdfLine> = {}) =>
    lines.push({ text, ...options });
  const prose = (text: string, options: Partial<PdfLine> = {}) => {
    wrapWords(text, 95).forEach((part, index) =>
      push(part, { ...options, gap: index ? 0 : options.gap }),
    );
  };
  const token = (label: string, value: unknown) => {
    push(label, { size: 9, gap: 2 });
    wrapToken(short(value), 64).forEach((part) =>
      push(part, { font: "mono", size: 8 }),
    );
  };

  push("ink record", { font: "sans-bold", size: 18 });
  push(`Order ${short(record.summary.order_number)}`, {
    font: "sans-bold",
    size: 13,
    gap: 5,
  });
  push(`Record ${audit.proof_id}`, { font: "mono", size: 9, gap: 3 });
  push(`PDF made ${when(new Date().toISOString())}`, { size: 9, gap: 2 });
  prose(
    "This document presents the merchant record reported by ink. It does not independently verify signatures or hashes. Download the JSON file for the signed manifest and exact event bytes.",
    { size: 9, gap: 10 },
  );

  push("Order activity", { font: "sans-bold", size: 12, gap: 17 });
  if (typeof audit.summary?.merchant === "string")
    prose(`Merchant: ${audit.summary.merchant}`);
  if (typeof audit.summary?.buyer_name === "string")
    prose(`Buyer: ${audit.summary.buyer_name}`);
  const ship = audit.summary?.ship_to;
  if (ship) {
    const address = [
      ship.line1,
      ship.line2,
      ship.city,
      ship.region,
      ship.postal_code,
      ship.country,
    ]
      .filter(
        (part): part is string => typeof part === "string" && !!part.trim(),
      )
      .join(", ");
    if (address) prose(`Delivery address: ${address}`, { size: 9 });
  }
  push(`Recorded: ${when(record.summary.enrolled_at)}`);
  push(`Delivered: ${when(record.summary.delivered_at)}`);
  push(`Carrier: ${short(record.summary.carrier)}`);
  push(`First open: ${when(record.summary.first_open_at)}`);
  push(
    `Opens: ${record.summary.opens == null ? "Unavailable" : record.summary.opens}`,
  );

  push("What the record contains", { font: "sans-bold", size: 12, gap: 17 });
  record.elements.forEach((element) => {
    push(
      `${element.label}: ${LEVEL_WORDS[element.status] || "Unknown"}`,
      { font: "sans-bold", size: 10, gap: 9 },
    );
    for (const line of elementLines(element, record))
      prose(`${line.label}: ${line.words}`, { size: 9, gap: 2 });
    const ids = audit.verdict?.elements?.find(
      (item) => item.element === element.element,
    )?.evidence_event_ids;
    if (Array.isArray(ids))
      prose(
        `Event references: ${ids.length ? ids.filter((id): id is string => typeof id === "string").join(", ") : "None"}`,
        { size: 8, gap: 2 },
      );
  });

  push("Open history", { font: "sans-bold", size: 12, gap: 17 });
  if (inspection?.opens == null)
    push("Detailed open history was unavailable from the merchant service.", {
      size: 9,
      gap: 3,
    });
  else if (!inspection.opens.length)
    push("No person opens were supplied by the merchant service.", {
      size: 9,
      gap: 3,
    });
  else
    inspection.opens.forEach((open, index) => {
      push(`Open ${index + 1}: ${when(open.at)}`, {
        font: "sans-bold",
        size: 10,
        gap: 9,
      });
      push(
        open.distanceM == null
          ? "Distance unavailable"
          : `${Math.round(open.distanceM)} m from the delivery address`,
        { size: 9 },
      );
      if (open.accuracyM != null)
        push(`Location accuracy: ${Math.round(open.accuracyM)} m`, { size: 9 });
      if (open.location)
        push(
          `Location shared: ${open.location.lat.toFixed(4)}, ${open.location.lng.toFixed(4)}`,
          { size: 9 },
        );
    });
  if (inspection?.opensCapped)
    push(
      "The merchant service limited the open history returned for this order.",
      { size: 9, gap: 4 },
    );

  const events = [
    ...(Array.isArray(audit.chain) ? audit.chain : []),
    ...(Array.isArray(audit.legacy_events) ? audit.legacy_events : []),
  ];
  push("Recorded events", { font: "sans-bold", size: 12, gap: 17 });
  push(
    `${events.length} event${events.length === 1 ? "" : "s"} reported by ink`,
    { size: 9, gap: 3 },
  );
  for (const event of events) {
    push(
      `${eventName(event.event_type)}${event.legacy === true ? " (earlier event)" : ""}`,
      { font: "sans-bold", size: 10, gap: 10 },
    );
    push(`Time: ${when(event.timestamp)}`, { size: 9 });
    token("Event ID", event.event_id);
    if (Number.isSafeInteger(event.seq))
      push(`Sequence: ${event.seq}`, { size: 9 });
    push(`Key ID: ${short(event.key_id)}`, { size: 9 });
    if (event.unverifiable === true)
      prose(
        "This earlier event could not be re-verified from the stored bytes.",
        { size: 9 },
      );
    if (event.withheld === true)
      prose("Signed bytes were withheld in this response.", { size: 9 });
    token("Payload hash", event.payload_hash);
    if (event.prev_event_id) token("Previous event ID", event.prev_event_id);
    token("Previous hash", event.prev_payload_hash);
    token("Signature supplied by ink", event.signature);
  }
  if (!events.length)
    push("No signed events were supplied.", { size: 9, gap: 4 });
  return buildTextPdf(lines, {
    title: `ink record for order ${short(record.summary.order_number)}`,
    producer: "ink",
  });
}
