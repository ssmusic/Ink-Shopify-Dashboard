// A step's mark says who saw it: "done" — ink recorded it itself; "carrier" —
// a carrier's scan; "reported" — someone else said so (Shopify's fulfillment,
// the demo clock), shown with its source and never ticked; "not_recorded".
export type StepState = "done" | "carrier" | "reported" | "not_recorded";
export type LifecycleStep = {
  key: string;
  label: string;
  state: StepState;
  at: string | null;
  note: string | null;
};

export type JourneyEvent = { at?: string | null; stage?: string | null };

export type LifecycleFields = {
  enrolled_at?: string | null;
  delivered_at?: string | null;
  /** Who said the parcel was delivered: the proof's `delivery_source`
   *  (ink-backend utils/markDelivered.js) — a carrier's tracking (shippo_*,
   *  easypost*), Shopify's fulfillment update ("merchant", the embed's
   *  fulfillments/update webhook), or the demo clock ("demo_clock"). */
  delivered_source?: string | null;
  first_tap_at?: string | null;
  return_started_at?: string | null;
  carrier_journey?: { events?: JourneyEvent[] | null } | null;
};

const time = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

const earliest = (events: JourneyEvent[], stages: string[]): string | null => {
  let best: { at: string; t: number } | null = null;
  for (const e of events) {
    const t = time(e.at ?? null);
    if (t == null || !stages.includes(String(e.stage ?? "").toLowerCase()))
      continue;
    if (!best || t < best.t) best = { at: e.at as string, t };
  }
  return best?.at ?? null;
};

// Each step says where its time came from (Sam, 2026-09-23, on a Delivered
// ticked one minute after the order was recorded: "this isnt honest"). PLACEHOLDER words.
export const SOURCE_WORDS = {
  ink: "Recorded by ink",
  carrier: "From the carrier's scan",
  shopify: "From Shopify's fulfillment",
  demo: "Set by the demo clock",
} as const;

/** Where a delivered time came from, in words, and whether it is a carrier's
 *  scan. Null when the backend cannot say ("system", or nothing). */
export function deliverySource(source: string | null | undefined): { words: string; carrier: boolean } | null {
  const s = String(source ?? "").trim().toLowerCase();
  if (/^(carrier|shippo|easypost)/.test(s)) return { words: SOURCE_WORDS.carrier, carrier: true };
  if (s === "merchant") return { words: SOURCE_WORDS.shopify, carrier: false };
  if (s === "demo_clock") return { words: SOURCE_WORDS.demo, carrier: false };
  return null;
}

// Only recorded timestamps complete a lifecycle step, and each names its source:
// ink's own record, a carrier's scan, or — for a delivery nobody but Shopify or
// a demo clock reported — that report, never ticked. A delivery whose source
// the backend cannot say is not recorded here.
export function lifecycle(p: LifecycleFields): LifecycleStep[] {
  const journey = p.carrier_journey?.events ?? [];
  const shipped = earliest(journey, ["shipped"]);
  const transit = earliest(journey, ["transit", "in_transit"]);
  const deliveredScan = earliest(journey, ["delivered"]);
  const step = (
    key: string,
    label: string,
    at: string | null | undefined,
    state: StepState,
    note: string | null,
  ): LifecycleStep =>
    time(at ?? null) != null
      ? { key, label, state, at: at as string, note }
      : { key, label, state: "not_recorded", at: null, note: null };
  const source = deliverySource(p.delivered_source);
  const delivered = deliveredScan
    ? step("delivered", "Delivered", deliveredScan, "carrier", SOURCE_WORDS.carrier)
    : source
      ? step("delivered", "Delivered", p.delivered_at, source.carrier ? "carrier" : "reported", source.words)
      : step("delivered", "Delivered", null, "not_recorded", null);
  return [
    step("enrolled", "Recorded", p.enrolled_at, "done", SOURCE_WORDS.ink),
    step("shipped", "Shipped", shipped, "carrier", SOURCE_WORDS.carrier),
    step("in_transit", "In transit", transit, "carrier", SOURCE_WORDS.carrier),
    delivered,
    step("opened", "Opened", p.first_tap_at, "done", SOURCE_WORDS.ink),
    step("return_started", "Return started", p.return_started_at, "done", SOURCE_WORDS.ink),
    {
      key: "refund_cleared",
      label: "Refund cleared",
      state: "not_recorded",
      at: null,
      note: "no event for refunds yet",
    },
  ];
}

export type OpenResult =
  | "measured"
  | "not_shared"
  | "unmeasured"
  | "imprecise";

/** One open's result against the address — by distance when there is one. */
export function openResult(
  distance_m: number | null | undefined,
  verdict: string | null | undefined,
): OpenResult {
  const v = (verdict ?? "").toLowerCase();
  if (v === "not_shared") return "not_shared";
  if (v === "imprecise") return "imprecise";
  if (v === "unmeasured" || distance_m == null || !Number.isFinite(distance_m) || distance_m < 0) return "unmeasured";
  return "measured";
}

export function kmOrM(m: number): string {
  return m >= 1000 ? `${Math.round(m / 100) / 10} km` : `${Math.round(m)} m`;
}

/** The sentence the console prints — distance and word, never a coordinate. */
export function openSentence(
  distance_m: number | null | undefined,
  verdict: string | null | undefined,
): string {
  const r = openResult(distance_m, verdict);
  if (r === "not_shared") return "Location not shared.";
  if (r === "unmeasured") return "Distance unavailable.";
  if (r === "imprecise") return "Location accuracy too low to measure.";
  return `Opened ${kmOrM(distance_m as number)} from the delivery address.`;
}

export type DeliveryWindow = {
  deliveredAt: string;
  /** Where the delivered time came from, in words (the rail's own). */
  deliveredNote: string;
  windowEnd: string;
  firstOpenAt: string | null;
  /** Hours from the delivered scan to the first open; negative = opened before delivery. */
  hoursToOpen: number | null;
  /** Where the first open falls on the bar, 0–100; null when it has none. */
  openPositionPct: number | null;
  withinExpectedWindow: boolean | null;
};

/** The bar exists only once a delivery is recorded with its source — the
 *  rail's Delivered step (`delivered_note`); an unsourced delivery draws none. */
export function deliveryWindow(p: {
  delivered_at?: string | null;
  delivered_note?: string | null;
  interaction_window_end?: string | null;
  enrolled_at?: string | null;
  first_tap_at?: string | null;
  within_expected_window?: boolean | null;
}): DeliveryWindow | null {
  const delivered = time(p.delivered_at);
  if (delivered == null || !p.delivered_note) return null;
  const end = time(p.interaction_window_end);
  if (end == null || end <= delivered) return null;
  const first = time(p.first_tap_at);
  const total = end - delivered;
  return {
    deliveredAt: new Date(delivered).toISOString(),
    deliveredNote: p.delivered_note,
    windowEnd: new Date(end).toISOString(),
    firstOpenAt: first != null ? new Date(first).toISOString() : null,
    hoursToOpen:
      first != null
        ? Math.round(((first - delivered) / 3_600_000) * 10) / 10
        : null,
    openPositionPct:
      first != null && total > 0
        ? Math.min(100, Math.max(0, ((first - delivered) / total) * 100))
        : null,
    withinExpectedWindow:
      p.within_expected_window === true
        ? true
        : p.within_expected_window === false
          ? false
          : null,
  };
}
