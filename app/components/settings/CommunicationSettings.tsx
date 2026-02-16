import { useState } from "react";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { toast } from "../../hooks/use-toast";

const CommunicationSettings = () => {
  const [settings, setSettings] = useState({
    sendOnTap: true,
    sendIfNoTap: false,
    reminderBeforeDelivery: false,
    reminder24h: true,
    reminder72h: false,
    reminder7d: false,
  });

  const handleToggle = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    toast({
      description: "Saved",
      duration: 1500,
    });
  };

  return (
    <div className="space-y-8">
      {/* Delivery Record Emails */}
      <div>
        <h3 className="text-base font-medium text-foreground mb-1">Delivery Records</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Automatically email customers their verification record.
        </p>
        
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="sendOnTap"
              checked={settings.sendOnTap}
              onCheckedChange={() => handleToggle("sendOnTap")}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="sendOnTap" className="text-sm font-medium text-foreground cursor-pointer">
                Send when customer taps
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Email the delivery record immediately after verification.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="sendIfNoTap"
              checked={settings.sendIfNoTap}
              onCheckedChange={() => handleToggle("sendIfNoTap")}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="sendIfNoTap" className="text-sm font-medium text-foreground cursor-pointer">
                Send even if not tapped
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Email the record when package is marked delivered by carrier.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tap Reminders */}
      <div>
        <h3 className="text-base font-medium text-foreground mb-1">Tap Reminders</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Remind customers to tap their package if they haven't yet.
        </p>
        
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="reminderBeforeDelivery"
              checked={settings.reminderBeforeDelivery}
              onCheckedChange={() => handleToggle("reminderBeforeDelivery")}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="reminderBeforeDelivery" className="text-sm font-medium text-foreground cursor-pointer">
                Before delivery
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Notify customer when package is out for delivery.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="reminder24h"
              checked={settings.reminder24h}
              onCheckedChange={() => handleToggle("reminder24h")}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="reminder24h" className="text-sm font-medium text-foreground cursor-pointer">
                24 hours after delivery
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                First reminder if customer hasn't tapped.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="reminder72h"
              checked={settings.reminder72h}
              onCheckedChange={() => handleToggle("reminder72h")}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="reminder72h" className="text-sm font-medium text-foreground cursor-pointer">
                3 days after delivery
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Follow-up reminder for unverified packages.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="reminder7d"
              checked={settings.reminder7d}
              onCheckedChange={() => handleToggle("reminder7d")}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="reminder7d" className="text-sm font-medium text-foreground cursor-pointer">
                7 days after delivery
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Final reminder before closing the verification window.
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default CommunicationSettings;
