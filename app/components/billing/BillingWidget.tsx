// ⚠️ TABLED 2026-07-05 — NOT RENDERED ANYWHERE. This component shows mock/
// hardcoded numbers (never real merchant data end-to-end). Kept in the tree
// per consolidate≠delete; do not re-mount without wiring real data first.
import { useNavigate } from "react-router-dom";
import { useFetcher } from "react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

interface BillingWidgetProps {
  // Plan cap is config, not engagement data — still a placeholder until billing is wired.
  cap?: number;
}

const BillingWidget = ({ cap = 500 }: BillingWidgetProps) => {
  const navigate = useNavigate();

  // Real enrollment + tap counts (replaces the old 47/31 mock), shared source
  // with CurrentPlanCard + EngagementFunnel.
  const fetcher = useFetcher<{ totalTaps: number; enrollments: number; engaged: number }>();
  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.load(`/app/api/dashboard/tap-stats?_t=${Date.now()}`);
    }
  }, [fetcher]);

  const isLoading = fetcher.state === "loading" || !fetcher.data;
  const enrollments = fetcher.data?.enrollments ?? 0;
  const taps = fetcher.data?.totalTaps ?? 0;

  // Tap + enrollment charges at the published rates ($0.99 / $2.99). Tags
  // pass-through is billed separately and not included in this quick strip.
  const total = enrollments * 0.99 + taps * 2.99;
  const used = total;
  const pct = Math.min(Math.round((used / cap) * 100), 100);

  const fmt = (n: number) =>
    `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div
      onClick={() => navigate("/billing")}
      className="relative bg-card border border-border rounded-sm p-5 cursor-pointer hover:border-muted-foreground transition-colors"
    >
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-sm">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">This Cycle</p>
      <p className="text-sm text-muted-foreground mt-1">
        {enrollments} enrollments · {taps} taps · {fmt(total)}
      </p>

      <div className="mt-3 h-1.5 w-full rounded bg-border overflow-hidden">
        <div
          className="h-full rounded bg-foreground transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        {pct}% of {fmt(cap)} cap
      </p>
    </div>
  );
};

export default BillingWidget;
