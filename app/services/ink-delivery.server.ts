import { merchantRead } from "./ink-reader.server";
// THE DELIVERY DASHBOARD'S NUMBERS — read with the merchant's own key.
//
// Sam, 2026-09-23: "and a big fat dashboard". One merchant-scoped door,
// GET {api}/merchant-delivery (ink-backend routes/api/merchantDelivery.js,
// #126): the shop's proof rows and opens, allowlisted to what the arithmetic
// needs. The arithmetic is the console's (lib/delivery-insights.ts); only its
// results reach the browser — never a row. Until the door is deployed it
// answers 404 and the Insights pill shows the record's numbers alone.

import {
  carrierNamed,
  carrierSaid,
  funnel,
  timeInTransit,
  whileTheyWaited,
  type CarrierLine,
  type DeliveryRow,
  type FunnelStep,
  type TapRow,
  type TransitHistogram,
  type WhileTheyWaited,
} from "../lib/delivery-insights";

export type DeliveryDashboardData = {
  orders: number;
  funnel: FunnelStep[];
  transit: TransitHistogram;
  carrier: CarrierLine[];
  waited: WhileTheyWaited;
  carrierNamed: number;
  capped: boolean;
  tapsCapped?: boolean;
};

export function dashboardFrom(body: unknown): DeliveryDashboardData | null {
  const b = body as { rows?: unknown; taps?: unknown; capped?: unknown; taps_capped?: unknown } | null;
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
    tapsCapped: b.taps_capped === true,
  };
}

export async function readDeliveryDashboard(
  apiKey: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<DeliveryDashboardData | null> {
  return dashboardFrom(
    await merchantRead(apiKey, "merchant-delivery", fetchImpl),
  );
}
