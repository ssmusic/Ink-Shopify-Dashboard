import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFetcher } from "react-router";
import { LifecycleBadge, type LifecycleState } from "~/components/ui/lifecycle-badge";
import { useDoubleTap } from "~/hooks/use-double-tap";

interface ActivityItem {
  orderNumber: string;
  customer: string;
  date: string;
  amount: string;
  status: LifecycleState;
}

const RecentActivity = () => {
  const navigate = useNavigate();
  const fetcher = useFetcher<{ activities: ActivityItem[] }>();
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);

  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.load("/app/api/dashboard/recent-activity");
    }
  }, [fetcher]);

  const handleDoubleTap = useDoubleTap<string>((orderNumber: string) => {
    setSelectedOrder(orderNumber);
    // Note: The shipments route is now /app/tagged-shipments/:id
    navigate(`/app/tagged-shipments/${orderNumber}`);
  }, 450); // 450ms window for double-tap

  const handleRowClick = (orderNumber: string) => {
    setSelectedOrder(orderNumber);
    handleDoubleTap(orderNumber);
  };

  const activities = fetcher.data?.activities || [];
  const isLoading = fetcher.state === "loading";

  return (
    <section aria-labelledby="recent-activity-heading">
      <h2 id="recent-activity-heading" className="text-base sm:text-lg font-medium mb-3 sm:mb-4 mt-6 sm:mt-8">
        Recent Activity
        <span className="ml-4 bg-red-600 text-white font-bold p-1 rounded">TRACER: DEPLOYED</span>
      </h2>
      
      <div className="bg-card border border-border rounded overflow-hidden" role="list" aria-label="Recent order activity">
        {isLoading && activities.length === 0 && (
          <div className="p-8 text-center text-muted-foreground animate-pulse">
            Loading recent activity...
          </div>
        )}
        
        {!isLoading && activities.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No recent activity found.
          </div>
        )}

        {activities.map((activity, index) => (
          <div
            key={activity.orderNumber}
            role="listitem"
            className={`p-3 sm:p-4 cursor-pointer transition-colors hover:bg-secondary ${
              selectedOrder === activity.orderNumber ? "bg-muted" : ""
            } ${index !== activities.length - 1 ? "border-b border-border" : ""}`}
            onClick={() => handleRowClick(activity.orderNumber)}
          >
            {/* Mobile Layout */}
            <div className="sm:hidden">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="font-semibold text-foreground">
                    {activity.orderNumber}
                  </span>
                  <span className="text-foreground/80 ml-2">
                    {activity.customer}
                  </span>
                </div>
                <LifecycleBadge state={activity.status} />
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  <time dateTime={activity.date}>{activity.date}</time>
                  <span className="mx-2">•</span>
                  <span>{activity.amount}</span>
                </div>
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden sm:flex items-center justify-between">
              {/* Order & Customer Info */}
              <div className="flex items-center gap-6 flex-1 min-w-0">
                <span className="font-semibold text-foreground whitespace-nowrap">
                  {activity.orderNumber}
                </span>
                <span className="text-foreground/80 truncate">
                  {activity.customer}
                </span>
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  <time dateTime={activity.date}>{activity.date}</time>
                </span>
              </div>

              {/* Amount & Status */}
              <div className="flex items-center gap-4">
                <span className="text-foreground whitespace-nowrap hidden md:block">
                  {activity.amount}
                </span>
                <LifecycleBadge state={activity.status} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* View All Link */}
      <div className="flex justify-end mt-4">
        <Link
          to="/app/tagged-shipments"
          className="text-sm text-foreground hover:underline focus-visible:underline"
          aria-label="View all orders"
        >
          View All
        </Link>
      </div>
    </section>
  );
};

export default RecentActivity;
