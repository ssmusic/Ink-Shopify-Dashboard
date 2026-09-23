// THE DELIVERY DASHBOARD'S NUMBERS — read with the merchant's own key.
//
// Sam, 2026-09-23: "and a big fat dashboard". One merchant-scoped door,
// GET {api}/merchant-delivery (ink-backend routes/api/merchantDelivery.js,
// #126): the shop's proof rows and opens, allowlisted to what the arithmetic
// needs. The arithmetic is the console's (lib/delivery-insights.ts); only its
// results reach the browser — never a row. Until the door is deployed it
// answers 404 and the Insights pill shows the record's numbers alone.

import { carrierNamed, carrierSaid, funnel, timeInTransit, whileTheyWaited, type CarrierLine, type DeliveryRow, type FunnelStep, type TapRow, type TransitHistogram, type WhileTheyWaited } from "../lib/delivery-insights";

const INK_API_URL = process.env.INK_API_URL || "https://us-central1-inink-c76d3.cloudfunctions.net/api";
const READ_BUDGET_MS = 6_000; // five side-by-side reads can meet cold backend instances (measured 2026-09-23: a 0.4 s read timed out at 3 s)

export type DeliveryDashboardData = {
  orders: number;
  funnel: FunnelStep[];
  transit: TransitHistogram;
  carrier: CarrierLine[];
  waited: WhileTheyWaited;
  carrierNamed: number;
  capped: boolean;
};

export function dashboardFrom(body: unknown): DeliveryDashboardData | null {
  const b = body as { rows?: unknown; taps?: unknown; capped?: unknown } | null;
  if (!b || !Array.isArray(b.rows)) return null;
  const rows = b.rows as DeliveryRow[];
  const taps = (Array.isArray(b.taps) ? b.taps : []) as TapRow[];
  return {
    orders: rows.length,
    funnel: funnel(rows),
    transit: timeInTransit(rows),
    carrier: carrierSaid(rows),
    waited: whileTheyWaited(taps),
    carrierNamed: carrierNamed(rows),
    capped: b.capped === true,
  };
}

export async function readDeliveryDashboard(apiKey: string | null | undefined, fetchImpl: typeof fetch = fetch): Promise<DeliveryDashboardData | null> {
  if (!apiKey) return null;
  const base = INK_API_URL.endsWith("/") ? INK_API_URL.slice(0, -1) : INK_API_URL;
  try {
    const res = await fetchImpl(`${base}/merchant-delivery`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(READ_BUDGET_MS),
    });
    if (!res.ok) return null;
    return dashboardFrom(await res.json());
  } catch (err) {
    console.warn("[ink] delivery dashboard read failed:", (err as Error)?.message ?? err);
    return null;
  }
}
