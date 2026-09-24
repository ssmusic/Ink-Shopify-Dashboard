export const ORDER_SORT_OPTIONS = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Order number, high to low", value: "number_desc" },
  { label: "Order number, low to high", value: "number_asc" },
  { label: "Total, high to low", value: "total_desc" },
  { label: "Total, low to high", value: "total_asc" },
] as const;
export type InkOrderSort = (typeof ORDER_SORT_OPTIONS)[number]["value"];
export function orderSort(value: unknown): InkOrderSort {
  return ORDER_SORT_OPTIONS.some((option) => option.value === value)
    ? (value as InkOrderSort)
    : "newest";
}
export function orderSearch(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, 200)
    : "";
}

/** A plain-text search, never executable Shopify filter syntax. */
export function shopifyOrderSearch(value: unknown): string | null {
  const text = orderSearch(value);
  if (!text) return null;
  const quote = (term: string) => `"${term.replace(/[\\"]/g, "\\$&")}"`;
  if (/^#?\d+$/.test(text)) return `name:${quote(text.replace(/^#/, ""))}`;
  if (text.includes("@")) return `email:${quote(text)}`;
  return text.split(" ").map(quote).join(" AND ");
}
export function shopifyOrderSort(value: unknown) {
  const sort = orderSort(value);
  return {
    sortKey: sort.startsWith("number_")
      ? "ORDER_NUMBER"
      : sort.startsWith("total_")
        ? "TOTAL_PRICE"
        : "CREATED_AT",
    reverse: sort === "newest" || sort.endsWith("_desc"),
  };
}

// THE LEDGER'S DATES (Sam, 2026-09-24: "we should have a predictable filter
// ---- last 60 days and all etc and a range of dates"). The presets are the web
// app's own (the-ritualist src/components/FilterBar.tsx: "Last 7 days" is the
// last seven days to the minute, not calendar days) — up to what Shopify lets
// either app read. Neither holds read_all_orders, so Shopify answers with the
// last 60 days of orders and never an older one: "Last 60 days" IS that whole
// window, and asks nothing more of Shopify. "All time" waits on that scope,
// which is Sam's to ask for (the app's toml, Shopify's approval and every
// merchant's re-consent); contracts/ledger-dates.test.tsx pins the two facts
// together. Custom dates are whole days, From and To both counted, in the
// shop's own time zone — the zone the ledger prints its dates in.
// ⚠️ PLACEHOLDER labels.
export const ORDER_DATE_OPTIONS = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 60 days", value: "60d" },
  { label: "Custom dates", value: "custom" },
] as const;
export type InkOrderRange = (typeof ORDER_DATE_OPTIONS)[number]["value"];
export type InkOrderDates = {
  range: InkOrderRange;
  /** Custom dates only: the first and last day, YYYY-MM-DD. */
  from: string | null;
  to: string | null;
};
/** Every order Shopify lets the app read: the last 60 days. */
export const ALL_ORDER_DATES: InkOrderDates = { range: "60d", from: null, to: null };

const DAY_MS = 86_400_000;
const PRESET_DAYS = { "7d": 7, "30d": 30 } as const;

/** A calendar day as YYYY-MM-DD, or null when the value is not one. */
export function orderDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return y >= 1970 &&
    t.getUTCFullYear() === y &&
    t.getUTCMonth() === mo - 1 &&
    t.getUTCDate() === d
    ? m[0]
    : null;
}

/** The dates a URL asks for; anything unreadable is the whole window. */
export function orderDates(params: URLSearchParams): InkOrderDates {
  const range = params.get("dates");
  if (range === "7d" || range === "30d") return { range, from: null, to: null };
  if (range !== "custom") return ALL_ORDER_DATES;
  let from = orderDay(params.get("from"));
  let to = orderDay(params.get("to"));
  if (!from && !to) return ALL_ORDER_DATES;
  if (from && to && from > to) [from, to] = [to, from];
  return { range: "custom", from, to };
}

const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
// Shopify's own form: '2020-10-21T23:39:20Z'.
const instant = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");

/** How far ahead of UTC the zone's clock reads at the instant (ms). */
function zoneOffset(t: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(t));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return wall - Math.floor(t / 1000) * 1000;
}

/** The instant a calendar day begins in the zone; UTC when the zone is unknown. */
export function dayStart(day: string, timeZone: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const midnight = Date.UTC(y, m - 1, d);
  try {
    // Twice, so a day whose offset differs from the day before's still lands.
    let t = midnight - zoneOffset(midnight, timeZone);
    t = midnight - zoneOffset(t, timeZone);
    return t;
  } catch {
    return midnight;
  }
}

/** Shopify's created_at terms for the dates; null for the whole window. */
export function shopifyOrderDates(
  dates: InkOrderDates,
  now: number,
  timeZone = "UTC",
): string | null {
  if (dates.range === "7d" || dates.range === "30d")
    return `created_at:>='${instant(now - PRESET_DAYS[dates.range] * DAY_MS)}'`;
  if (dates.range !== "custom") return null;
  const terms: string[] = [];
  const from = orderDay(dates.from);
  const to = orderDay(dates.to);
  if (from) terms.push(`created_at:>='${instant(dayStart(from, timeZone))}'`);
  if (to) {
    // Up to the start of the day after, so the whole of the last day counts.
    const next = ymd(Date.parse(`${to}T00:00:00Z`) + DAY_MS);
    terms.push(`created_at:<'${instant(dayStart(next, timeZone))}'`);
  }
  return terms.length ? terms.join(" AND ") : null;
}

/** The first day a custom pick may reach: the start of the window Shopify
 *  answers for, a day early so no time zone loses its own. No last day: a
 *  field whose min and max share a year greys that year out in Chromium. */
export function orderDateBounds(now: number) {
  return { min: ymd(now - 61 * DAY_MS) };
}

/** Preserve embedded Shopify context and the search; start the pages over. */
export function orderDatesParams(current: URLSearchParams, dates: InkOrderDates) {
  const next = new URLSearchParams(current);
  for (const key of ["after", "before", "page", "view", "dates", "from", "to"]) next.delete(key);
  if (dates.range === "7d" || dates.range === "30d") next.set("dates", dates.range);
  else if (dates.range === "custom") {
    let from = orderDay(dates.from);
    let to = orderDay(dates.to);
    if (from && to && from > to) [from, to] = [to, from];
    if (from || to) next.set("dates", "custom");
    if (from) next.set("from", from);
    if (to) next.set("to", to);
  }
  return next;
}

/** Preserve embedded Shopify context; discard cursors when a filter changes. */
export function orderSearchParams(
  current: URLSearchParams,
  search: string,
  sort: InkOrderSort,
) {
  const next = new URLSearchParams(current);
  for (const key of ["after", "before", "page", "view"]) next.delete(key);
  const q = orderSearch(search);
  if (q) next.set("q", q);
  else next.delete("q");
  if (sort !== "newest") next.set("sort", orderSort(sort));
  else next.delete("sort");
  return next;
}
