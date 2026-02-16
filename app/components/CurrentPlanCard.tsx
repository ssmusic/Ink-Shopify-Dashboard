import { Package, Smartphone, DollarSign, Clock } from "lucide-react";

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
  const totalInkCharges = enrollmentRevenue + tapRevenue;
  const tapPercent = enrollments > 0 ? ((taps / enrollments) * 100).toFixed(0) : "0";

  return (
    <div className={`bg-card border border-border rounded-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-border">
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

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
        {/* Left: Usage */}
        <div className="p-4 sm:p-5 space-y-4">
          {/* Enrollments */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-foreground font-medium">{enrollments.toLocaleString()} enrollments</p>
                <p className="text-xs text-muted-foreground">@ ${enrollmentRate.toFixed(2)} each</p>
              </div>
            </div>
            <span className="text-sm font-semibold text-foreground">${enrollmentRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>

          {/* Taps */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
              <div>
              <p className="text-sm text-foreground font-medium">{taps.toLocaleString()} verified engagements</p>
                <p className="text-xs text-muted-foreground">@ ${tapRate.toFixed(2)} each • {tapPercent}% engagement rate</p>
              </div>
            </div>
            <span className="text-sm font-semibold text-foreground">${tapRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>

          {/* Tags (pass-through) */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground">Tags (pass-through @ ${tagRate.toFixed(2)})</p>
            </div>
            <span className="text-xs text-muted-foreground">${tagsCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Right: Billing info + total */}
        <div className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Payment Method</span>
            <span className="text-foreground font-medium">{paymentMethod}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Next Invoice</span>
            <span className="text-foreground font-medium">{nextInvoice}</span>
          </div>
          <div className="pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total INK Charges</span>
              </div>
              <span className="text-lg font-semibold text-foreground">
                ${totalInkCharges.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CurrentPlanCard;
