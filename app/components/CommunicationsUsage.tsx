import { MessageSquare, Mail, Bell, Smartphone } from "lucide-react";

interface ChannelUsage {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  count: string;
  label: string;
  used: number;
  included: number;
}

interface CommunicationsUsageProps {
  totalMessages?: string;
  className?: string;
}

const CommunicationsUsage = ({
  totalMessages = "48,726",
  className = "",
}: CommunicationsUsageProps) => {
  const channels: ChannelUsage[] = [
    { icon: MessageSquare, name: "SMS", count: "1,247", label: "messages sent", used: 1247, included: 2500 },
    { icon: Mail, name: "Email", count: "8,432", label: "emails delivered", used: 8432, included: 25000 },
    { icon: Bell, name: "Push", count: "15,891", label: "notifications", used: 15891, included: 15891 },
    { icon: Smartphone, name: "In-App", count: "23,156", label: "messages shown", used: 23156, included: 23156 },
  ];

  return (
    <div
      className={`bg-card border border-border rounded-md p-4 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}
      role="region"
      aria-label="Communications usage"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Mail className="h-4 w-4 text-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Communications</h3>
      </div>

      {/* Main metric */}
      <div className="mb-1">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-light text-foreground tabular-nums">{totalMessages}</span>
          <span className="text-sm text-muted-foreground">total</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Messages and notifications this billing period
      </p>

      {/* Channel breakdown */}
      <div className="space-y-2.5 pt-4 border-t border-border">
        {channels.map((channel) => {
          const percentage = Math.min((channel.used / channel.included) * 100, 100);
          return (
            <div key={channel.name} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <channel.icon className="h-3.5 w-3.5" />
                  {channel.name}
                </span>
                <span className="text-foreground font-medium tabular-nums">{channel.count}</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    percentage >= 100 ? "bg-amber-500" : "bg-foreground"
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CommunicationsUsage;
