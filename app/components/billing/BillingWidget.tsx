import { useNavigate } from "react-router-dom";
import { useFetcher } from "react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

const BillingWidget = () => {
  const navigate = useNavigate();

  // Real enrollment + tap counts (shared source with CurrentPlanCard +
  // EngagementFunnel). Engagement is informational, not billable.
  const fetcher = useFetcher<{ totalTaps: number; enrollments: number; engaged: number }>();
  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.load(`/app/api/dashboard/tap-stats?_t=${Date.now()}`);
    }
  }, [fetcher]);

  const isLoading = fetcher.state === "loading" || !fetcher.data;
  const enrollments = fetcher.data?.enrollments ?? 0;
  const taps = fetcher.data?.totalTaps ?? 0;

  return (
    <div
      onClick={() => navigate("/billing")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") navigate("/billing");
      }}
      role="button"
      tabIndex={0}
      className="relative bg-card border border-border rounded-sm p-5 cursor-pointer hover:border-muted-foreground transition-colors"
    >
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-sm">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">This Cycle</p>
      <p className="text-sm text-muted-foreground mt-1">
        {enrollments} enrollments · {taps} taps
      </p>
      {/* Real pricing model: a flat monthly plan billed by Shopify (managed
          pricing) + $2.50 per COMPLETED return. Engagement (taps/scans) is free,
          so this strip shows engagement, never a fabricated per-tap charge. */}
      <p className="mt-2.5 text-xs text-muted-foreground">
        Plan billed monthly by Shopify · $2.50 per completed return
      </p>
    </div>
  );
};

export default BillingWidget;
