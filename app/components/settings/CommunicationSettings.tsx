import { useState, useEffect } from "react";
import {
  BlockStack,
  Card,
  Text,
  InlineStack,
  Checkbox,
  Select,
  Divider,
  Layout,
} from "@shopify/polaris";
import { toast } from "../../hooks/use-toast";

// ─── API helpers ─────────────────────────────────────────────────────────────
const SHOPIFY_APP_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : "";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}

async function fetchNotificationSettings() {
  try {
    const token = getToken();
    if (!token) return { error: { message: "Not authenticated" } };
    const res = await fetch(`${SHOPIFY_APP_URL}/app/api/settings/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { error: { message: "Failed to load" } };
    return { data: await res.json() };
  } catch (e: any) {
    return { error: { message: e.message } };
  }
}

async function updateNotificationSettings(payload: any) {
  try {
    const token = getToken();
    if (!token) return { error: { message: "Not authenticated" } };
    const res = await fetch(`${SHOPIFY_APP_URL}/app/api/settings/notifications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { error: { message: "Failed to save" } };
    return { data: await res.json() };
  } catch (e: any) {
    return { error: { message: e.message } };
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const CommunicationSettings = () => {
  const [channels, setChannels] = useState({ email: true, sms: false });
  const [delivery, setDelivery] = useState({
    outForDelivery: true,
    delivered: true,
    deliveryConfirmed: false,
  });
  const [reminders, setReminders] = useState({
    hours4: true,
    hours24: true,
    hours48: false,
  });
  const [returnReminders, setReturnReminders] = useState({
    days7: true,
    hours48: false,
  });
  const [returnWindow, setReturnWindow] = useState("30");

  // ── Load settings from Firestore on mount ────────────────────────────────
  useEffect(() => {
    let mounted = true;
    fetchNotificationSettings().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        // Silently fall back to defaults — don't interrupt the page load
        console.warn("[CommunicationSettings] Could not load settings:", error.message);
      } else if (data?.settings) {
        setChannels(data.settings.channels ?? { email: true, sms: false });
        setDelivery(data.settings.delivery ?? { outForDelivery: true, delivered: true, deliveryConfirmed: false });
        setReminders(data.settings.reminders ?? { hours4: true, hours24: true, hours48: false });
        setReturnReminders(data.settings.returnReminders ?? { days7: true, hours48: false });
        setReturnWindow(data.settings.returnWindow ?? "30");
      }
    });
    return () => { mounted = false; };
  }, []);

  // ── Save full settings payload to backend ────────────────────────────────
  const saveSettings = async (overrides: object) => {
    const newSettings = {
      channels,
      delivery,
      reminders,
      returnReminders,
      returnWindow,
      ...overrides,
    };
    const { error } = await updateNotificationSettings(newSettings);
    if (error) {
      toast({ description: "Failed to save settings", variant: "destructive", duration: 2000 });
    }
  };

  const toggle = <T extends Record<string, boolean>>(
    setter: React.Dispatch<React.SetStateAction<T>>,
    stateProp: "channels" | "delivery" | "reminders" | "returnReminders",
    key: keyof T,
    label: string
  ) => {
    setter((prev) => {
      const newVal = !prev[key];
      const updatedState = { ...prev, [key]: newVal };
      toast({
        description: `${label} ${newVal ? "enabled" : "disabled"}`,
        duration: 1500,
      });
      saveSettings({ [stateProp]: updatedState });
      return updatedState;
    });
  };

  const ToggleRow = ({
    checked,
    onToggle,
    title,
    description,
  }: {
    checked: boolean;
    onToggle: () => void;
    title: string;
    description: string;
  }) => (
    <InlineStack align="space-between" blockAlign="start" wrap={false}>
      <BlockStack gap="100">
        <Text as="p" variant="bodySm" fontWeight="medium">{title}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{description}</Text>
      </BlockStack>
      <Checkbox label="" checked={checked} onChange={onToggle} />
    </InlineStack>
  );

  return (
    <Layout>
      <Layout.AnnotatedSection
        title="Notification Channel"
        description="How customers receive notifications about their deliveries."
      >
        <Card>
          <BlockStack gap="400">
            <ToggleRow
              checked={channels.email}
              onToggle={() => toggle(setChannels, "channels", "email", "Email notifications")}
              title="Email"
              description="Send notifications via email."
            />
            <Divider />
            <ToggleRow
              checked={channels.sms}
              onToggle={() => toggle(setChannels, "channels", "sms", "SMS notifications")}
              title="SMS"
              description="Send notifications via text message."
            />
            <Text as="p" tone="subdued" variant="bodySm">
              Requires customer phone number from Shopify order.
            </Text>
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>

      <Layout.AnnotatedSection
        title="Delivery Notifications"
        description="Messages sent to customers during the delivery process."
      >
        <Card>
          <BlockStack gap="400">
            <ToggleRow
              checked={delivery.outForDelivery}
              onToggle={() =>
                toggle(setDelivery, "delivery", "outForDelivery", "Out for delivery")
              }
              title="Out for delivery"
              description="Notify when carrier scan shows package is out for delivery."
            />
            <Divider />
            <ToggleRow
              checked={delivery.delivered}
              onToggle={() =>
                toggle(setDelivery, "delivery", "delivered", "Delivered notification")
              }
              title="Delivered"
              description="Notify when carrier confirms delivery. Includes tap instructions."
            />
            <Divider />
            <ToggleRow
              checked={delivery.deliveryConfirmed}
              onToggle={() =>
                toggle(setDelivery, "delivery", "deliveryConfirmed", "Delivery confirmed")
              }
              title="Delivery confirmed"
              description="Confirmation sent after customer taps."
            />
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>

      <Layout.AnnotatedSection
        title="Tap Reminders"
        description="Sent if the customer hasn't tapped. Reminders stop once the customer taps."
      >
        <Card>
          <BlockStack gap="400">
            <ToggleRow
              checked={reminders.hours4}
              onToggle={() => toggle(setReminders, "reminders", "hours4", "4-hour reminder")}
              title="4 hours after delivery"
              description="First reminder."
            />
            <Divider />
            <ToggleRow
              checked={reminders.hours24}
              onToggle={() =>
                toggle(setReminders, "reminders", "hours24", "24-hour reminder")
              }
              title="24 hours after delivery"
              description="Second reminder."
            />
            <Divider />
            <ToggleRow
              checked={reminders.hours48}
              onToggle={() =>
                toggle(setReminders, "reminders", "hours48", "48-hour reminder")
              }
              title="48 hours after delivery"
              description="Final tap reminder."
            />
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>

      <Layout.AnnotatedSection
        title="Return Window Reminders"
        description="Sent to verified customers as their return window approaches closing."
      >
        <Card>
          <BlockStack gap="400">
            <ToggleRow
              checked={returnReminders.days7}
              onToggle={() =>
                toggle(setReturnReminders, "returnReminders", "days7", "7-day return reminder")
              }
              title="7 days before return window closes"
              description="Early reminder. Includes return link."
            />
            <Divider />
            <ToggleRow
              checked={returnReminders.hours48}
              onToggle={() =>
                toggle(setReturnReminders, "returnReminders", "hours48", "48-hour return reminder")
              }
              title="48 hours before return window closes"
              description='"Your return window closes in 2 days."'
            />
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>

      <Layout.AnnotatedSection
        title="Return Window"
        description="How long customers have to initiate a return after delivery."
      >
        <Card>
          <Select
            label=""
            labelHidden
            value={returnWindow}
            onChange={(v) => {
              setReturnWindow(v);
              toast({
                description: `Return window set to ${v} days`,
                duration: 1500,
              });
              saveSettings({ returnWindow: v });
            }}
            options={[
              { label: "14 days", value: "14" },
              { label: "30 days", value: "30" },
              { label: "60 days", value: "60" },
              { label: "90 days", value: "90" },
            ]}
          />
        </Card>
      </Layout.AnnotatedSection>
    </Layout>
  );
};

export default CommunicationSettings;
