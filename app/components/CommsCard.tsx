import { useEffect } from "react";
import { Link } from "react-router";
import { useFetcher } from "react-router";
import { Mail, MessageSquare, Loader2 } from "lucide-react";

// The dashboard Communications card — REAL state only (the merchant's actual
// notification_settings via /app/api/dashboard/comms). Replaces the old
// CommunicationsUsage card, which rendered 48,726 fictional messages.

type CommsSettings = {
  channels?: { email?: boolean; sms?: boolean };
  delivery?: Record<string, boolean>;
  reminders?: Record<string, boolean>;
} | null;

const CommsCard = () => {
  const fetcher = useFetcher<{ settings: CommsSettings }>();

  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.load("/app/api/dashboard/comms");
    }
  }, [fetcher]);

  const isLoading = fetcher.state === "loading" || !fetcher.data;
  const s = fetcher.data?.settings;
  const emailOn = s?.channels?.email !== false; // default-on mirrors settings
  const smsOn = s?.channels?.sms === true;

  const Row = ({
    icon: Icon,
    label,
    on,
  }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    on: boolean;
  }) => (
    <div className="flex items-center justify-between text-sm py-1.5">
      <span className="text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-sm ${
          on ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"
        }`}
      >
        {on ? "On" : "Off"}
      </span>
    </div>
  );

  return (
    <div className="relative bg-card border border-border rounded-sm p-5">
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-sm">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground mb-1">Communications</p>
      <p className="text-xs text-muted-foreground mb-2">
        Shipping and delivery updates, sent in your brand's name.
      </p>
      <div className="divide-y divide-border">
        <Row icon={Mail} label="Email notifications" on={emailOn} />
        <Row icon={MessageSquare} label="Text notifications" on={smsOn} />
      </div>
      <Link
        to="/app/settings"
        className="mt-3 inline-block text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Manage in Settings →
      </Link>
    </div>
  );
};

export default CommsCard;
