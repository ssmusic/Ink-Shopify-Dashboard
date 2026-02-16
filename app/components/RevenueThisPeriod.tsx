import { TrendingUp } from "lucide-react";

interface TotalValueProtectedProps {
  totalValue?: number;
  prevValue?: number;
  enrolledCount?: number;
  avgOrderValue?: number;
  period?: string;
}

const RevenueThisPeriod = ({
  totalValue = 84621,
  prevValue = 72340,
  enrolledCount = 1247,
  avgOrderValue = 67.86,
  period = "Feb 2026",
}: TotalValueProtectedProps) => {
  const changePct = prevValue > 0 ? (((totalValue - prevValue) / prevValue) * 100).toFixed(0) : "0";
  const isUp = totalValue >= prevValue;

  return (
    <div
      className="bg-card border border-border rounded-md p-4 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      role="region"
      aria-label="Total value protected"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Total Value Protected</h3>
        </div>
        <span className="text-xs text-muted-foreground">{period}</span>
      </div>

      {/* Total */}
      <div className="mb-1">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-light text-foreground tabular-nums">
            ${totalValue.toLocaleString()}
          </span>
          <span className={`text-xs font-medium flex items-center gap-0.5 ${isUp ? "text-green-600" : "text-red-500"}`}>
            <TrendingUp className="h-3 w-3" />
            {isUp ? "+" : ""}{changePct}% vs last period
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Retail value of all enrolled shipments
      </p>


      {/* Breakdown */}
      <div className="space-y-2.5 pt-4 border-t border-border">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Enrolled Shipments</span>
          <span className="font-medium text-foreground tabular-nums">{enrolledCount.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Avg. Order Value</span>
          <span className="font-medium text-foreground tabular-nums">
            ${avgOrderValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default RevenueThisPeriod;
