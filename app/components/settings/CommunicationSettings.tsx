import { useState, useCallback } from "react";
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

  const toggle = <T extends Record<string, boolean>>(
    setter: React.Dispatch<React.SetStateAction<T>>,
    key: keyof T,
    label: string
  ) => {
    setter((prev) => {
      const newVal = !prev[key];
      toast({
        description: `${label} ${newVal ? "enabled" : "disabled"}`,
        duration: 1500,
      });
      return { ...prev, [key]: newVal };
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
              onToggle={() => toggle(setChannels, "email", "Email notifications")}
              title="Email"
              description="Send notifications via email."
            />
            <Divider />
            <ToggleRow
              checked={channels.sms}
              onToggle={() => toggle(setChannels, "sms", "SMS notifications")}
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
                toggle(setDelivery, "outForDelivery", "Out for delivery")
              }
              title="Out for delivery"
              description="Notify when carrier scan shows package is out for delivery."
            />
            <Divider />
            <ToggleRow
              checked={delivery.delivered}
              onToggle={() =>
                toggle(setDelivery, "delivered", "Delivered notification")
              }
              title="Delivered"
              description="Notify when carrier confirms delivery. Includes tap instructions."
            />
            <Divider />
            <ToggleRow
              checked={delivery.deliveryConfirmed}
              onToggle={() =>
                toggle(setDelivery, "deliveryConfirmed", "Delivery confirmed")
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
              onToggle={() => toggle(setReminders, "hours4", "4-hour reminder")}
              title="4 hours after delivery"
              description="First reminder."
            />
            <Divider />
            <ToggleRow
              checked={reminders.hours24}
              onToggle={() =>
                toggle(setReminders, "hours24", "24-hour reminder")
              }
              title="24 hours after delivery"
              description="Second reminder."
            />
            <Divider />
            <ToggleRow
              checked={reminders.hours48}
              onToggle={() =>
                toggle(setReminders, "hours48", "48-hour reminder")
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
                toggle(setReturnReminders, "days7", "7-day return reminder")
              }
              title="7 days before return window closes"
              description="Early reminder. Includes return link."
            />
            <Divider />
            <ToggleRow
              checked={returnReminders.hours48}
              onToggle={() =>
                toggle(setReturnReminders, "hours48", "48-hour return reminder")
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
            }}
            options={[
              { label: "14 days", value: "14" },
              { label: "30 days", value: "30" },
              { label: "45 days", value: "45" },
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
