import { Clock, TrendingDown } from "lucide-react";

interface TimeToEngagementProps {
  avgHours?: number;
  medianHours?: number;
  prevAvgHours?: number;
  breakdown?: { label: string; hours: number; percent: number }[];
}

const TimeToEngagement = ({
  avgHours = 3.8,
  medianHours = 2.4,
  prevAvgHours = 5.1,
  breakdown = [
    { label: "< 1 hour", hours: 1, percent: 22 },
    { label: "1–4 hours", hours: 4, percent: 41 },
    { label: "4–12 hours", hours: 12, percent: 24 },
    { label: "12–24 hours", hours: 24, percent: 9 },
    { label: "24+ hours", hours: 48, percent: 4 },
  ],
}: TimeToEngagementProps) => {
  const improvement = prevAvgHours > 0 ? (((prevAvgHours - avgHours) / prevAvgHours) * 100).toFixed(0) : "0";

  return (
    <div
      className="bg-card border border-border rounded-md p-4 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      role="region"
      aria-label="Time to engagement"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-4 w-4 text-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Time to Engagement</h3>
      </div>

      {/* Main metric */}
      <div className="mb-1">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-light text-foreground tabular-nums">{avgHours}h</span>
          <span className="text-sm text-muted-foreground">avg</span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-muted-foreground">Median: {medianHours}h</span>
          <span className="text-xs font-medium text-green-600 flex items-center gap-0.5">
            <TrendingDown className="h-3 w-3" />
            {improvement}% faster
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Time between delivery and first customer tap
      </p>

      {/* Distribution bars */}
      <div className="space-y-2.5 pt-4 border-t border-border">
        {breakdown.map((bucket) => (
          <div key={bucket.label} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{bucket.label}</span>
              <span className="text-foreground font-medium tabular-nums">{bucket.percent}%</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-foreground rounded-full transition-all"
                style={{ width: `${bucket.percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TimeToEngagement;
