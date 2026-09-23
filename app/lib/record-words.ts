// THE RECORD, IN WORDS — what an order's record says, printed inside the app.
//
// Sam, 2026-09-23: "we need to be showing the record" · "can we have a full
// record open?" · "merchants need to see lots of compelling data — the 29
// gets it signed". The merchant sees the WHOLE record (ink-backend #129): the
// words of each element with its level and values, the checks, and every
// signed event — read through the merchant door with the shop's own key
// (services/ink-record.server.ts), or the public words when no key reads it.
// What the price buys is the hand-over (lib/record-handover.ts). Never a
// coordinate, never a hash.
//
// The words are the public record page's own (the-ritualist
// src/pages/VerifyRecord.tsx LEVEL_WORDS + locationWords + valueWords, and
// src/lib/audit-packet.ts VALUE_WORDS + VERDICT_WORDS), copied so the app and
// the page never say the same record two ways — with ONE departure, Sam's
// (2026-09-23, on "Opened 719 m … — outside the 300 m range"): "we dont
// judge" · "we dont have a default range". A distance is said as a distance;
// the backend's pass / near / flagged word is never printed beside it. (The
// public page still prints "(flagged)" — the-ritualist's to follow.) Pure: no
// server import, so the screen renders the same words on the server and in
// the browser.

import { kmOrM } from "./order-timeline";

import type { CheckoutVsOpens } from "./checkout-words";

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
};

/** The hand-over is the merchant's — bought, or free (lib/record-handover.ts).
 *  Only a whole read (the merchant door) can say so: its price is gone once
 *  bought, and absent when free. The public words of a priced record never do. */
export function recordDownloadsAvailable(record: RecordRead | null | undefined): boolean {
  return record?.whole === true && !record.forSale;
}

export const LEVEL_WORDS: Record<string, string> = {
  verified: "Device-verified",
  attested: "Recorded and signed",
  asserted: "In the record, unsigned",
  missing: "Missing",
};

export const VALUE_WORDS: Record<string, string> = {
  order_number: "Order",
  // Sam, 2026-09-23: "enrolled and verified and all that bs is from when this
  // was nfc - remove" — the record's own moment is said as recorded.
  enrolled_at: "Recorded",
  tier: "Buyer",
  delivered_at: "Delivered",
  source: "Source",
  signed: "Signed",
  geocoded: "Address on file",
  verified_at_door: "Confirmed at the door",
  last_status: "Last scan",
  last_at: "Scanned",
  carrier: "Carrier",
  signed_delivered_at: "Delivered (signed)",
  first_open_at: "First opened",
  first_open_signed: "First open signed",
  opens: "Opens",
  signed_opens: "Signed opens",
  non_human_opens: "Opens not a person's",
  location: "Location",
};

/** What an open without a distance says, as the dashboard's order rows say
 *  it. A measured open says its distance instead — never within / outside. */
export const VERDICT_WORDS: Record<string, string> = {
  not_shared: "location not shared",
  unmeasured: "address not geocoded",
  imprecise: "too wide to measure",
};

const MEASURED = new Set(["pass", "near", "flagged"]);

type LocationLine = { verdict?: string; distance_m?: number | null; later_share?: LocationLine | null };

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

// One measurement per line: a distance printed always comes from one signed
// moment, and is never judged.
export function locationWords(loc: LocationLine): string {
  if (loc.verdict === "not_shared") return "Not shared by the buyer";
  if (loc.verdict === "unmeasured") return "Shared — no distance available";
  if (loc.verdict === "imprecise") return "Shared — too wide to measure";
  if (loc.distance_m != null && Number.isFinite(loc.distance_m)) return `${kmOrM(loc.distance_m)} from the delivery address`;
  if (loc.verdict && MEASURED.has(loc.verdict)) return "Shared";
  return "—";
}

export function valueWords(key: string, v: unknown): string {
  if (v == null) return "—";
  if (key === "location" && typeof v === "object") return locationWords(v as LocationLine);
  // The carrier's status arrives as an enum ("OUT_FOR_DELIVERY"): said in sentence case.
  if (key === "last_status" && typeof v === "string") {
    const word = v.replace(/_/g, " ").toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return when(v);
  return String(v);
}

// Values the app does not print. `verified_at_door` is the backend's "a fix
// within 100 m after the carrier's delivered scan" — the same range verdict,
// said as a yes or no (Sam, 2026-09-23: "we dont judge" · "we dont have a
// default range").
const UNSAID = new Set(["verified_at_door"]);

/** Each value of an element as a labelled line; a later share gets its own. */
export function elementLines(el: RecordElement): { label: string; words: string }[] {
  const lines: { label: string; words: string }[] = [];
  for (const [k, v] of Object.entries(el.value ?? {})) {
    if (UNSAID.has(k)) continue;
    lines.push({ label: VALUE_WORDS[k] ?? k, words: valueWords(k, v) });
    const later = k === "location" && v && typeof v === "object" ? (v as LocationLine).later_share : null;
    // PLACEHOLDER copy — the page's own label for a later open's share.
    if (later) lines.push({ label: "Later share", words: locationWords(later) });
  }
  return lines;
}

/** The order row's location word: the open's distance, or what its location
 *  says when there is none, in one phrase. */
export function locationWordOf(record: RecordRead | null | undefined): string {
  const open = record?.elements.find((e) => e.element === "the_open");
  const loc = (open?.value as { location?: LocationLine } | null)?.location;
  if (!loc?.verdict) return record ? "—" : "";
  const word = VERDICT_WORDS[loc.verdict];
  if (word) return word.charAt(0).toUpperCase() + word.slice(1);
  if (loc.distance_m != null && Number.isFinite(loc.distance_m)) return kmOrM(loc.distance_m);
  return MEASURED.has(loc.verdict) ? "Location shared" : "—";
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

export const EVENT_WORDS: Record<string, string> = {
  ENROLLED: "Order recorded",
  CARRIER_DELIVERED: "Carrier delivered",
  TAP_RECORDED: "Opened",
  DELIVERY_VERIFIED: "Confirmed at the door",
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
