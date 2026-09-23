export type StepState = "done" | "carrier" | "not_recorded";
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

// Only recorded timestamps complete a lifecycle step.
export function lifecycle(p: LifecycleFields): LifecycleStep[] {
  const journey = p.carrier_journey?.events ?? [];
  const shipped = earliest(journey, ["shipped"]);
  const transit = earliest(journey, ["transit", "in_transit"]);
  const step = (
    key: string,
    label: string,
    at: string | null | undefined,
    note: string | null = null,
  ): LifecycleStep => ({
    key,
    label,
    state:
      time(at ?? null) != null ? (note ? "carrier" : "done") : "not_recorded",
    at: time(at ?? null) != null ? (at as string) : null,
    note,
  });
  return [
    step("enrolled", "Recorded", p.enrolled_at),
    step("shipped", "Shipped", shipped, "from the carrier"),
    step("in_transit", "In transit", transit, "from the carrier"),
    step("delivered", "Delivered", p.delivered_at),
    step("opened", "Opened", p.first_tap_at),
    step("return_started", "Return started", p.return_started_at),
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
  const end = time(p.interaction_window_end);
  if (end == null || end <= delivered) return null;
  const first = time(p.first_tap_at);
  const total = end - delivered;
  return {
    deliveredAt: new Date(delivered).toISOString(),
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
