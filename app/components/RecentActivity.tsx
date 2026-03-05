import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LifecycleBadge, type LifecycleState } from "~/components/ui/lifecycle-badge";
import { useDoubleTap } from "~/hooks/use-double-tap";

interface ActivityItem {
  orderNumber: string;
  customer: string;
  date: string;
  amount: string;
  status: LifecycleState;
}

const activities: ActivityItem[] = [
  { orderNumber: "1064", customer: "Sam Music", date: "Feb 2, 11:36 AM", amount: "USD 15.00", status: "verified" },
  { orderNumber: "1063", customer: "Sam Music", date: "Feb 1, 3:22 PM", amount: "USD 15.00", status: "verified" },
  { orderNumber: "1062", customer: "Jatin Maurya", date: "Jan 31, 8:15 AM", amount: "USD 15.00", status: "enrolled" },
  { orderNumber: "1061", customer: "Jatin Maurya", date: "Jan 31, 7:45 AM", amount: "USD 15.00", status: "verified" },
  { orderNumber: "1060", customer: "Sam Music", date: "Jan 30, 2:10 PM", amount: "USD 15.00", status: "enrolled" },
];

const RecentActivity = () => {
  const navigate = useNavigate();
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);

  const handleDoubleTap = useDoubleTap<string>((orderNumber: string) => {
    setSelectedOrder(orderNumber);
    navigate(`/shipments/${orderNumber}`);
  }, 450); // 450ms window for double-tap

  const handleRowClick = (orderNumber: string) => {
    setSelectedOrder(orderNumber);
    handleDoubleTap(orderNumber);
  };

  return (
    <section aria-labelledby="recent-activity-heading">
      <h2 id="recent-activity-heading" className="text-base sm:text-lg font-medium mb-3 sm:mb-4 mt-6 sm:mt-8">
        Recent Activity
      </h2>
      
      <div className="bg-card border border-border rounded" role="list" aria-label="Recent order activity">
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
          to="/shipments"
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
