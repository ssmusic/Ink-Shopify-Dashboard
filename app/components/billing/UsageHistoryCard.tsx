import { useState } from "react";
import { useNavigate } from "react-router";
import { Badge } from "@shopify/polaris";

const usageData = [
  { date: "Mar 4, 2:41 PM", event: "Active" as const, order: "#1052", amount: 2.99 },
  { date: "Mar 4, 1:15 PM", event: "Enrolled" as const, order: "#1055", amount: 2.99 },
  { date: "Mar 4, 11:02 AM", event: "Enrolled" as const, order: "#1054", amount: 2.99 },
  { date: "Mar 3, 4:30 PM", event: "Active" as const, order: "#1048", amount: 2.99 },
  { date: "Mar 3, 3:12 PM", event: "Enrolled" as const, order: "#1053", amount: 2.99 },
  { date: "Mar 3, 10:45 AM", event: "Enrolled" as const, order: "#1052", amount: 2.99 },
  { date: "Mar 3, 9:20 AM", event: "Active" as const, order: "#1041", amount: 2.99 },
  { date: "Mar 2, 3:55 PM", event: "Enrolled" as const, order: "#1051", amount: 2.99 },
  { date: "Mar 2, 2:10 PM", event: "Active" as const, order: "#1039", amount: 2.99 },
  { date: "Mar 2, 11:30 AM", event: "Enrolled" as const, order: "#1050", amount: 2.99 },
];

const TOTAL_ITEMS = 78;
const PAGE_SIZE = 10;

const badgeTone = {
  Active: "success" as const,
  Enrolled: "warning" as const,
};

const UsageHistoryCard = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(TOTAL_ITEMS / PAGE_SIZE);
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, TOTAL_ITEMS);

  const goToOrder = (order: string) =>
    navigate(`/app/tagged-shipments/${order.replace("#", "")}`);

  return (
    <div className="bg-card border border-border rounded-sm overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between">
        <p className="text-base font-medium text-foreground">Usage History</p>
        <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Export CSV
        </button>
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-border">
              <th className="text-left px-6 py-2.5 text-xs font-medium text-muted-foreground">Order</th>
              <th className="text-left px-6 py-2.5 text-xs font-medium text-muted-foreground">Date</th>
              <th className="text-right px-6 py-2.5 text-xs font-medium text-muted-foreground">Amount</th>
              <th className="text-left px-6 py-2.5 text-xs font-medium text-muted-foreground">Event</th>
            </tr>
          </thead>
          <tbody>
            {usageData.map((row, i) => (
              <tr
                key={i}
                onClick={() => goToOrder(row.order)}
                className={`border-t border-border cursor-pointer hover:bg-muted/50 transition-colors ${
                  i % 2 === 1 ? "bg-muted/30" : ""
                }`}
              >
                <td className="px-6 py-3 font-semibold text-foreground">{row.order}</td>
                <td className="px-6 py-3 text-muted-foreground whitespace-nowrap">{row.date}</td>
                <td className="px-6 py-3 text-foreground text-right tabular-nums">
                  ${row.amount.toFixed(2)}
                </td>
                <td className="px-6 py-3">
                  <Badge tone={badgeTone[row.event]}>{row.event}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden border-t border-border">
        {usageData.map((row, i) => (
          <div
            key={i}
            onClick={() => goToOrder(row.order)}
            className={`px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${
              i > 0 ? "border-t border-border" : ""
            } ${i % 2 === 1 ? "bg-muted/30" : ""}`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">{row.order}</span>
                <Badge tone={badgeTone[row.event]}>{row.event}</Badge>
              </div>
              <span className="text-sm font-medium text-foreground tabular-nums">
                ${row.amount.toFixed(2)}
              </span>
            </div>
            <time className="text-xs text-muted-foreground">{row.date}</time>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="px-6 py-3 border-t border-border flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing {start}–{end} of {TOTAL_ITEMS}
        </p>
        <div className="flex items-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          >
            Previous
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default UsageHistoryCard;
