import { useEffect, useState } from "react";
import { Layout, Card, BlockStack, Text, Checkbox } from "@shopify/polaris";
import { toast } from "../hooks/use-toast";

// The one Shopify-side switch that lived under Settings → Delivery: whether
// "Track your shipment" lands on the brand's order page. Copy and behaviour
// are the old DeliveryModeSettings' second section, unchanged; the first
// section — a card explaining a carrier service that no longer registers — is
// gone with the carrier service.

async function fetchSecure(path: string, options: RequestInit = {}) {
  const appUrl = window.location.origin;
  let token = "";
  try {
    // @ts-ignore — App Bridge global
    token = await window.shopify?.idToken();
  } catch (e) {
    console.warn("Could not retrieve Shopify session token", e);
  }
  if (!token && localStorage.getItem("token")) token = localStorage.getItem("token") || "";
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${appUrl}${path}`, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    let errMessage = `Error: ${response.status}`;
    if (contentType.includes("application/json")) {
      const errData = await response.json();
      errMessage = errData.error || errMessage;
    }
    throw new Error(errMessage);
  }
  if (contentType.includes("application/json")) return response.json();
  return null;
}

const TrackingLinkSettings = () => {
  // ON for every merchant unless they turn it off here — so this starts true
  // and only a loaded `false` moves it.
  const [trackingLink, setTrackingLink] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSecure("/app/api/settings/branded-tracking-link")
      .then((res) => { if (res && typeof res.enabled === "boolean") setTrackingLink(res.enabled); })
      .catch((err) => console.error("Failed to load tracking link setting:", err));
  }, []);

  const save = async (enabled: boolean) => {
    const previous = trackingLink;
    setTrackingLink(enabled); // optimistic — a toggle that lags feels broken
    setSaving(true);
    try {
      await fetchSecure("/app/api/settings/branded-tracking-link", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      toast({ title: enabled ? "Tracking links point to your page" : "Tracking links point to the carrier", duration: 2500 });
    } catch (err: any) {
      setTrackingLink(previous); // say so, don't keep a lie on screen
      toast({ title: "Couldn't save that", description: err.message, variant: "destructive", duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout.AnnotatedSection
      title="Tracking link"
      description="Where your customer lands when they click “Track your shipment”."
    >
      <Card>
        <BlockStack gap="400">
          <Checkbox
            label="Send tracking clicks to your order page"
            helpText={
              "Your order page answers when the package is arriving, and it stays yours. " +
              "The carrier name and tracking number are still shown, and still link to the carrier."
            }
            checked={trackingLink}
            disabled={saving}
            onChange={save}
          />
          <Text as="p" tone="subdued" variant="bodySm">
            This applies to the tracking link on the order page in your admin, in the
            shipping-confirmation email, and on your customer’s order-status page. Orders shipped
            with a carrier we can’t follow keep Shopify’s own tracking link, so no customer is
            ever sent to a page that can’t tell them anything.
          </Text>
        </BlockStack>
      </Card>
    </Layout.AnnotatedSection>
  );
};

export default TrackingLinkSettings;
