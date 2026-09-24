import { cn } from "../../lib/utils";
import { DISTANCE_RECORDED_LABEL } from "../../lib/order-marks";

// "verified" is gone (Sam, 2026-09-24, on the green "verified": "wrong").
// The door notification's state is "recorded": drawn neutral, never green,
// and it says the open's distance when the feed carries one (`label`,
// lib/order-marks.ts distanceBadgeWords) — else the event's neutral title.
export type LifecycleState = "recorded" | "enrolled" | "pending" | "expired";

export function LifecycleBadge({ state, label }: { state: LifecycleState; label?: string }) {
  const variants: Record<LifecycleState, string> = {
    recorded: "ink-badge-pending",
    enrolled: "ink-badge-warning",
    pending: "ink-badge-pending",
    expired: "ink-badge-pending bg-gray-100 border-gray-200 text-gray-500", // impactful gray for expired
  };

  // The distance keeps its own case: `.ink-badge` capitalises every label,
  // and "40 M" is not "40 m".
  return (
    <span className={cn("ink-badge", variants[state], state === "recorded" && "normal-case")}>
      {label ?? (state === "recorded" ? DISTANCE_RECORDED_LABEL : state)}
    </span>
  );
}
