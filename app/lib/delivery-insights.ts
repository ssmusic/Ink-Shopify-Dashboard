// INK'S DELIVERY DASHBOARD — the console's Delivery page, for one merchant.
//
// Sam, 2026-09-23: "and a big fat dashboard". Ported from the internal
// console (inkadmin src/pages/InsightsDelivery.tsx + src/lib/insights/ledger.ts,
// stats.ts, engagement.ts), which computes every number in the browser from
// the merchant's proof rows; here the same arithmetic runs on the server over
// the rows the merchant's own key can read. Pure — no I/O — so each number is
// pinned by a test on a fixture.
//
// ink's funnel is not the console's: ink has no page, so no "Clicked" step.
// It runs orders → delivered → opened → location shared. It ended with "Seen
// at the door" — orders whose record carries a signed DELIVERY_VERIFIED, an
// open within 100 m after the carrier's scan — until Sam, 2026-09-24: "we cant
// confirm at door" (and, the night before, "we dont have a default range").
// That count is a 100 m pass with no neutral name, so it is not a step; the
// rows still carry `verified_at_door` as data, and one line brings the step
// back under Sam's own words.

export type DeliveryRow = {
  enrolled_at?: string | null;
  delivered_at?: string | null;
  tap_count?: number | null;
  /** PASS | NEAR | FLAGGED | NOT_SHARED | UNMEASURED | IMPRECISE (any case), or null. */
  gps_verdict?: string | null;
  /** Where the first open's distance came from: "gps" is the phone's own fix. */
  location_source?: string | null;
  /** Any of the order's opens carried the phone's own fix (ink-backend
   *  merchant-delivery, 2026-09-24). Absent from an older backend. */
  location_shared?: boolean | null;
  /** The proof carries a delivery fix — a signed DELIVERY_VERIFIED, an open
   *  within 100 m after the carrier's scan. Data: no screen names it. */
  verified_at_door?: boolean | null;
  last_tracking_status?: string | null;
  carrier_name?: string | null;
};

export type TapRow = {
  tap_at?: string | null;
  tracking_last_moved_at?: string | null;
};

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  ofAbovePct: number | null;
};

const at = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

const pct = (n: number, d: number): number | null =>
  d > 0 ? Math.round((n / d) * 1000) / 10 : null;

/** The phone shared its location on one of the order's opens. Sam,
 *  2026-09-24: "i think more than 3 of 488 orders have shared location" —
 *  on the Steve Madden test store 16 orders had an open with a fix, and the
 *  first open's source alone said 3. The backend's `location_shared` says it
 *  for any open; a backend without it says only the first open's source
 *  ("gps" is the phone's own fix — older proofs carry a verdict with no
 *  source, the NFC era's, which is not a shared location). */
export function sharedLocation(
  row: Pick<DeliveryRow, "location_source" | "location_shared">,
): boolean {
  return row.location_shared === true || (row.location_source ?? "").toLowerCase() === "gps";
}

// PLACEHOLDER labels — the console's words where it has them.
export function funnel(rows: DeliveryRow[]): FunnelStep[] {
  const orders = rows;
  const delivered = orders.filter((r) => at(r.delivered_at) != null);
  const opened = delivered.filter((r) => (r.tap_count ?? 0) > 0);
  const shared = opened.filter((r) => sharedLocation(r));
  const steps: [string, string, DeliveryRow[]][] = [
    ["orders", "Orders", orders],
    ["delivered", "Delivered", delivered],
    ["opened", "Open", opened],
    ["shared", "Location shared", shared],
  ];
  return steps.map(([key, label, list], i) => ({
    key,
    label,
    count: list.length,
    ofAbovePct: i === 0 ? null : pct(list.length, steps[i - 1][2].length),
  }));
}

// The console's buckets (stats.ts TRANSIT_BUCKETS), verbatim.
export const TRANSIT_BUCKETS = [
  { label: "Under 1 day", max: 24 },
  { label: "1 to 2 days", max: 48 },
  { label: "2 to 4 days", max: 96 },
  { label: "4 to 7 days", max: 168 },
  { label: "Over 7 days", max: Infinity },
] as const;

export type TransitHistogram = {
  buckets: { label: string; count: number }[];
  measured: number;
  delivered: number;
  medianHours: number | null;
};

/** Hours from enrolment to delivery, bucketed; a pair missing or negative is skipped. */
export function timeInTransit(rows: DeliveryRow[]): TransitHistogram {
  const buckets = TRANSIT_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  const hours: number[] = [];
  let delivered = 0;
  for (const r of rows) {
    const d = at(r.delivered_at);
    if (d == null) continue;
    delivered += 1;
    const e = at(r.enrolled_at);
    if (e == null) continue;
    const h = (d - e) / 3_600_000;
    if (h < 0) continue;
    hours.push(h);
    const idx = TRANSIT_BUCKETS.findIndex((b) => h < b.max);
    buckets[idx === -1 ? buckets.length - 1 : idx].count += 1;
  }
  hours.sort((a, b) => a - b);
  const mid = hours.length
    ? hours.length % 2
      ? hours[(hours.length - 1) / 2]
      : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2
    : null;
  return { buckets, measured: hours.length, delivered, medianHours: mid };
}

/** The console's formatDuration: "5 h", "2.5 d". */
export function formatHours(h: number | null): string {
  if (h == null) return "—";
  return h < 48 ? `${Math.round(h)} h` : `${Math.round((h / 24) * 10) / 10} d`;
}

export type CarrierLine = {
  status: string;
  count: number;
  ofEnrolledPct: number | null;
};

/** Every order by the carrier's last word; an empty word is "No carrier update". */
export function carrierSaid(rows: DeliveryRow[]): CarrierLine[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const raw = (r.last_tracking_status ?? "")
      .trim()
      .replace(/_/g, " ")
      .toLowerCase();
    const s = raw
      ? raw.charAt(0).toUpperCase() + raw.slice(1)
      : "No delivery status"; // PLACEHOLDER copy (the console's)
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([status, count]) => ({
      status,
      count,
      ofEnrolledPct: pct(count, rows.length),
    }));
}

// The console's threshold (engagement.ts STUCK_THRESHOLD_HOURS).
export const STUCK_THRESHOLD_HOURS = 48;

export type WhileTheyWaited = {
  stuck: number;
  withData: number;
  sharePct: number | null;
};

/** Opens made 48 h or more after the parcel last moved. */
export function whileTheyWaited(taps: TapRow[]): WhileTheyWaited {
  let withData = 0;
  let stuck = 0;
  for (const t of taps) {
    const a = at(t.tap_at);
    const m = at(t.tracking_last_moved_at);
    if (a == null || m == null) continue;
    if (a < m) continue;
    withData += 1;
    if ((a - m) / 3_600_000 >= STUCK_THRESHOLD_HOURS) stuck += 1;
  }
  return { stuck, withData, sharePct: pct(stuck, withData) };
}

/** How many orders name a carrier — the console's "Not recorded yet" trailing line. */
export function carrierNamed(rows: DeliveryRow[]): number {
  return rows.filter((r) => {
    const c = (r.carrier_name ?? "").trim();
    return c !== "" && c !== "—";
  }).length;
}
