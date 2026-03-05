interface UsageCapCardProps {
  used?: number;
  cap?: number;
}

const UsageCapCard = ({ used = 233.22, cap = 500.0 }: UsageCapCardProps) => {
  const pct = Math.min(Math.round((used / cap) * 100), 100);
  const isWarning = pct >= 80 && pct < 95;
  const isCritical = pct >= 95 && pct < 100;
  const isMaxed = pct >= 100;

  const fillColor =
    isCritical || isMaxed
      ? "bg-[hsl(0,72%,51%)]"
      : isWarning
        ? "bg-[hsl(38,92%,50%)]"
        : "bg-foreground";

  const fmt = (n: number) =>
    `$${n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div className="bg-card border border-border rounded-sm p-6">
      <div className="flex items-center justify-between">
        <p className="text-base font-medium text-foreground">Usage Cap</p>
        <p className="text-sm text-muted-foreground">{fmt(cap)}</p>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-1 w-full rounded-full bg-border overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${fillColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {fmt(used)} of {fmt(cap)} used
        </p>
        <p className="text-xs text-muted-foreground">{pct}%</p>
      </div>

      {isWarning && (
        <p className="mt-2 text-xs text-[hsl(38,92%,50%)] font-medium">
          Approaching usage cap
        </p>
      )}

      {isCritical && (
        <p className="mt-2 text-xs text-[hsl(0,72%,51%)] font-medium">
          Usage cap almost reached — enrollments and taps will pause
        </p>
      )}

      {isMaxed && (
        <div className="mt-3">
          <p className="text-xs text-[hsl(0,72%,51%)] font-medium mb-3">
            Usage cap reached — enrollments and taps are paused
          </p>
          <button className="px-4 py-2 text-sm font-medium bg-foreground text-background rounded-sm">
            Approve Higher Cap
          </button>
        </div>
      )}

      <a
        href="#"
        className="mt-3 inline-block text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Manage billing →
      </a>
    </div>
  );
};

export default UsageCapCard;
