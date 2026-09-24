// AN ORDER'S ACTIVITY, IN ONE LINE — for the Orders ledger's Activity column
// (components/InkRecentOrders.tsx), the Ritualist's "Delivered · awaiting open"
// column (the-ritualist src/pages/Orders.tsx) said in ink's own words.
//
// It authors nothing: the line is the furthest delivery step the order's rail
// has recorded (lib/order-timeline.ts), in the rail's label and the rail's
// source words — "Delivered · From Shopify's fulfillment", "In transit · From
// the carrier's scan" — so the row can never say more than the rail under it
// (Sam, 2026-09-23, on a Delivered with no source: "this isnt honest"). No
// distance, no verdict: the distance stays inside the order (Sam: "the distance
// from delivery is jsut a data point"; "we dont judge delivery").
import type { LifecycleStep } from "./order-timeline";

const DELIVERY_STEPS = ["delivered", "in_transit", "shipped"] as const;

/** The order's latest delivery step with where its time came from, or — when
 *  nothing moved yet — the recording's own source words. Null without a rail. */
export function deliveryLine(steps: LifecycleStep[] | null | undefined): string | null {
  if (!steps?.length) return null;
  const reached = (key: string) => steps.find((s) => s.key === key && s.at);
  for (const key of DELIVERY_STEPS) {
    const step = reached(key);
    if (step) return step.note ? `${step.label} · ${step.note}` : step.label;
  }
  const recorded = reached("enrolled");
  return recorded ? recorded.note ?? recorded.label : null;
}

/** "1 open", "3 opens" — the words the row has always used; null when unread. */
export function opensLine(count: number | null): string {
  return count == null ? "Opens unavailable" : `${count} ${count === 1 ? "open" : "opens"}`;
}
