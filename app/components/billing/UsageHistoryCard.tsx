import { useState } from "react";
import { useNavigate } from "react-router";
import { Badge } from "@shopify/polaris";

type UsageRow = {
  date: string;
  event: "Active" | "Enrolled";
  order: string;
  amount: number;
};

// Real usage rows come from completed-return charges once billing is live
// (managed pricing + appUsageRecordCreate). Empty until then — no mock data
// (a Shopify reviewer must never see fabricated usage/orders).
const usageData: UsageRow[] = [];

const PAGE_SIZE = 10;
const TOTAL_ITEMS = usageData.length;

const badgeTone = {
  Active: "success" as const,
  Enrolled: "warning" as const,
};

const UsageHistoryCard = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(TOTAL_ITEMS / PAGE_SIZE));
  const start = TOTAL_ITEMS === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
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

      {TOTAL_ITEMS === 0 ? (
        <div className="px-6 py-10 border-t border-border text-center">
          <p className="text-sm text-muted-foreground">No usage yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Completed returns ($2.50 each) appear here once you’re on a paid plan.
          </p>
        </div>
      ) : (
        <>
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
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") goToOrder(row.order);
                }}
                role="button"
                tabIndex={0}
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
        </>
      )}
    </div>
  );
};

export default UsageHistoryCard;
