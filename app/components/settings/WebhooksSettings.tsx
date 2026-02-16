import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { toast } from "../../hooks/use-toast";
import { Eye, EyeOff, Check, AlertTriangle } from "lucide-react";
import { LiveRegion } from "../ui/live-region";

const mockActivityLog = [
  { id: 1, timestamp: "Feb 2, 11:40 AM", event: "Order #1064 verified", statusCode: 200 },
  { id: 2, timestamp: "Feb 2, 11:36 AM", event: "Order #1064 enrolled", statusCode: 200 },
  { id: 3, timestamp: "Feb 1, 3:25 PM", event: "Order #1063 verified", statusCode: 200 },
  { id: 4, timestamp: "Feb 1, 2:10 PM", event: "Order #1062 verified", statusCode: 200 },
  { id: 5, timestamp: "Jan 31, 4:45 PM", event: "Order #1061 enrolled", statusCode: 201 },
  { id: 6, timestamp: "Jan 31, 11:20 AM", event: "Order #1060 verified", statusCode: 500 },
  { id: 7, timestamp: "Jan 30, 3:15 PM", event: "Order #1059 verified", statusCode: 200 },
  { id: 8, timestamp: "Jan 30, 10:30 AM", event: "Order #1058 enrolled", statusCode: 404 },
];

const WebhooksSettings = () => {
  const [webhookUrl, setWebhookUrl] = useState("https://api.in.ink/shopify/webhook");
  const [hmacSecret, setHmacSecret] = useState("sk_live_abc123xyz789");
  const [showSecret, setShowSecret] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const handleTestWebhook = async () => {
    setIsTesting(true);
    setAnnouncement("Testing webhook connection...");
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsTesting(false);
    setAnnouncement("Webhook test successful. Received 200 OK response.");
    toast({
      title: "Webhook test successful",
      description: "Received 200 OK response from endpoint.",
    });
  };

  const handleRegenerate = () => {
    const newSecret = `sk_live_${Math.random().toString(36).substring(2, 15)}`;
    setHmacSecret(newSecret);
    setAnnouncement("HMAC secret regenerated. Update your backend integration.");
    toast({
      title: "Secret regenerated",
      description: "Remember to update your backend integration.",
      variant: "destructive",
    });
  };

  const handleSave = () => {
    setAnnouncement("Settings saved successfully.");
    toast({
      title: "Settings saved",
      description: "Your webhook settings have been updated.",
    });
  };

  const getStatusCodeColor = (code: number) => {
    if (code >= 200 && code < 300) return "text-success";
    if (code >= 400 && code < 500) return "text-warning";
    if (code >= 500) return "text-destructive";
    return "text-muted-foreground";
  };

  const getStatusCodeLabel = (code: number) => {
    if (code >= 200 && code < 300) return "Success";
    if (code >= 400 && code < 500) return "Client error";
    if (code >= 500) return "Server error";
    return "Unknown";
  };

  return (
    <div className="space-y-8">
      {/* Screen reader announcements */}
      <LiveRegion message={announcement} />

      {/* Section: Backend Integration */}
      <section aria-labelledby="backend-integration-heading">
        <h2 
          id="backend-integration-heading"
          className="text-lg font-medium text-foreground pb-4 border-b border-border mb-4"
        >
          Backend Integration
        </h2>

        <div className="space-y-6 max-w-2xl">
          {/* Webhook URL */}
          <div>
            <Label 
              htmlFor="webhook-url"
              className="text-sm font-medium text-muted-foreground mb-2 block"
            >
              Webhook URL
              <span className="text-destructive ml-1" aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id="webhook-url"
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://api.in.ink/shopify/webhook"
                className="flex-1 border-border"
                aria-required="true"
                aria-describedby="webhook-url-hint"
              />
              <Button
                variant="outline"
                onClick={handleTestWebhook}
                disabled={isTesting}
                className="whitespace-nowrap"
                aria-busy={isTesting}
              >
                {isTesting ? "Testing..." : "Test Webhook"}
              </Button>
            </div>
            <p id="webhook-url-hint" className="sr-only">
              Enter the URL where webhook events will be sent
            </p>
          </div>

          {/* HMAC Secret */}
          <div>
            <Label 
              htmlFor="hmac-secret"
              className="text-sm font-medium text-muted-foreground mb-2 block"
            >
              HMAC Secret
              <span className="text-destructive ml-1" aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </Label>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Input
                  id="hmac-secret"
                  type={showSecret ? "text" : "password"}
                  value={hmacSecret}
                  onChange={(e) => setHmacSecret(e.target.value)}
                  className="pr-10 border-border"
                  aria-required="true"
                  aria-describedby="hmac-secret-warning"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showSecret ? "Hide HMAC secret" : "Show HMAC secret"}
                  aria-pressed={showSecret}
                >
                  {showSecret ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              <Button
                variant="outline"
                onClick={handleRegenerate}
                className="whitespace-nowrap text-destructive hover:text-destructive"
                aria-describedby="hmac-secret-warning"
              >
                Regenerate
              </Button>
            </div>
            <p id="hmac-secret-warning" className="text-sm text-muted-foreground mt-1">
              <span aria-hidden="true">⚠</span> Warning: Regenerating will break existing integrations
            </p>
          </div>

          {/* Status Indicator */}
          <div className="pt-2" role="status" aria-live="polite">
            {isConnected ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-success">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  <span className="font-medium">Status: Connected</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Last successful delivery: 2 minutes ago
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-warning">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  <span className="font-medium">Status: Connection Failed</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Unable to reach webhook endpoint
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Save Button - full-width on mobile */}
        <div className="pt-6">
          <Button
            onClick={handleSave}
            className="w-full sm:w-auto sm:ml-auto sm:block bg-foreground text-background hover:bg-foreground/90"
          >
            Save Changes
          </Button>
        </div>
      </section>

      {/* Section: Recent Webhook Activity */}
      <section aria-labelledby="webhook-activity-heading">
        <h2 
          id="webhook-activity-heading"
          className="text-lg font-medium text-foreground pb-4 border-b border-border mb-4"
        >
          Recent Webhook Activity
        </h2>

        <div className="space-y-2" role="log" aria-label="Webhook activity log">
          {mockActivityLog.map((activity) => (
            <div
              key={activity.id}
              className="flex items-center justify-between py-2 border-b border-border last:border-0"
            >
              <div className="flex items-center gap-3">
                <time 
                  className="text-sm text-muted-foreground min-w-[140px]"
                  dateTime={activity.timestamp}
                >
                  {activity.timestamp}
                </time>
                <span className="text-sm text-foreground">{activity.event}</span>
              </div>
              <span 
                className={`text-sm font-medium ${getStatusCodeColor(activity.statusCode)}`}
                aria-label={`Status code ${activity.statusCode}: ${getStatusCodeLabel(activity.statusCode)}`}
              >
                {activity.statusCode}
              </span>
            </div>
          ))}
        </div>

        <div className="pt-4">
          <button 
            className="text-sm text-muted-foreground hover:text-foreground underline"
            aria-label="View all webhook activity"
          >
            View All
          </button>
        </div>
      </section>
    </div>
  );
};

export default WebhooksSettings;
