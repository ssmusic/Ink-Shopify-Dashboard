import { useNavigate } from "react-router-dom";

interface BillingWidgetProps {
  enrollments?: number;
  taps?: number;
  total?: number;
  used?: number;
  cap?: number;
}

const BillingWidget = ({
  enrollments = 47,
  taps = 31,
  total = 233.22,
  used = 233.22,
  cap = 500,
}: BillingWidgetProps) => {
  const navigate = useNavigate();
  const pct = Math.min(Math.round((used / cap) * 100), 100);

  const fmt = (n: number) =>
    `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div
      onClick={() => navigate("/billing")}
      className="bg-card border border-border rounded-sm p-5 cursor-pointer hover:border-muted-foreground transition-colors"
    >
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
