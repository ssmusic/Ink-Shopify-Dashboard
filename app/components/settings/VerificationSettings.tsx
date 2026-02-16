import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { toast } from "../../hooks/use-toast";

const VerificationSettings = () => {
  const [autoVerifyDistance, setAutoVerifyDistance] = useState(100);
  const [phoneVerifyMin, setPhoneVerifyMin] = useState(100);
  const [phoneVerifyMax, setPhoneVerifyMax] = useState(300);
  const [requirePhoneVerification, setRequirePhoneVerification] = useState(true);
  const [sendSmsReminder, setSendSmsReminder] = useState(true);

  const handleSave = () => {
    toast({
      title: "Settings saved",
      description: "Your verification settings have been updated.",
    });
  };

  return (
    <div className="space-y-8">
      {/* Section 1: GPS Distance Thresholds */}
      <div>
        <h2 className="text-lg font-medium text-foreground pb-4 border-b border-border mb-4">
          GPS Distance Thresholds
        </h2>

        <div className="space-y-6 max-w-lg">
          {/* Auto-verify distance */}
          <div>
            <Label className="text-sm font-medium text-muted-foreground mb-2 block">
              Auto-verify distance (no phone required)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={autoVerifyDistance}
                onChange={(e) => setAutoVerifyDistance(Number(e.target.value))}
                className="w-24 border-border"
              />
              <span className="text-muted-foreground">meters</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Deliveries within this distance are auto-verified
            </p>
          </div>

          {/* Phone verification required */}
          <div>
            <Label className="text-sm font-medium text-muted-foreground mb-2 block">
              Phone verification required
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={phoneVerifyMin}
                onChange={(e) => setPhoneVerifyMin(Number(e.target.value))}
                className="w-24 border-border"
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="number"
                value={phoneVerifyMax}
                onChange={(e) => setPhoneVerifyMax(Number(e.target.value))}
                className="w-24 border-border"
              />
              <span className="text-muted-foreground">meters</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Customer must verify phone number
            </p>
          </div>

          {/* Flag for review */}
          <div>
            <Label className="text-sm font-medium text-muted-foreground mb-2 block">
              Flag for review
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={`> ${phoneVerifyMax} meters`}
                disabled
                className="w-40 border-border bg-card disabled:opacity-100"
              />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Requires manual merchant review
            </p>
          </div>
        </div>
      </div>

      {/* Section 2: Phone Verification */}
      <div>
        <h2 className="text-lg font-medium text-foreground pb-4 border-b border-border mb-4">
          Phone Verification
        </h2>

        <div className="space-y-4">
          {/* Checkbox 1 */}
          <div className="flex items-start gap-3">
            <Checkbox
              id="requirePhone"
              checked={requirePhoneVerification}
              onCheckedChange={(checked: boolean | "indeterminate") => setRequirePhoneVerification(checked === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="requirePhone"
              className="text-foreground cursor-pointer leading-tight"
            >
              Require phone last 4 verification for deliveries beyond GPS threshold
            </Label>
          </div>

          {/* Checkbox 2 */}
          <div className="flex items-start gap-3">
            <Checkbox
              id="smsReminder"
              checked={sendSmsReminder}
              onCheckedChange={(checked: boolean | "indeterminate") => setSendSmsReminder(checked === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="smsReminder"
              className="text-foreground cursor-pointer leading-tight"
            >
              Send SMS reminder if customer hasn't tapped within 24 hours
            </Label>
          </div>
        </div>
      </div>

      {/* Save Button - full-width on mobile */}
      <div className="pt-4">
        <Button
          onClick={handleSave}
          className="w-full sm:w-auto sm:ml-auto sm:block bg-foreground text-background hover:bg-foreground/90"
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default VerificationSettings;
