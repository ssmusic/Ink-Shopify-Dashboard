import { ArrowDown } from "lucide-react";

interface FunnelStep {
  label: string;
  count: number;
  color: string;
}

interface EngagementFunnelProps {
  steps?: FunnelStep[];
}

const defaultSteps: FunnelStep[] = [
  { label: "Enrolled", count: 1247, color: "bg-amber-500" },
  { label: "Active", count: 843, color: "bg-emerald-500" },
  { label: "Expired", count: 158, color: "bg-gray-400" },
];

const EngagementFunnel = ({ steps = defaultSteps }: EngagementFunnelProps) => {
  const maxCount = steps[0]?.count || 1;

  return (
    <div
      className="bg-card border border-border rounded-md p-4 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      role="region"
      aria-label="Engagement funnel"
    >
      {/* Header */}
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-foreground">Engagement Funnel</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          How shipments move through the verification lifecycle
        </p>
      </div>

      {/* Funnel steps */}
      <div className="space-y-1">
        {steps.map((step, index) => {
          const widthPercent = Math.max((step.count / maxCount) * 100, 12);
          const dropoff = index > 0
            ? (((steps[index - 1].count - step.count) / steps[index - 1].count) * 100).toFixed(0)
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
          {((steps[1]?.count || 0) / maxCount * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
};

export default EngagementFunnel;
