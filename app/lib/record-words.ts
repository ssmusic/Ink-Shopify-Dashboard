// THE RECORD, IN WORDS — what an order's record says, printed inside the app.
//
// Sam, 2026-09-23: "we need to be showing the record" · "can we have a full
// record open?". The words are the free half of the record (the paid half is
// the dispute packet behind "Get the record"): each element of the backend's
// public read, GET /verify/:proofId (ink-backend, the words projection of
// #124), with its level and its values — never a coordinate, never a hash.
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

export type RecordRead = {
  summary: RecordSummary;
  elements: RecordElement[];
  /** Priced and not bought: the proof is behind the purchase; the words are not. */
  locked: boolean;
  /** The checkout beside the opens (lib/checkout-words.ts) — present only when
   *  the backend's words carry it (its CHECKOUT_DETAILS_ENABLED switch). */
  checkout?: CheckoutVsOpens;
  /** The browsers the opens came from (absent from a backend before 2026-09-23). */
  browsers?: RecordBrowsers | null;
};

export const LEVEL_WORDS: Record<string, string> = {
  verified: "Device-verified",
  attested: "Recorded and signed",
  asserted: "In the record, unsigned",
  missing: "Missing",
};

export const VALUE_WORDS: Record<string, string> = {
  order_number: "Order",
  enrolled_at: "Enrolled",
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
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
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
