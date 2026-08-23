import { useState, useEffect, useCallback } from "react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineStack,
  Layout,
  Link,
  List,
  Select,
  Text,
} from "@shopify/polaris";
import { toast } from "../../hooks/use-toast";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  TEMPLATE_KEYS,
  type NotificationSettings,
  type TemplateKey,
} from "../../services/notification-settings";

// ─── API helpers ─────────────────────────────────────────────────────────────
// App-Bridge-aware, mirroring DeliveryModeSettings/BrandingSettings. The old
// version read localStorage["token"] ONLY — a key nothing in the embed ever
// writes — so inside Shopify admin every load fell back to hardcoded defaults
// and every save toasted "Failed to save settings" (audit 2026-08-07).
async function secureFetch(path: string, options: RequestInit = {}) {
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  let token = "";
  try {
    // @ts-ignore — App Bridge global
    token = (await window.shopify?.idToken()) || "";
  } catch (e) {
    console.warn("Could not retrieve Shopify session token", e);
  }
  if (!token && typeof window !== "undefined") {
    token = localStorage.getItem("token") || "";
  }
  if (!token) return { error: { message: "Not authenticated" } };

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  try {
    const res = await fetch(`${appUrl}${path}`, { ...options, headers });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { error: { message: data?.error || `Error ${res.status}` } };
    }
    return { data };
  } catch (e: any) {
    return { error: { message: e.message } };
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// THE ONE LINE. Reassigns the variable Shopify's own buttons already use, so
// every "View your order" in that template resolves to the brand's page. Same
// approach AfterShip and Malomo ship to merchants, because no Shopify API can
// edit a notification template — verified against Shopify's docs 2026-08-07.
//
// IT IS NO LONGER A CONSTANT. The server builds it per brand
// (`notification-snippet.ts`), because the line needs the merchant's own
// subdomain and because the old hardcoded version read
// `fulfillment.tracking_url` — blank on order confirmation forever, and ~600ms
// behind the shipping email by construction. This fallback is what renders
// before the fetch lands; it is the neutral www host, never a guessed one.
import { notificationSnippet } from "../../services/notification-snippet";

const FALLBACK_SNIPPET = notificationSnippet(null);

const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  order_confirmation: "Order confirmation",
  shipping_confirmation: "Shipping confirmation",
  shipping_update: "Shipping update",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

const CommunicationSettings = ({ shopDomain }: { shopDomain?: string }) => {
  const [settings, setSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  // The brand-specific line, built server-side. Starts on the neutral www
  // fallback so the card is never blank and never shows a guessed host.
  const [snippet, setSnippet] = useState<string>(FALLBACK_SNIPPET);
  const [loaded, setLoaded] = useState(false);
  // THE FLIP — the half of this page that needs no merchant work at all.
  // `canFlip` is false until the store has a brand page to point at; the row
  // says so instead of offering a switch that would write a broken door.
  const [door, setDoor] = useState<{ on: boolean; door: string | null; canFlip: boolean }>({
    on: true,
    door: null,
    canFlip: false,
  });
  const [doorSaving, setDoorSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    secureFetch("/app/api/settings/notifications").then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        console.warn("[CommunicationSettings] Could not load settings:", error.message);
      } else if (data?.settings) {
        setSettings(data.settings);
      }
      if (data?.snippet) setSnippet(data.snippet);
      setLoaded(true);
    });
    secureFetch("/app/api/settings/order-door").then(({ data, error }) => {
      if (!mounted || error || !data) return;
      setDoor({
        on: data.on !== false,
        door: data.door ?? null,
        canFlip: Boolean(data.canFlip),
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Save from the NEXT state, never the closure's — a second toggle before
  // React re-rendered used to write a stale sibling group.
  const persist = useCallback(async (next: NotificationSettings, failMsg: string) => {
    const { data, error } = await secureFetch("/app/api/settings/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (error) {
      toast({ description: error.message || failMsg, variant: "destructive", duration: 3000 });
      return false;
    }
    if (data?.settings) setSettings(data.settings);
    return true;
  }, []);

  const toggle = (
    group: "channels" | "delivery" | "returnReminders",
    key: string,
    label: string,
  ) => {
    setSettings((prev) => {
      const groupState = prev[group] as Record<string, boolean>;
      const newVal = !groupState[key];
      const next = { ...prev, [group]: { ...groupState, [key]: newVal } };
      toast({ description: `${label} ${newVal ? "enabled" : "disabled"}`, duration: 1500 });
      persist(next, "Failed to save settings");
      return next;
    });
  };

  const markTemplate = (key: TemplateKey) => {
    setSettings((prev) => {
      const done = Boolean(prev.templatesPastedAt[key]);
      const next = {
        ...prev,
        templatesPastedAt: {
          ...prev.templatesPastedAt,
          [key]: done ? null : new Date().toISOString(),
        },
      };
      persist(next, "Couldn't record that");
      return next;
    });
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      toast({ description: "Copied. Paste it as a new first line.", duration: 2500 });
    } catch {
      toast({ description: "Couldn't copy — select the line and copy it manually.", variant: "destructive" });
    }
  };

  const ToggleRow = ({
    checked,
    onToggle,
    title,
    description,
    disabled,
    suffix,
  }: {
    checked: boolean;
    onToggle: () => void;
    title: string;
    description: string;
    disabled?: boolean;
    suffix?: React.ReactNode;
  }) => (
    <InlineStack align="space-between" blockAlign="start" wrap={false} gap="400">
      {/* `align="start"` on the inner stack matters: without it the badge
          drifts to the far right and reads as a label on the CHECKBOX rather
          than on the row it qualifies (caught rendering the page, not in
          review). */}
      <BlockStack gap="100">
        <InlineStack gap="200" blockAlign="center" align="start">
          <Text as="p" variant="bodySm" fontWeight="medium">{title}</Text>
          {suffix}
        </InlineStack>
        <Text as="p" tone="subdued" variant="bodySm">{description}</Text>
      </BlockStack>
      <Checkbox label="" checked={checked} onChange={onToggle} disabled={disabled} />
    </InlineStack>
  );

  // The brand host alone — never the door base with its dangling /o/.
  const doorHost = (() => {
    try {
      return door.door ? new URL(door.door).host : null;
    } catch {
      return null;
    }
  })();

  // Apply-first on the server: a failure means Shopify did NOT change, so the
  // switch must not move either.
  const flipDoor = async () => {
    const next = !door.on;
    setDoorSaving(true);
    const { data, error } = await secureFetch("/app/api/settings/order-door", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on: next }),
    });
    setDoorSaving(false);
    if (error) {
      toast({ description: error.message, variant: "destructive", duration: 4000 });
      return;
    }
    setDoor((d) => ({ ...d, on: next, door: data?.door ?? d.door }));
    toast({
      description: next ? "Your page is on the order status page." : "Turned off.",
      duration: 2000,
    });
  };

  const templatesDone = TEMPLATE_KEYS.filter((k) => settings.templatesPastedAt[k]).length;
  const notificationsUrl = shopDomain
    ? `https://admin.shopify.com/store/${shopDomain.replace(".myshopify.com", "")}/settings/notifications`
    : "https://admin.shopify.com";

  return (
    <Layout>
      {/* ── The half that needs no merchant work ───────────────────────── */}
      <Layout.AnnotatedSection
        title="The order status page"
        description="Every button in Shopify's emails opens it. This puts your page there."
      >
        <Card>
          <BlockStack gap="400">
            <ToggleRow
              checked={door.on && door.canFlip}
              onToggle={flipDoor}
              disabled={!door.canFlip || doorSaving}
              title="Show your page"
              description={
                !door.canFlip
                  ? "Connect this store to ink first — then this turns on."
                  : door.on
                    ? // The HOST, never the door base: a merchant reading
                      // "a link to https://brand.in.ink/o/" sees a dangling
                      // URL no buyer is ever sent to. Each buyer gets their
                      // own order appended to it.
                      `Every buyer gets a link to their order on ${doorHost ?? "your page"}.`
                    : "Off. The order status page shows nothing from you."
              }
              suffix={
                door.canFlip && door.on ? <Badge tone="success">On</Badge> : undefined
              }
            />
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>

      {/* ── The one merchant action that isn't automatic ───────────────── */}
      <Layout.AnnotatedSection
        title="Your page in Shopify's emails"
        description="Shopify already links to your page from the tracking number on every shipment. This makes it the main button too."
      >
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="200" blockAlign="center">
              <Text as="p" variant="bodySm" fontWeight="medium">
                Add one line to five email templates
              </Text>
              <Badge tone={templatesDone === TEMPLATE_KEYS.length ? "success" : "attention"}>
                {`${templatesDone} of ${TEMPLATE_KEYS.length} done`}
              </Badge>
            </InlineStack>

            <Text as="p" tone="subdued" variant="bodySm">
              Shopify doesn&apos;t let apps edit these templates, so this part is yours —
              about thirty seconds each.
            </Text>

            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
              <BlockStack gap="200">
                {/* The snippet must stay COPYABLE and readable, so it never
                    breaks mid-identifier (`fulfillment.trac / king_url` — what
                    break-all did). It scrolls sideways inside its own box
                    instead; a merchant copies with the button, not by hand. */}
                <div style={{ overflowX: "auto", maxWidth: "100%" }}>
                  <code
                    style={{
                      fontFamily: "monospace",
                      fontSize: "12px",
                      whiteSpace: "pre",
                      display: "block",
                    }}
                  >
                    {snippet}
                  </code>
                </div>
                <InlineStack gap="200">
                  <Button onClick={copySnippet}>Copy the line</Button>
                  <Button url={notificationsUrl} target="_blank" variant="plain">
                    Open Shopify notifications
                  </Button>
                </InlineStack>
              </BlockStack>
            </Box>

            <List type="number">
              <List.Item>Open the template, then click <b>Edit code</b>.</List.Item>
              <List.Item>
                Put the cursor at the very top and press Enter to make a blank first line —
                <b> don&apos;t replace the line that&apos;s already there</b>. Overwriting it
                breaks the template and Shopify refuses to save.
              </List.Item>
              <List.Item>Paste the line, then Save.</List.Item>
            </List>

            <Divider />

            <Text as="p" tone="subdued" variant="bodySm">
              Tick each one as you go. We can&apos;t read your templates, so this list is
              your own record.
            </Text>

            <BlockStack gap="300">
              {TEMPLATE_KEYS.map((key) => (
                <ToggleRow
                  key={key}
                  checked={Boolean(settings.templatesPastedAt[key])}
                  onToggle={() => markTemplate(key)}
                  title={TEMPLATE_LABELS[key]}
                  description={
                    settings.templatesPastedAt[key]
                      ? `Marked done ${new Date(settings.templatesPastedAt[key]!).toLocaleDateString()}`
                      : "Not done yet."
                  }
                />
              ))}
            </BlockStack>
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>

      <Layout.AnnotatedSection
        title="Notification Channel"
        description="How customers receive notifications about their deliveries."
      >
        <Card>
          <BlockStack gap="400">
            <ToggleRow
              checked={settings.channels.email}
              onToggle={() => toggle("channels", "email", "Email notifications")}
              title="Email"
              description="Send notifications by email."
            />
            <Divider />
            <ToggleRow
              checked={false}
              onToggle={() => {}}
              disabled
              title="SMS"
              suffix={<Badge>Pending verification</Badge>}
              description="Our sending number is going through carrier verification. Text notifications turn on here once it clears."
            />
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
              checked={settings.delivery.outForDelivery}
              onToggle={() => toggle("delivery", "outForDelivery", "Out for delivery")}
              title="Out for delivery"
              description="Sent when a carrier scan shows the package is out for delivery."
            />
            <Divider />
            <ToggleRow
              checked={settings.delivery.delivered}
              onToggle={() => toggle("delivery", "delivered", "Delivered notification")}
              title="Delivered"
              description="Sent when the carrier confirms delivery. Carries the link to their page."
            />
            <Divider />
            <ToggleRow
              checked={settings.delivery.deliveryConfirmed}
              onToggle={() => toggle("delivery", "deliveryConfirmed", "Delivery confirmed")}
              title="Delivery confirmed"
              description="Sent after the customer opens their page."
            />
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>

      {/* Kept visible, plainly marked: the toggles round-trip but nothing
          sends them yet — the scheduler is its own build. Showing them ON
          while nothing sends is the exact dishonesty this page had. */}
      <Layout.AnnotatedSection
        title="Return Window Reminders"
        description="Sent as a customer's return window approaches closing."
      >
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="200" blockAlign="center">
              <Badge>Coming soon</Badge>
              <Text as="p" tone="subdued" variant="bodySm">
                Not sending yet.
              </Text>
            </InlineStack>
            <ToggleRow
              checked={settings.returnReminders.days7}
              onToggle={() => {}}
              disabled
              title="7 days before the window closes"
              description="Early reminder, with the return link."
            />
            <Divider />
            <ToggleRow
              checked={settings.returnReminders.hours48}
              onToggle={() => {}}
              disabled
              title="48 hours before the window closes"
              description="Last call."
            />
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>

      <Layout.AnnotatedSection
        title="Return Window"
        description="How long customers have to start a return after delivery. This sets the real window."
      >
        <Card>
          <Select
            label=""
            labelHidden
            disabled={!loaded}
            value={settings.returnWindow}
            onChange={(v) => {
              setSettings((prev) => {
                const next = { ...prev, returnWindow: v as NotificationSettings["returnWindow"] };
                persist(next, "Couldn't update the return window").then((ok) => {
                  if (ok) toast({ description: `Return window set to ${v} days`, duration: 1500 });
                });
                return next;
              });
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
