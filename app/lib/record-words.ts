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

export type RecordRead = {
  summary: RecordSummary;
  elements: RecordElement[];
  /** Priced and not bought: the proof is behind the purchase; the words are not. */
  locked: boolean;
  price?: { price_cents: number; currency: string } | null;
  events?: Array<{
    id: string;
    type: string;
    at: string | null;
    sequence: number | null;
    signed: boolean;
    hash: boolean;
    legacy: boolean;
  }>;
  eventCount?: number;
};

export const LEVEL_WORDS: Record<string, string> = {
  verified: "Device verified",
  attested: "Recorded and signed",
  asserted: "In the record, unsigned",
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
  verified_at_door: "Seen at the door",
  last_status: "Last scan",
  last_at: "Scanned",
  carrier: "Carrier",
  signed_delivered_at: "Delivered (signed)",
  first_open_at: "First opened",
  first_open_signed: "First open signed",
  opens: "Opens",
  signed_opens: "Signed opens",
  non_human_opens: "Automated opens",
  location: "Location",
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
    return `${Math.round(loc.distance_m)} m from the delivery address`;
  return "Distance unavailable";
}

export function valueWords(key: string, v: unknown): string {
  if (v == null) return "—";
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

/** Each value of an element as a labelled line; a later share gets its own. */
export function elementLines(
  el: RecordElement,
): { label: string; words: string }[] {
  const lines: { label: string; words: string }[] = [];
  for (const [k, v] of Object.entries(el.value ?? {})) {
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

/** How many times the order's tracking link was opened. */
export function opensOf(record: RecordRead | null | undefined): number | null {
  const n = record?.summary?.opens;
  return typeof n === "number" ? n : null;
}
