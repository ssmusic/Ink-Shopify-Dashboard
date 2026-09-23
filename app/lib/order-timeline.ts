// ONE ORDER'S TIMELINE — the console's Interaction Timeline, for the app.
//
// Sam, 2026-09-23: "the distance between the delivery address and taps within
// each order along with your delivery information widget". Ported from the
// internal console (inkadmin src/lib/lifecycle-rail.ts, src/lib/open-vs-address.ts
// and the Delivery Window block of src/pages/ProofDetail.tsx). Pure — no I/O.
//
// The console's rules, kept where the merchant's own door can carry them:
//   · the console marks a step only by its SIGNED event (the audit packet's
//     chain) — that chain sits on the purchase-locked proof layer, so here a
//     step is done by the proof's own field (enrolled_at, delivered_at,
//     first_tap_at, a return's start), and the record's words above say what
//     is signed; Shipped and In transit come from the carrier's feed and say
//     so; Refund cleared has no event yet;
//   · 100 m is "within", 300 m is "near", beyond is "outside" — ink's default
//     rings; the backend's word is kept for not shared / unmeasured / imprecise;
//   · the delivery window runs from the delivered scan to the window's end,
//     and the first open sits on it where it fell.

export type StepState = "done" | "carrier" | "not_recorded";
export type LifecycleStep = { key: string; label: string; state: StepState; at: string | null; note: string | null };

export type JourneyEvent = { at?: string | null; stage?: string | null };

export type LifecycleFields = {
  enrolled_at?: string | null;
  delivered_at?: string | null;
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
    if (t == null || !stages.includes(String(e.stage ?? "").toLowerCase())) continue;
    if (!best || t < best.t) best = { at: e.at as string, t };
  }
  return best?.at ?? null;
};

// PLACEHOLDER labels and notes — the console's own words where it has them.
export function lifecycle(p: LifecycleFields): LifecycleStep[] {
  const journey = p.carrier_journey?.events ?? [];
  const shipped = earliest(journey, ["shipped", "transit", "in_transit", "out", "out_for_delivery", "delivered"]);
  const transit = earliest(journey, ["transit", "in_transit", "out", "out_for_delivery"]);
  const step = (key: string, label: string, at: string | null | undefined, note: string | null = null): LifecycleStep => ({
    key,
    label,
    state: time(at ?? null) != null ? (note ? "carrier" : "done") : "not_recorded",
    at: time(at ?? null) != null ? (at as string) : null,
    note,
  });
  return [
    step("enrolled", "Enrolled", p.enrolled_at),
    step("shipped", "Shipped", shipped, "from the carrier"),
    step("in_transit", "In transit", transit, "from the carrier"),
    step("delivered", "Delivered", p.delivered_at),
    step("opened", "Opened", p.first_tap_at),
    step("return_started", "Return started", p.return_started_at),
    { key: "refund_cleared", label: "Refund cleared", state: "not_recorded", at: null, note: "no event for refunds yet" },
  ];
}

export const PASS_M = 100;
export const NEAR_M = 300;

export type OpenResult = "within" | "near" | "outside" | "not_shared" | "unmeasured" | "imprecise";

/** One open's result against the address — by distance when there is one. */
export function openResult(distance_m: number | null | undefined, verdict: string | null | undefined): OpenResult {
  const v = (verdict ?? "").toLowerCase();
  if (v === "not_shared") return "not_shared";
  if (v === "imprecise") return "imprecise";
  if (distance_m == null || !Number.isFinite(distance_m)) return v === "unmeasured" ? "unmeasured" : "not_shared";
  const d = Math.round(distance_m);
  return d <= PASS_M ? "within" : d <= NEAR_M ? "near" : "outside";
}

export function kmOrM(m: number): string {
  return m >= 1000 ? `${Math.round(m / 100) / 10} km` : `${Math.round(m)} m`;
}

/** The sentence the console prints — distance and word, never a coordinate. */
export function openSentence(distance_m: number | null | undefined, verdict: string | null | undefined): string {
  const r = openResult(distance_m, verdict);
  // PLACEHOLDER copy — the console's sentences.
  if (r === "not_shared") return "The customer's phone did not share a location.";
  if (r === "unmeasured") return "A location was shared, but the delivery address has no position to measure against.";
  if (r === "imprecise") return "A location was shared, but too wide to measure against the address.";
  const d = kmOrM(distance_m as number);
  if (r === "within") return `Opened ${d} from the delivery address — within the ${PASS_M} m range.`;
  if (r === "near") return `Opened ${d} from the delivery address — within the ${NEAR_M} m range.`;
  return `Opened ${d} from the delivery address — outside the ${NEAR_M} m range.`;
}

export type DeliveryWindow = {
  deliveredAt: string;
  windowEnd: string;
  firstOpenAt: string | null;
  /** Hours from the delivered scan to the first open; negative = opened before delivery. */
  hoursToOpen: number | null;
  /** Where the first open falls on the bar, 0–100; null when it has none. */
  openPositionPct: number | null;
  withinExpectedWindow: boolean | null;
};

/** The bar exists only once the carrier has said delivered. */
export function deliveryWindow(p: {
  delivered_at?: string | null;
  interaction_window_end?: string | null;
  enrolled_at?: string | null;
  first_tap_at?: string | null;
  within_expected_window?: boolean | null;
}): DeliveryWindow | null {
  const delivered = time(p.delivered_at);
  if (delivered == null) return null;
  // The console's fallback: no window end → enrolment + 7 days.
  let end = time(p.interaction_window_end);
  if (end == null) {
    const enrolled = time(p.enrolled_at);
    end = enrolled != null ? enrolled + 7 * 24 * 3_600_000 : null;
  }
  if (end == null) return null;
  const first = time(p.first_tap_at);
  const total = end - delivered;
  return {
    deliveredAt: new Date(delivered).toISOString(),
    windowEnd: new Date(end).toISOString(),
    firstOpenAt: first != null ? new Date(first).toISOString() : null,
    hoursToOpen: first != null ? Math.round(((first - delivered) / 3_600_000) * 10) / 10 : null,
    openPositionPct: first != null && total > 0 ? Math.min(100, Math.max(0, ((first - delivered) / total) * 100)) : null,
    withinExpectedWindow: p.within_expected_window === true ? true : p.within_expected_window === false ? false : null,
  };
}
