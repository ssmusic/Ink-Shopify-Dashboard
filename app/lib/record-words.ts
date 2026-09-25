// THE RECORD, IN WORDS — what an order's record says, printed inside ink's
// app. The merchant sees the whole record (ink-backend #129), read through the
// merchant door with the shop's own key (services/ink-record.server.ts); the
// price buys the hand-over (lib/record-handover.ts). The words of the levels,
// values and opens are Codex's (4022900), as Sam chose on 2026-09-23; the
// signed events and the checks carry #137's words.
//
// NOTHING SAYS CONFIRMED AT THE DOOR (Sam, 2026-09-24 01:10Z: "we cant
// confirm at door"). The signed DELIVERY_VERIFIED — minted when an open lands
// within 100 m after the carrier's delivered scan — and the record's
// `verified` level stay data; no word here says a delivery was confirmed,
// verified or seen at the door. The `verified` level reads as the attested
// one; the event is titled by what it holds (DELIVERY_VERIFIED_TITLE); the
// delivery place's door row says its nearest open (nearestOpenWords), in the
// record page's own sentences (the-ritualist src/lib/audit-packet.ts).

import type { AddressState } from "./delivery-point";
import type { CheckoutVsOpens } from "./checkout-words";
import { distanceWords, type RecordOpen } from "./every-open";
import { deliverySource, kmOrM } from "./order-timeline";

export type RecordElement = {
  element: string;
  label: string;
  status: string;
  value: Record<string, unknown> | null;
};

export type RecordSummary = {
  order_number?: string | null;
  buyer_initials?: string | null;
  enrolled_at?: string | null;
  delivered_at?: string | null;
  delivery_stage?: string | null;
  carrier?: string | null;
  first_open_at?: string | null;
  last_open_at?: string | null;
  opens?: number | null;
  /** Which fact the delivery point is (lib/delivery-point.ts): none ·
   *  ungeocoded · geocoded. Absent from a backend before 2026-09-24. */
  address_state?: AddressState | null;
};

/** One browser an order was opened from, in words (ink-backend
 *  utils/auditPacket.js browsers, 2026-09-23): its short name by first
 *  appearance, the device family its opens arrived with, its opens, and
 *  whether it first appeared at or after the carrier's delivered scan. The
 *  browser's id never reaches the app: the record read keeps only these. */
export type RecordBrowser = {
  label: string;
  device: string | null;
  opens: number;
  first_open_at: string | null;
  last_open_at: string | null;
  first_seen_after_delivered_scan: boolean | null;
};

/** The browsers the opens came from; opens with no id are browser unknown. */
export type RecordBrowsers = { count: number; unknown_opens: number; list: RecordBrowser[] };

/** One signed event, in words: its place in the chain, what it was, when,
 *  and what the check found. */
export type RecordEvent = {
  seq: number | null;
  event_id: string | null;
  type: string;
  at: string | null;
  check: string;
  legacy: boolean;
};

/** The checks, in words. */
export type RecordChecks = { sound: boolean; headline: string; lines: string[] };

export type RecordRead = {
  summary: RecordSummary;
  elements: RecordElement[];
  /** The public words of a priced record: its proof is behind the purchase key. */
  locked: boolean;
  /** The checkout beside the opens (lib/checkout-words.ts) — present only when
   *  the backend's words carry it (its CHECKOUT_DETAILS_ENABLED switch). */
  checkout?: CheckoutVsOpens;
  /** The browsers the opens came from (absent from a backend before 2026-09-23). */
  browsers?: RecordBrowsers | null;
  /** Read whole, through the merchant door with the shop's own key. */
  whole?: boolean;
  /** Every signed event, in words (whole reads only). */
  events?: RecordEvent[];
  /** The checks against the published key (whole reads only); null when none ran. */
  checks?: RecordChecks | null;
  /** The hand-over's price while it is for sale; null when bought or free. */
  forSale?: { price_cents: number; currency: string } | null;
  /** Every signed open, in words (whole reads only; lib/every-open.ts). */
  opens?: RecordOpen[];
};

