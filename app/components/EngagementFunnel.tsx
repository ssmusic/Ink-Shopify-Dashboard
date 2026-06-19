import { ArrowDown, Loader2 } from "lucide-react";
import { useFetcher } from "react-router";
import { useEffect } from "react";

interface FunnelStep {
  label: string;
  count: number;
  color: string;
}

const EngagementFunnel = () => {
  // Real funnel from the merchant's proofs (replaces the 1247/843/158 mock):
  // Enrolled = all proofs, Tapped = proofs tapped at least once. Shared source
  // with CurrentPlanCard + BillingWidget.
  const fetcher = useFetcher<{ totalTaps: number; enrollments: number; engaged: number }>();
  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.load(`/app/api/dashboard/tap-stats?_t=${Date.now()}`);
    }
  }, [fetcher]);

  const isLoading = fetcher.state === "loading" || !fetcher.data;
  const enrollments = fetcher.data?.enrollments ?? 0;
  const engaged = fetcher.data?.engaged ?? 0;

  const steps: FunnelStep[] = [
    { label: "Enrolled", count: enrollments, color: "bg-amber-500" },
    { label: "Tapped", count: engaged, color: "bg-emerald-500" },
  ];
  const maxCount = steps[0]?.count || 1;

  return (
    <div
      className="relative bg-card border border-border rounded-md p-4 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      role="region"
      aria-label="Engagement funnel"
    >
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-md">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {/* Header */}
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-foreground">Engagement Funnel</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          How many enrolled shipments were tapped
        </p>
      </div>

      {/* Funnel steps */}
      <div className="space-y-1">
        {steps.map((step, index) => {
          const widthPercent = Math.max((step.count / maxCount) * 100, 12);
          const dropoff = index > 0
            ? (((steps[index - 1].count - step.count) / (steps[index - 1].count || 1)) * 100).toFixed(0)
            : null;
          const isLast = index === steps.length - 1;

          return (
            <div key={step.label}>
              {/* Drop-off indicator */}
              {dropoff !== null && (
                <div className="flex items-center gap-1.5 py-1 pl-4">
                  <ArrowDown className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {isLast ? `${dropoff}% didn't engage` : `${dropoff}% drop-off`}
                  </span>
                </div>
              )}

              {/* Bar */}
              <div className="flex items-center gap-3">
                <div className="w-16 shrink-0">
                  <span className="text-xs font-medium text-foreground">{step.label}</span>
                </div>
                <div className="flex-1 relative">
                  <div
                    className={`h-8 ${step.color} rounded-sm flex items-center justify-end pr-3 transition-all`}
                    style={{ width: `${widthPercent}%` }}
                  >
                    <span className="text-xs font-semibold text-white tabular-nums">
                      {step.count.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Conversion summary */}
      <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Overall engagement rate</span>
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {((engaged / maxCount) * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
};

export default EngagementFunnel;
