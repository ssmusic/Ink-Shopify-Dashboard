import { Clock } from "lucide-react";

interface CurrentPlanCardProps {
  enrollments?: number;
  taps?: number;
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
  enrollments = 1247,
  taps = 843,
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
  const enrollmentRevenue = enrollments * enrollmentRate;
  const tapRevenue = taps * tapRate;
  const totalInkCharges = enrollmentRevenue + tapRevenue + tagsCost;
  const tapPercent = enrollments > 0 ? ((taps / enrollments) * 100).toFixed(0) : "0";

  const fmt = (n: number) =>
    `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className={`bg-card border border-border rounded-sm overflow-hidden ${className}`}>
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
          <p className="text-sm font-semibold text-foreground">Total INK Charges</p>
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