/** The hand-over is the merchant's — bought, or free (lib/record-handover.ts).
 *  Only a whole read (the merchant door) can say so: its price is gone once
 *  bought, and absent when free. The public words of a priced record never do. */
export function recordDownloadsAvailable(record: RecordRead | null | undefined): boolean {
  return record?.whole === true && !record.forSale;
}

export const LEVEL_WORDS: Record<string, string> = {
  // Was "Verified by ink": on the delivery place it meant the door.
  verified: "Recorded and signed",
  attested: "Recorded and signed",
  asserted: "Not verified by ink",
  missing: "Missing",
};

export const VALUE_WORDS: Record<string, string> = {
  order_number: "Order",
  enrolled_at: "Recorded",
  tier: "Buyer",
  delivered_at: "Delivered",
  source: "Source",
  signed: "Signed",
  geocoded: "Address on file",
  // The key stays the record's; its row says the nearest open instead.
  // ⚠️ PLACEHOLDER COPY — the label is Sam's to replace.
  verified_at_door: "Nearest open",
  last_status: "Last scan",
  // The backend's last_tracking_updated_at: when the tracking last changed —
  // the number added at fulfilment, or a later scan. "Scanned" claimed a scan
  // that had not happened (ink review store, 2026-09-25). ⚠️ PLACEHOLDER.
  last_at: "Tracking updated",
  carrier: "Carrier",
  signed_delivered_at: "Delivered (signed)",
  first_open_at: "First opened",
  first_open_signed: "First open signed",
  opens: "Opens",
  signed_opens: "Signed opens",
  non_human_opens: "Excluded opens",
  location: "Location",
  // The Delivery place's two places, side by side as the record's words
  // (ink-backend #149/#150/#153, 2026-09-24) — the same labels as
  // the-ritualist src/lib/audit-packet.ts: a record reads the same in ink
  // and in The Ritualist. ⚠️ PLACEHOLDER COPY — Sam's to replace.
  ship_to: "Ship-to",
  carrier_delivered_place: "Carrier's delivered scan",
};

type LocationLine = {
  verdict?: string;
  distance_m?: number | null;
  later_share?: LocationLine | null;
};

