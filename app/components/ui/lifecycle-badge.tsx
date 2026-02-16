import { cn } from "../../lib/utils";

export type LifecycleState = "verified" | "enrolled" | "pending" | "expired";

export function LifecycleBadge({ state }: { state: LifecycleState }) {
  const variants: Record<LifecycleState, string> = {
    verified: "ink-badge-success",
    enrolled: "ink-badge-warning",
    pending: "ink-badge-pending",
    expired: "ink-badge-pending bg-gray-100 border-gray-200 text-gray-500", // impactful gray for expired
  };

  return (
    <span className={cn("ink-badge", variants[state])}>
      {state}
    </span>
  );
}
