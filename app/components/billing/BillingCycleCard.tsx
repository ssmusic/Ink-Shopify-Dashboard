interface BillingCycleCardProps {
  enrollments?: number;
  taps?: number;
  enrollmentRate?: number;
  tapRate?: number;
  cycleStart?: string;
  cycleEnd?: string;
}

const BillingCycleCard = ({
  enrollments = 47,
  taps = 31,
  enrollmentRate = 2.99,
  tapRate = 2.99,
  cycleStart = "Mar 5",
  cycleEnd = "Apr 4, 2026",
}: BillingCycleCardProps) => {
  const enrollmentTotal = enrollments * enrollmentRate;
  const tapTotal = taps * tapRate;
  const total = enrollmentTotal + tapTotal;
  const maxEvents = Math.max(enrollments, taps, 1);

  const fmt = (n: number) =>
    `$${n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div className="bg-card border border-border rounded-sm p-6">
      <p className="text-base font-medium text-foreground">This Billing Cycle</p>
      <p className="text-sm text-muted-foreground mt-1">
        {cycleStart} – {cycleEnd}
      </p>

      <div className="mt-5 space-y-4">
        {/* Enrollments */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Enrolled</span>
            <span className="text-sm text-foreground tabular-nums">
              {fmt(enrollmentTotal)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-border">
              <div
                className="h-1 rounded-full bg-foreground"
                style={{
                  width: `${Math.min((enrollments / maxEvents) * 100, 100)}%`,
                }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">
              {enrollments}
            </span>
          </div>
        </div>

        {/* Taps */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Verified</span>
            <span className="text-sm text-foreground tabular-nums">
              {fmt(tapTotal)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-border">
              <div
                className="h-1 rounded-full bg-foreground"
                style={{
                  width: `${Math.min((taps / maxEvents) * 100, 100)}%`,
                }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">
              {taps}
            </span>
          </div>
        </div>

        <div className="border-t border-border" />

        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">
            Total this cycle
          </span>
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {fmt(total)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default BillingCycleCard;