export function when(iso: unknown): string {
  if (typeof iso !== "string" || !iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

// One measurement per line: a word and a distance printed together always
// come from the same signed moment.
export function locationWords(loc: LocationLine): string {
  if (loc.verdict === "not_shared") return "Location not shared";
  if (loc.verdict === "imprecise")
    return "Location accuracy too low to measure";
  if (loc.verdict === "unmeasured") return "Distance unavailable";
  if (
    typeof loc.distance_m === "number" &&
    Number.isFinite(loc.distance_m) &&
    loc.distance_m >= 0
  )
    // As the app prints every distance ("1,994 km"), never raw metres
    // ("1993799 m", audit 2026-09-25).
    return `${distanceWords(loc.distance_m)} from the delivery address`;
  return "Distance unavailable";
}

export function valueWords(key: string, v: unknown): string {
  if (v == null) return "—";
  // A place (the Delivery place's ship-to and carrier's delivered scan) in
  // words, whichever shape the backend serves it in: a line, or its parts
  // (ink-backend #149/#150 served the parts until #153).
  if ((key === "ship_to" || key === "carrier_delivered_place") && typeof v === "object") {
    const p = v as { city?: unknown; state?: unknown; region?: unknown; country?: unknown };
    const parts = [p.city, p.state ?? p.region, p.country].filter((x) => typeof x === "string" && x.trim());
    return parts.length ? parts.join(", ") : "—";
  }
  if (key === "location" && typeof v === "object")
    return locationWords(v as LocationLine);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return when(v);
  if (key === "last_status" || key === "source") {
    const word = String(v).replace(/_/g, " ").toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  return String(v);
}

/** Each value of an element as a labelled line; a later share gets its own.
 *  The delivery place's door row (`verified_at_door`) says the record's
 *  nearest open — never Yes or No to a door; without the record to read it
 *  from, the row is left out. */
export function elementLines(
  el: RecordElement,
  record?: RecordRead | null,
): { label: string; words: string }[] {
  const lines: { label: string; words: string }[] = [];
  for (const [k, v] of Object.entries(el.value ?? {})) {
    if (k === NEAREST_OPEN_KEY) {
      if (record) lines.push({ label: VALUE_WORDS[k], words: nearestOpenWords(nearestInputOf(record)) });
      continue;
    }
    lines.push({ label: VALUE_WORDS[k] ?? k, words: valueWords(k, v) });
    const later =
      k === "location" && v && typeof v === "object"
        ? (v as LocationLine).later_share
        : null;
    // PLACEHOLDER copy — the page's own label for a later open's share.
    if (later)
      lines.push({ label: "Later share", words: locationWords(later) });
  }
  return lines;
}

/** The order row's location word: what the open's location says, in one phrase. */
export function locationWordOf(record: RecordRead | null | undefined): string {
  const open = record?.elements.find((e) => e.element === "the_open");
  const loc = (open?.value as { location?: LocationLine } | null)?.location;
  if (!loc?.verdict) return record ? "—" : "";
  return locationWords(loc);
}

// ── The browsers (2026-09-23) ────────────────────────────────────────────
// The-ritualist's own line (src/lib/audit-packet.ts browsersLine), copied so
// the app and the record page say one line — the same fixtures pin both.

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
function ordinal(i: number): string {
  return ORDINALS[i] ?? `${i + 1}th`;
}
function joinWords(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The browsers in one line: how many, each one's device and opens, the
 *  opens no browser id came with, and which browsers were first seen after
 *  the carrier's delivered scan. Null when the record has counted no browser
 *  yet (every open came before the id, or none came).
 *  PLACEHOLDER copy — Sam's words replace it. */
export function browsersLine(browsers: RecordBrowsers | null | undefined): string | null {
  const list = Array.isArray(browsers?.list) ? browsers!.list : [];
  if (!list.length) return null;
  const unknown = Number.isInteger(browsers?.unknown_opens) ? (browsers!.unknown_opens as number) : 0;
  const parts = list.map((b) => `${b.device ?? "a browser"} ×${b.opens}`);
  if (unknown > 0) parts.push(`browser unknown ×${unknown}`);
  const head = `Opened from ${list.length} browser${list.length === 1 ? "" : "s"}: ${parts.join(", ")}.`;
  const after = list.map((b, i) => (b.first_seen_after_delivered_scan === true ? i : -1)).filter((i) => i >= 0);
  if (!after.length) return head;
  if (after.length === list.length) {
    return `${head} ${list.length === 1 ? "It was" : `All ${list.length} were`} first seen after the carrier's delivered scan.`;
  }
  return `${head} The ${joinWords(after.map(ordinal))} ${after.length === 1 ? "was" : "were"} first seen after the carrier's delivered scan.`;
}

/** How many times the order's tracking link was opened. */
export function opensOf(record: RecordRead | null | undefined): number | null {
  const n = record?.summary?.opens;
  return typeof n === "number" ? n : null;
}

// ── The signed events and the checks, in words ─────────────────────────────
// The record page's words (the-ritualist src/pages/VerifyRecord.tsx EVENT_WORDS,
// src/lib/verify-record.ts headlineFor/signaturesWords/linksWords), said of
// the published key rather than of a browser: here the app ran the checks.

/** The title of a signed DELIVERY_VERIFIED: what it holds — an open's
 *  location and its distance from the delivery address — never that a
 *  delivery was confirmed. The record page's spelling (the-ritualist
 *  src/lib/audit-packet.ts DELIVERY_VERIFIED_TITLE); every ink screen and
 *  file that titles the event reads this one.
 *  ⚠️ PLACEHOLDER COPY — Sam's words replace it. */
export const DELIVERY_VERIFIED_TITLE = "Distance recorded";

export const EVENT_WORDS: Record<string, string> = {
  ENROLLED: "Order recorded",
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

/** What the check found of one event's signature, in words. */
export const SIGNATURE_WORDS: Record<string, string> = {
  verified: "verified",
  failed: "does not verify",
  withheld: "withheld",
  "no-key": "no published key",
  unverifiable: "not re-verifiable",
};

/** The one word for an event the check did not run over. */
export const NOT_CHECKED = "not checked";

/** The shape of a finished check, as the words need it. */
export type CheckCounts = {
  signatures: { verified: number; failed: number; withheld: number; no_key: number; checkable: number };
  links: { verified: number; failed: number };
  sequence_dense: boolean;
  legacy: { verified: number; failed: number; withheld: number; unverifiable: number };
  keys_used: string[];
  head: "matches" | "cut" | "ahead" | "unknown";
  sound: boolean;
};

/** The checks in words: one headline and the two lines beneath it. */
export function checkWords(check: CheckCounts): RecordChecks {
  const s = check.signatures;
  const l = check.legacy;
  const chained = s.checkable + s.withheld;
  const legacy = l.verified + l.failed + l.withheld + l.unverifiable;
  let headline: string;
  if (!chained && !legacy) headline = "Nothing to check.";
  else if (!check.sound) headline = "This record does not check out.";
  else {
    const parts: string[] = [];
    if (chained) parts.push(`${s.verified} of ${s.checkable} signatures verified`);
    if (check.links.verified) parts.push("every link intact");
    if (s.withheld) parts.push(`${s.withheld} withheld`);
    if (l.verified) parts.push(`${l.verified} of ${l.verified + l.failed} pre-chain signatures verified`);
    if (l.withheld) parts.push(`${l.withheld} pre-chain withheld`);
    if (l.unverifiable) parts.push(`${l.unverifiable} pre-chain not re-verifiable`);
    headline = !s.checkable && !l.verified
      ? `Nothing verifiable here: ${parts.join(" · ")}.`
      : `Checked against the published key: ${parts.join(" · ")}.`;
  }
  const lines: string[] = [];
  if (chained) {
    const against = check.keys_used.length ? check.keys_used.join(", ") : "no published key";
    lines.push(`Signatures: ${s.verified} of ${s.checkable} verified against ${against}${s.withheld ? ` · ${s.withheld} withheld` : ""}${s.failed ? ` · ${s.failed} failed` : ""}${s.no_key ? ` · ${s.no_key} with no published key` : ""}`);
    lines.push(`Hash links: ${check.links.verified} of ${check.links.verified + check.links.failed} intact${check.sequence_dense ? " · sequence complete" : " · sequence has a gap"}${check.head === "matches" ? " · matches the ledger's head" : check.head === "cut" ? " · SHORTER than the ledger's head" : ""}`);
  } else if (legacy) {
    lines.push("Signatures: no chained signatures yet — the pre-chain events are checked one by one");
  }
  return { sound: check.sound, headline, lines };
}

/** The checks when the published key did not load: nothing was checked. */
export const UNCHECKED: RecordChecks = { sound: false, headline: "Not checked: the published key did not load.", lines: [] };

/** An event type in words; an unknown type is said as it is, lowercased. */
export function eventWords(type: string | null | undefined): string {
  if (!type) return "Event";
  return EVENT_WORDS[type] ?? type.toLowerCase().replace(/_/g, " ");
}

// ── The delivery place's nearest open ────────────────────────────────────
// Sam, 2026-09-24 01:10Z: "we cant confirm at door." The delivery place's row
// said "Seen at the door: Yes/No" off the element's `verified_at_door` (a
// signed DELIVERY_VERIFIED). It says the fact instead: the nearest open's
// distance from the delivery address and where that open stood against the
// carrier's scan, in the record page's sentences ("Opened 40 m from the
// delivery address.", "After the carrier's scan.", "Location not shared.").
// The field and the signed event stay data.

/** The key of the delivery place's door row, whose words are the nearest open's. */
export const NEAREST_OPEN_KEY = "verified_at_door";

const MEASURED_WORDS = new Set(["pass", "near", "flagged"]);
const SHARED_WORDS = new Set(["pass", "near", "flagged", "imprecise", "unmeasured"]);
const NOT_A_PERSON = new Set(["stale", "proxy"]);

/** One measured moment: an open's (or its late share's) distance, when. */
export type NearestCandidate = {
  at: string | null;
  verdict: string | null;
  distance_m: number | null;
  outcome?: string | null;
  /** Where the moment stood against the carrier's scan, when the record said so. */
  after_carrier_scan?: boolean | null;
};

/** What the nearest open is read from, whichever door answered. */
export type NearestInput = {
  /** The carrier's delivered scan, when the record's delivery date is one —
   *  a signed CARRIER_DELIVERED, or a carrier's feed (deliverySource). A date
   *  from Shopify's fulfillment or a demo clock is no scan: null. */
  deliveredAt: string | null;
  candidates: NearestCandidate[];
  /** Opens the record counted, for the words when none carried a distance. */
  opens: number;
};

const lower = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : "");

/** The words of the delivery place's door row: the nearest person's open that
 *  carries a measured distance, and where it stood against the carrier's
 *  scan; with no distance, whether any open shared a location; with no open,
 *  that. A scanner's or a reload's open is not a person's; a placeholder's
 *  word measured nothing. */
export function nearestOpenWords(input: NearestInput): string {
  const scan = Date.parse(input.deliveredAt ?? "");
  let best: { d: number; at: string | null; after: boolean | null } | null = null;
  for (const c of input.candidates) {
    if (NOT_A_PERSON.has(lower(c.outcome))) continue;
    const d = c.distance_m;
    if (!MEASURED_WORDS.has(lower(c.verdict)) || typeof d !== "number" || !Number.isFinite(d) || d <= 0) continue;
    const t = Date.parse(c.at ?? "");
    const after = typeof c.after_carrier_scan === "boolean" ? c.after_carrier_scan : Number.isFinite(t) && Number.isFinite(scan) ? t >= scan : null;
    if (!best || d < best.d || (d === best.d && (c.at ?? "") < (best.at ?? ""))) best = { d, at: c.at, after };
  }
  if (best) {
    const when = best.after === false ? " Before the carrier's scan." : best.after === true ? " After the carrier's scan." : "";
    return `Opened ${kmOrM(best.d)} from the delivery address.${when}`;
  }
  const people = input.candidates.filter((c) => !NOT_A_PERSON.has(lower(c.outcome)));
  if (people.some((c) => SHARED_WORDS.has(lower(c.verdict)))) return "A location was shared, but no distance was stored.";
  return input.opens > 0 || people.length ? "Location not shared." : "No open on the record yet.";
}

/** The nearest open's inputs from a record read: every signed open's own
 *  measurement (its late share's when it shared later) and the first open's
 *  served line, with the moment it stood against the carrier's scan. */
export function nearestInputOf(record: RecordRead): NearestInput {
  const candidates: NearestCandidate[] = (record.opens ?? []).map((o) => ({ at: o.at, verdict: o.verdict, distance_m: o.distance_m, outcome: o.outcome }));
  const open = record.elements.find((e) => e.element === "the_open");
  const loc = (open?.value as { location?: { verdict?: string; distance_m?: number | null; after_carrier_scan?: boolean | null } } | null)?.location;
  if (loc) {
    candidates.push({
      at: record.summary.first_open_at ?? null,
      verdict: loc.verdict ?? null,
      distance_m: loc.distance_m ?? null,
      after_carrier_scan: typeof loc.after_carrier_scan === "boolean" ? loc.after_carrier_scan : null,
    });
  }
  return { deliveredAt: carrierScanOf(record.elements, record.summary.delivered_at ?? null), candidates, opens: record.summary.opens ?? 0 };
}

/** The delivered instant when it is a carrier's scan (#145's rule: a signed
 *  scan or a carrier's feed), else null — the moment an open is said against. */
export function carrierScanOf(elements: ReadonlyArray<{ element: string; value: Record<string, unknown> | null }>, deliveredAt: string | null): string | null {
  const v = elements.find((e) => e.element === "delivery_date")?.value ?? null;
  if (!v || !deliveredAt) return null;
  return v.signed === true || deliverySource(typeof v.source === "string" ? v.source : null)?.carrier ? deliveredAt : null;
}
