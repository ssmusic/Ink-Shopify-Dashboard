// ⚠️ TABLED 2026-07-05 — NOT RENDERED ANYWHERE. This component shows mock/
// hardcoded numbers (never real merchant data end-to-end). Kept in the tree
// per consolidate≠delete; do not re-mount without wiring real data first.
import { Clock, Loader2 } from "lucide-react";
import { useFetcher } from "react-router";
import { useEffect } from "react";

interface CurrentPlanCardProps {
  enrollmentRate?: number;
  tapRate?: number;
  tagsCost?: number;
  tagRate?: number;
  period?: string;
  customerSince?: string;
  nextInvoice?: string;
  paymentMethod?: string;
  className?: string;
}

const CurrentPlanCard = ({
  enrollmentRate = 0.99,
  tapRate = 2.99,
  tagsCost = 997.60,
  tagRate = 0.80,
  period = "Feb 2026",
  customerSince = "Sep 15, 2025",
  nextInvoice = "Mar 1, 2026",
  paymentMethod = "•••• 4242",
  className = "",
}: CurrentPlanCardProps) => {
  // Real verified-tap + enrollment counts, summed from the merchant's proofs
  // (replaces the old hardcoded 843/1247 mock — "the tap count wasn't coming through").
  // NOTE: the dollar/account figures below (tags pass-through, payment method,
  // invoice dates, customer-since) are still placeholders; a full billing wire-up
  // is a separate task from the tap count.
  const fetcher = useFetcher<{ totalTaps: number; enrollments: number }>();
  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.load(`/app/api/dashboard/tap-stats?_t=${Date.now()}`);
    }
  }, [fetcher]);

  const isLoading = fetcher.state === "loading" || !fetcher.data;
  const taps = fetcher.data?.totalTaps ?? 0;
  const enrollments = fetcher.data?.enrollments ?? 0;

  const enrollmentRevenue = enrollments * enrollmentRate;
  const tapRevenue = taps * tapRate;
  const totalInkCharges = enrollmentRevenue + tapRevenue + tagsCost;
  const tapPercent = enrollments > 0 ? ((taps / enrollments) * 100).toFixed(0) : "0";

  const fmt = (n: number) =>
    `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className={`relative bg-card border border-border rounded-sm overflow-hidden ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-10 transition-all duration-300">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {/* Header */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-foreground">Billing Summary</p>
            <span className="text-xs text-muted-foreground">•</span>
            <p className="text-xs text-muted-foreground">{period}</p>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Customer since {customerSince}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        {/* Enrollments */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">{enrollments.toLocaleString()} enrollments</p>
            <p className="text-xs text-muted-foreground">@ ${enrollmentRate.toFixed(2)} each</p>
          </div>
          <span className="text-sm text-foreground">{fmt(enrollmentRevenue)}</span>
        </div>

        {/* Verified engagements */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">{taps.toLocaleString()} verified engagements</p>
            <p className="text-xs text-muted-foreground">@ ${tapRate.toFixed(2)} each • {tapPercent}% engagement rate</p>
          </div>
          <span className="text-sm text-foreground">{fmt(tapRevenue)}</span>
        </div>

        {/* Tags pass-through */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">Tags (pass-through)</p>
            <p className="text-xs text-muted-foreground">@ ${tagRate.toFixed(2)} each</p>
          </div>
          <span className="text-sm text-foreground">{fmt(tagsCost)}</span>
        </div>

        {/* Total */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <p className="text-sm font-semibold text-foreground">Total ink. Charges</p>
          <span className="text-sm font-semibold text-foreground">{fmt(totalInkCharges)}</span>
        </div>

        {/* Payment & Invoice */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="flex items-center gap-4">
            <p className="text-xs text-muted-foreground">Payment Method <span className="text-foreground font-medium">{paymentMethod}</span></p>
            <p className="text-xs text-muted-foreground">Next Invoice <span className="text-foreground font-medium">{nextInvoice}</span></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CurrentPlanCard;
