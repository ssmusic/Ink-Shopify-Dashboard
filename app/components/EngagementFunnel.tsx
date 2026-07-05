import { ArrowDown, ArrowRight, Loader2 } from "lucide-react";
import { useFetcher } from "react-router";
import { useEffect } from "react";

interface FunnelStep {
  label: string;
  count: number;
  color: string;
}

// The full real funnel — Enrolled → Delivered → Opened → Clicked — from the
// merchant's proofs (backend field names say "tap"/"engaged"; merchant copy
// says "opened"/"clicked"). Ends with the pull to the studio: this is the
// deliberately-light TASTE of the money story; the full insights (returns $,
// opens by tier, reopen rate) live in in.ink.
const EngagementFunnel = ({
  onOpenStudio,
  studioOpening,
}: {
  onOpenStudio?: () => void;
  studioOpening?: boolean;
}) => {
  const fetcher = useFetcher<{
    totalTaps: number;
    enrollments: number;
    engaged: number;
    delivered: number;
    clicked: number;
    totalClicks: number;
  }>();
  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.load(`/app/api/dashboard/tap-stats?_t=${Date.now()}`);
    }
  }, [fetcher]);

  const isLoading = fetcher.state === "loading" || !fetcher.data;
  const enrollments = fetcher.data?.enrollments ?? 0;
  const engaged = fetcher.data?.engaged ?? 0;
  const delivered = fetcher.data?.delivered ?? 0;
  const clicked = fetcher.data?.clicked ?? 0;

  const steps: FunnelStep[] = [
    { label: "Enrolled", count: enrollments, color: "bg-amber-500" },
    { label: "Delivered", count: delivered, color: "bg-sky-500" },
    { label: "Opened", count: engaged, color: "bg-emerald-500" },
    { label: "Clicked", count: clicked, color: "bg-violet-500" },
  ];
  const maxCount = steps[0]?.count || 1;

  return (
    <div
      className="relative bg-card border border-border rounded-md p-4 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      role="region"
      aria-label="Open funnel"
    >
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-md">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {/* Header */}
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-foreground">Open Funnel</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Enrolled orders → delivered → page opened → clicked onward
        </p>
      </div>

      {/* Funnel steps */}
      <div className="space-y-1">
        {steps.map((step, index) => {
          const widthPercent = Math.max((step.count / maxCount) * 100, 12);
          const dropoff =
            index > 0
              ? (
                  ((steps[index - 1].count - step.count) /
                    (steps[index - 1].count || 1)) *
                  100
                ).toFixed(0)
              : null;

          return (
            <div key={step.label}>
              {/* Drop-off indicator */}
              {dropoff !== null && (
                <div className="flex items-center gap-1.5 py-1 pl-4">
                  <ArrowDown className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {step.label === "Opened"
                      ? `${dropoff}% didn't open`
                      : `${dropoff}% drop-off`}
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
        <span className="text-xs text-muted-foreground">Overall open rate</span>
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {((engaged / maxCount) * 100).toFixed(1)}%
        </span>
      </div>

      {/* Pull to the studio — the taste ends here; the full story lives in in.ink */}
      {onOpenStudio && (
        <button
          onClick={onOpenStudio}
          disabled={studioOpening}
          className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          See full insights in the studio — returns $, opens by buyer, reopens
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

export default EngagementFunnel;
