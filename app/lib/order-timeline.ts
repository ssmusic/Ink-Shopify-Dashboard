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
//     step is done by the proof's own field (delivered_at, first_tap_at), and
//     the record's words above say what is signed; Shipped and In transit come
//     from the carrier's feed and say so, and only a scan of that very stage
//     completes one — a later scan never stands in for an earlier one;
//   · the rail holds only what ink records for every order: no "Enrolled"
//     (Sam, 2026-09-23: "enrolled and verified and all that bs is from when
//     this was nfc - remove"), and no return or refund step — ink has neither,
//     so those steps could only ever say "not yet";
//   · an open is said by its distance, never judged against a range (Sam,
//     2026-09-23: "we dont judge" · "we dont have a default range"); the
//     backend's word is kept only where there is no distance — not shared,
//     no position for the address, too wide to measure; a measured word with
//     no distance still says a location was shared (the words here are the
//     record's own or each open's own, never the proof's old rollup stamp —
//     services/ink-timeline.server.ts), and an open with no word at all says
//     only that its distance is unavailable;
//   · the delivery window runs from the delivered scan to the window's end the
//     backend recorded — never an end made up here — and the first open sits
//     on it where it fell.

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
// Shipped · In transit · Delivered · Opened (see the rules above).
export function lifecycle(p: LifecycleFields): LifecycleStep[] {
  const journey = p.carrier_journey?.events ?? [];
  // Only a recorded scan of the stage completes it.
  const shipped = earliest(journey, ["shipped"]);
  const transit = earliest(journey, ["transit", "in_transit"]);
  const step = (key: string, label: string, at: string | null | undefined, note: string | null = null): LifecycleStep => ({
    key,
    label,
    state: time(at ?? null) != null ? (note ? "carrier" : "done") : "not_recorded",
    at: time(at ?? null) != null ? (at as string) : null,
    note,
  });
  return [
    step("shipped", "Shipped", shipped, "from the carrier"),
    step("in_transit", "In transit", transit, "from the carrier"),
    step("delivered", "Delivered", p.delivered_at),
    step("opened", "Opened", p.first_tap_at),
  ];
}

export type OpenResult = "measured" | "shared" | "not_shared" | "unmeasured" | "imprecise";

const MEASURED_WORDS = new Set(["pass", "near", "flagged"]);

/** What one open says about the address: a distance when there is one, else
 *  the backend's word. A measured word without its distance still says a
 *  location was shared — never that none was; no word at all claims neither. */
export function openResult(distance_m: number | null | undefined, verdict: string | null | undefined): OpenResult {
  const v = (verdict ?? "").toLowerCase();
  if (v === "not_shared") return "not_shared";
  if (v === "imprecise") return "imprecise";
  // A distance that is there but not a real one (negative, not finite) is bad data: unavailable.
  if (distance_m != null) return Number.isFinite(distance_m) && distance_m >= 0 ? "measured" : "unmeasured";
  return MEASURED_WORDS.has(v) ? "shared" : "unmeasured";
}

export function kmOrM(m: number): string {
  return m >= 1000 ? `${Math.round(m / 100) / 10} km` : `${Math.round(m)} m`;
}

/** One open, in a sentence — the distance, never a coordinate, never a
 *  judgment of it (Sam, 2026-09-23: "we dont judge"). */
export function openSentence(distance_m: number | null | undefined, verdict: string | null | undefined): string {
  const r = openResult(distance_m, verdict);
  // PLACEHOLDER copy.
  if (r === "not_shared") return "Location not shared.";
  if (r === "unmeasured") return "Distance unavailable.";
  if (r === "imprecise") return "Location accuracy too low to measure.";
  if (r === "shared") return "A location was shared.";
  return `Opened ${kmOrM(distance_m as number)} from the delivery address.`;
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

/** The bar exists only once the carrier has said delivered, and only with the
 *  window end the backend recorded (no seven-day guess). */
export function deliveryWindow(p: {
  delivered_at?: string | null;
  interaction_window_end?: string | null;
  enrolled_at?: string | null;
  first_tap_at?: string | null;
  within_expected_window?: boolean | null;
}): DeliveryWindow | null {
  const delivered = time(p.delivered_at);
  if (delivered == null) return null;
  const end = time(p.interaction_window_end);
  if (end == null || end <= delivered) return null;
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
